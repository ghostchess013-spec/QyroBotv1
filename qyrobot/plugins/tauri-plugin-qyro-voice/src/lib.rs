//! Native Android Live Voice Chat plugin (`ForegroundService` + `SpeechRecognizer`).
//! Supports `id-ID` (Bahasa Indonesia) and `en-US` with cloud TTS fallback (no local AI models).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum VoicePluginError {
    #[error("Unsupported speech locale: {0}. Allowed: id-ID, en-US")]
    UnsupportedLocale(String),
    #[error("Local STT/TTS inference engines are prohibited by PRD §8.1")]
    LocalModelProhibited,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VoiceSessionState {
    Idle,
    Listening,
    StreamingCloud,
    Speaking,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceSessionConfig {
    pub session_id: Uuid,
    pub bot_id: String,
    pub locale: String,
    pub foreground_notification_title: String,
    pub cloud_tts_provider: String,
    pub started_at: DateTime<Utc>,
}

pub fn validate_voice_session(
    bot_id: impl Into<String>,
    locale: &str,
    cloud_tts_provider: &str,
) -> Result<VoiceSessionConfig, VoicePluginError> {
    if locale != "id-ID" && locale != "en-US" {
        return Err(VoicePluginError::UnsupportedLocale(locale.to_string()));
    }
    let lowered = cloud_tts_provider.to_ascii_lowercase();
    if lowered.contains("localhost") || lowered.contains("whisper-rs") || lowered.contains("local")
    {
        return Err(VoicePluginError::LocalModelProhibited);
    }

    Ok(VoiceSessionConfig {
        session_id: Uuid::new_v4(),
        bot_id: bot_id.into(),
        locale: locale.to_string(),
        foreground_notification_title: if locale == "id-ID" {
            "QyroBot — Obrolan Suara Aktif".to_string()
        } else {
            "QyroBot — Live Voice Active".to_string()
        },
        cloud_tts_provider: cloud_tts_provider.to_string(),
        started_at: Utc::now(),
    })
}
