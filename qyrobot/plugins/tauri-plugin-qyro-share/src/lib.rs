//! Native Android Share Sheet bridge (`ACTION_SEND` / `ACTION_SEND_MULTIPLE`) for QyroBot.
//! Routes shared text, URLs, images, or files to the user's chosen bot or Chief of Staff.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum SharePluginError {
    #[error("Share payload is empty: provide text, url, or at least one attachment URI")]
    EmptyPayload,
    #[error("Attachment count {0} exceeds maximum batch limit of 16")]
    TooManyAttachments(usize),
    #[error("Unsupported intent action: {0}")]
    UnsupportedIntentAction(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ShareIntentAction {
    ActionSend,
    ActionSendMultiple,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedAttachment {
    pub content_uri: String,
    pub mime_type: String,
    pub display_name: Option<String>,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingSharePayload {
    pub share_id: Uuid,
    pub action: ShareIntentAction,
    pub mime_type: String,
    pub subject: Option<String>,
    pub text: Option<String>,
    pub url: Option<String>,
    pub attachments: Vec<SharedAttachment>,
    pub target_bot_id: Option<String>,
    pub received_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutedShareTask {
    pub share_id: Uuid,
    pub resolved_bot_id: String,
    pub summary: String,
    pub attachment_count: usize,
    pub routed_at: DateTime<Utc>,
}

pub const DEFAULT_FALLBACK_BOT_ID: &str = "chief-of-staff";
pub const MAX_SHARE_ATTACHMENTS: usize = 16;

pub fn validate_and_route_share(
    payload: IncomingSharePayload,
) -> Result<RoutedShareTask, SharePluginError> {
    let has_text = payload
        .text
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let has_url = payload
        .url
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if !has_text && !has_url && payload.attachments.is_empty() {
        return Err(SharePluginError::EmptyPayload);
    }
    if payload.attachments.len() > MAX_SHARE_ATTACHMENTS {
        return Err(SharePluginError::TooManyAttachments(
            payload.attachments.len(),
        ));
    }

    let resolved_bot_id = payload
        .target_bot_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .unwrap_or(DEFAULT_FALLBACK_BOT_ID)
        .to_string();

    let summary = payload
        .subject
        .or(payload.url)
        .or_else(|| payload.text.map(|t| t.chars().take(120).collect()))
        .unwrap_or_else(|| format!("{} shared file(s)", payload.attachments.len()));

    Ok(RoutedShareTask {
        share_id: payload.share_id,
        resolved_bot_id,
        summary,
        attachment_count: payload.attachments.len(),
        routed_at: Utc::now(),
    })
}
