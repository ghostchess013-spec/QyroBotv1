//! Native Android Push plugin supporting UnifiedPush (`ntfy` / `Sunup`) with optional FCM fallback.
//! Carries only opaque wake hints (`last_event_id`) so sensitive content stays inside the encrypted server sync.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use url::Url;

#[derive(Debug, Error)]
pub enum PushPluginError {
    #[error("Push endpoint URL must be HTTPS: {0}")]
    InsecureEndpoint(String),
    #[error("Invalid push endpoint URL: {0}")]
    InvalidUrl(#[from] url::ParseError),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PushTransport {
    UnifiedPushNtfy,
    UnifiedPushSunup,
    FcmOptional,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushRegistration {
    pub device_id: String,
    pub transport: PushTransport,
    pub endpoint: String,
    pub registered_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpaqueWakeHint {
    pub last_event_id: i64,
    pub bot_id: Option<String>,
    pub priority: String,
}

pub fn validate_registration(
    device_id: impl Into<String>,
    transport: PushTransport,
    endpoint: &str,
) -> Result<PushRegistration, PushPluginError> {
    let parsed = Url::parse(endpoint)?;
    if parsed.scheme() != "https" {
        return Err(PushPluginError::InsecureEndpoint(endpoint.to_string()));
    }

    Ok(PushRegistration {
        device_id: device_id.into(),
        transport,
        endpoint: parsed.to_string(),
        registered_at: Utc::now(),
    })
}
