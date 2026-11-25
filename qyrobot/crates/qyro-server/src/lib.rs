//! qyro-server — Single Daemon Server Types for Ed25519 QR Pairing (120s TTL),
//! Instant Device Revocation, 300s Fail-Closed Device Permissions, and Gapless last_event_id Resume (PRD §13).

use serde::{Deserialize, Serialize};

pub const PAIRING_TTL_SECONDS: u64 = 120;
pub const DEVICE_PERMISSION_FAIL_CLOSED_SECONDS: u64 = 300;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrPairingOffer {
    pub server_url: String,
    pub server_ed25519_pubkey: String,
    pub one_time_pairing_token: String,
    pub ttl_seconds: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DevicePermissionPolicy {
    Ask,
    AlwaysAllow,
    NeverAllow,
}

/// PRD §5: NotificationListenerService is permanently prohibited for Android privacy.
pub fn is_capability_allowed_by_policy(capability: &str) -> bool {
    matches!(capability, "calendar" | "contacts" | "location" | "alarms_timers")
}
