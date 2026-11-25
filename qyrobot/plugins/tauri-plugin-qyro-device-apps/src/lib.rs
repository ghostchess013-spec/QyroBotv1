//! Fail-closed Android Device Apps bridge (PRD v1.7.0 §5):
//! - Calendar: non-recurring events without external attendee invites
//! - Contacts: read-only lookup
//! - Location: coarse/fine one-shot fix
//! - Alarms/Timers: max 24 hours ahead
//! - NotificationListenerService is PERMANENTLY FORBIDDEN at compile & runtime.
//! - Every approval token expires after 300 seconds (fail-closed).

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

pub const PERMISSION_TTL_SECONDS: i64 = 300;
pub const MAX_ALARM_HORIZON_SECONDS: i64 = 86_400;

#[derive(Debug, Error)]
pub enum DeviceAppsError {
    #[error("NotificationListenerService is permanently forbidden by QyroBot PRD §5")]
    NotificationListenerForbidden,
    #[error("Calendar events via device-apps must be non-recurring and carry zero external invites")]
    CalendarConstraintViolated,
    #[error("Alarm/Timer horizon {0}s exceeds 24-hour maximum ({MAX_ALARM_HORIZON_SECONDS}s)")]
    AlarmHorizonExceeded(i64),
    #[error("Approval grant {0} expired (fail-closed 5-minute TTL)")]
    ApprovalExpired(Uuid),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceAppCapability {
    Calendar,
    Contacts,
    Location,
    AlarmsTimers,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarInsertRequest {
    pub title: String,
    pub start_epoch_ms: i64,
    pub end_epoch_ms: i64,
    pub recurring: bool,
    pub attendee_emails: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlarmRequest {
    pub label: String,
    pub trigger_in_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailClosedApprovalGrant {
    pub grant_id: Uuid,
    pub capability: DeviceAppCapability,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub approved: bool,
}

pub fn guard_forbidden_service(android_service_name: &str) -> Result<(), DeviceAppsError> {
    if android_service_name
        .to_ascii_lowercase()
        .contains("notificationlistener")
    {
        return Err(DeviceAppsError::NotificationListenerForbidden);
    }
    Ok(())
}

pub fn validate_calendar_insert(req: &CalendarInsertRequest) -> Result<(), DeviceAppsError> {
    if req.recurring || !req.attendee_emails.is_empty() || req.end_epoch_ms <= req.start_epoch_ms {
        return Err(DeviceAppsError::CalendarConstraintViolated);
    }
    Ok(())
}

pub fn validate_alarm_request(req: &AlarmRequest) -> Result<(), DeviceAppsError> {
    if req.trigger_in_seconds <= 0 || req.trigger_in_seconds > MAX_ALARM_HORIZON_SECONDS {
        return Err(DeviceAppsError::AlarmHorizonExceeded(
            req.trigger_in_seconds,
        ));
    }
    Ok(())
}

pub fn issue_pending_grant(capability: DeviceAppCapability) -> FailClosedApprovalGrant {
    let now = Utc::now();
    FailClosedApprovalGrant {
        grant_id: Uuid::new_v4(),
        capability,
        issued_at: now,
        expires_at: now + Duration::seconds(PERMISSION_TTL_SECONDS),
        approved: false,
    }
}

pub fn verify_grant_active(
    grant: &FailClosedApprovalGrant,
    now: DateTime<Utc>,
) -> Result<(), DeviceAppsError> {
    if !grant.approved || now > grant.expires_at {
        return Err(DeviceAppsError::ApprovalExpired(grant.grant_id));
    }
    Ok(())
}
