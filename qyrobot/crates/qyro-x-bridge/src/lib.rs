//! `qyro-x-bridge` — Free Self-Auth X Engine + 6-Layer Anti-Ban Shield (PRD v1.7.0 §11).
//!
//! Honest technical boundary: no client-side software guarantees 100% ban immunity against
//! server-side detection. This crate enforces persistent browser profile Self-Auth,
//! Dynamic Bundle Extraction (zero hardcoded queryIds), Strict Write Gate (`Ask` + Humanizer),
//! Log-Normal Jitter + WIB/WITA/WIT Active Hours, IP Pinning, Zero-Leak Non-Headless 1-Worker
//! serial queue, Circuit Breaker (`PAUSED_NEEDS_HUMAN`, zero auto-retry), and Warm-Up Days 1–7.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum XShieldError {
    #[error("Account is PAUSED_NEEDS_HUMAN (Circuit Breaker tripped; zero auto-retry): {0}")]
    CircuitBreakerPaused(String),
    #[error("Self-Auth login required before executing X operations")]
    Unauthenticated,
    #[error("configs/x-manifest.json is UNSET; extract queryIds from live x.com JS bundle first")]
    ManifestUnset,
    #[error("Layer 1 Strict Write Gate rejected unapproved auto-post; require human approval on Inline Draft Card")]
    StrictWriteGateBlocked,
    #[error("Layer 2 Active Hours ({tz}): local hour {hour}:00 is outside {start}:00..{end}:00")]
    OutsideActiveHours {
        tz: String,
        hour: u8,
        start: u8,
        end: u8,
    },
    #[error("Layer 3 IP Pinning rejected drift: active={active} != pinned={pinned}")]
    IpMismatch { active: String, pinned: String },
    #[error("Layer 4 Zero-Leak Hygiene forbids pure headless browser mode")]
    ZeroLeakHeadlessBlocked,
    #[error("Layer 4 Serial Queue (1 worker/account) is currently busy")]
    SerialWorkerBusy,
    #[error("Layer 6 Warm-Up Guard (Day {day}): daily write quota {used}/{limit} reached")]
    WarmupQuotaExceeded { day: u8, used: u32, limit: u32 },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum XDisplayMode {
    CageWayland,
    Xvfb,
    HeadlessForbidden,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum XProfileStatus {
    Unauthenticated,
    Authenticated,
    PausedNeedsHuman,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum XTriggerKind {
    Bookmark,
    SelfDm,
    MentionAlt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarmupQuota {
    pub day: u8,
    pub max_writes_per_day: u32,
    pub max_reads_per_hour: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedManifest {
    pub status: String,
    pub bundle_hash: String,
    pub extracted_at: Option<DateTime<Utc>>,
    pub query_ids: BTreeMap<String, String>,
}

pub fn warmup_quota_for_day(day: u8) -> WarmupQuota {
    match day.clamp(1, 7) {
        1 | 2 => WarmupQuota {
            day,
            max_writes_per_day: 0,
            max_reads_per_hour: 15,
        },
        3 | 4 => WarmupQuota {
            day,
            max_writes_per_day: 3,
            max_reads_per_hour: 25,
        },
        5 | 6 => WarmupQuota {
            day,
            max_writes_per_day: 8,
            max_reads_per_hour: 40,
        },
        _ => WarmupQuota {
            day: 7,
            max_writes_per_day: 15,
            max_reads_per_hour: 60,
        },
    }
}

/// Deterministic Box-Muller log-normal jitter in milliseconds, clamped to [4000, 180000].
pub fn compute_log_normal_delay_ms(median_seconds: f64, sigma: f64, u1: f64, u2: f64) -> u64 {
    let a = u1.clamp(1e-9, 1.0 - 1e-9);
    let b = u2.clamp(1e-9, 1.0 - 1e-9);
    let z = (-2.0 * a.ln()).sqrt() * (2.0 * std::f64::consts::PI * b).cos();
    let ms = (median_seconds * (sigma * z).exp() * 1000.0).round();
    if !ms.is_finite() {
        return 4_000;
    }
    (ms as u64).clamp(4_000, 180_000)
}

/// Dynamic Bundle Extractor: zero hardcoded queryIds. Extracts live `queryId` + `operationName` pairs.
pub fn extract_manifest_from_js(bundle_text: &str) -> Option<ExtractedManifest> {
    let re_q_first = Regex::new(
        r#"queryId\s*:\s*["']([A-Za-z0-9_-]{10,64})["']\s*,\s*operationName\s*:\s*["']([A-Za-z0-9_]{3,80})["']"#,
    )
    .ok()?;
    let re_op_first = Regex::new(
        r#"operationName\s*:\s*["']([A-Za-z0-9_]{3,80})["']\s*,\s*queryId\s*:\s*["']([A-Za-z0-9_-]{10,64})["']"#,
    )
    .ok()?;

    let mut query_ids = BTreeMap::new();
    for cap in re_q_first.captures_iter(bundle_text) {
        query_ids.insert(cap[2].to_string(), cap[1].to_string());
    }
    for cap in re_op_first.captures_iter(bundle_text) {
        query_ids.insert(cap[1].to_string(), cap[2].to_string());
    }

    if query_ids.is_empty() {
        return None;
    }

    let mut hasher = Sha256::new();
    hasher.update(bundle_text.as_bytes());
    let digest = hex::encode(hasher.finalize());

    Some(ExtractedManifest {
        status: "EXTRACTED".to_string(),
        bundle_hash: format!("sha256:{digest}"),
        extracted_at: Some(Utc::now()),
        query_ids,
    })
}

pub fn detect_challenge_anomaly(http_status: Option<u16>, body_snippet: &str) -> bool {
    if matches!(http_status, Some(403 | 429)) {
        return true;
    }
    let lowered = body_snippet.to_ascii_lowercase();
    [
        "captcha",
        "arkose",
        "challenge_required",
        "account_locked",
        "rate limit exceeded",
    ]
    .iter()
    .any(|kw| lowered.contains(kw))
}
