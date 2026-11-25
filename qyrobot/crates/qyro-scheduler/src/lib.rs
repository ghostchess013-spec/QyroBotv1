//! qyro-scheduler — Natural Language (id-ID / en-US, WIB/WITA/WIT) schedule parser,
//! >= 5-minute cron cadence guard, and constant-time HMAC-SHA256 webhook verifier (PRD v1.7.0 §9.3).

use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MIN_CRON_CADENCE_MINUTES: u32 = 5;
pub const MAX_ROUTINES_PER_BOT: usize = 50;
pub const MAX_RUN_HISTORY_PER_ROUTINE: usize = 20;
pub const MAX_GLOBAL_RUNS_PER_HOUR: u32 = 300;
pub const MAX_ROUTINE_RUNS_PER_HOUR: u32 = 200;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedSchedule {
    pub cron_expr: String,
    pub timezone: String,
    pub tz_label: String,
    pub min_interval_minutes: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum SchedulerError {
    #[error("Jadwal kosong.")]
    EmptySchedule,
    #[error("Interval {0} menit ditolak; minimum PRD §9.3 adalah 5 menit.")]
    CadenceTooFrequent(u32),
    #[error("Pola jadwal tidak dikenali: {0}")]
    UnrecognizedPattern(String),
}

fn detect_timezone(input: &str) -> (&'static str, &'static str) {
    let upper = input.to_uppercase();
    if upper.contains("WITA") || upper.contains("ASIA/MAKASSAR") {
        ("Asia/Makassar", "WITA")
    } else if upper.contains("WIT") || upper.contains("ASIA/JAYAPURA") {
        ("Asia/Jayapura", "WIT")
    } else {
        ("Asia/Jakarta", "WIB")
    }
}

pub fn estimate_cron_min_interval_minutes(cron_expr: &str) -> Option<u32> {
    let parts: Vec<&str> = cron_expr.split_whitespace().collect();
    if parts.len() != 5 {
        return None;
    }
    let minute = parts[0];
    let hour = parts[1];

    if minute == "*" {
        return Some(1);
    }
    if let Some(step) = minute.strip_prefix("*/") {
        return step.parse::<u32>().ok().filter(|&n| n > 0);
    }
    if minute.chars().all(|c| c.is_ascii_digit()) {
        if hour == "*" {
            return Some(60);
        }
        if let Some(hstep) = hour.strip_prefix("*/") {
            return hstep.parse::<u32>().ok().map(|h| h.saturating_mul(60));
        }
        return Some(1440);
    }
    Some(60)
}

pub fn parse_natural_schedule(input: &str) -> Result<ParsedSchedule, SchedulerError> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err(SchedulerError::EmptySchedule);
    }
    let (iana, label) = detect_timezone(raw);

    // Every N minutes guard
    let re_min = Regex::new(r"(?i)(?:setiap|tiap|every)\s+(\d+)\s*(?:menit|mnt|minutes?|mins?)\b")
        .expect("valid regex");
    if let Some(cap) = re_min.captures(raw) {
        let n: u32 = cap[1].parse().unwrap_or(0);
        if n < MIN_CRON_CADENCE_MINUTES || n > 59 {
            return Err(SchedulerError::CadenceTooFrequent(n));
        }
        return Ok(ParsedSchedule {
            cron_expr: format!("*/{n} * * * *"),
            timezone: iana.to_string(),
            tz_label: label.to_string(),
            min_interval_minutes: n,
        });
    }

    // Raw 5-field cron passthrough
    if raw.split_whitespace().count() == 5 {
        if let Some(min_iv) = estimate_cron_min_interval_minutes(raw) {
            if min_iv < MIN_CRON_CADENCE_MINUTES {
                return Err(SchedulerError::CadenceTooFrequent(min_iv));
            }
            return Ok(ParsedSchedule {
                cron_expr: raw.to_string(),
                timezone: iana.to_string(),
                tz_label: label.to_string(),
                min_interval_minutes: min_iv,
            });
        }
    }

    // HH:MM extractor
    let re_time = Regex::new(r"(?i)(?:jam|pukul|at)?\s*(\d{1,2})[:.](\d{2})").expect("valid regex");
    let (hour, minute) = if let Some(cap) = re_time.captures(raw) {
        (
            cap[1].parse::<u32>().unwrap_or(8).min(23),
            cap[2].parse::<u32>().unwrap_or(0).min(59),
        )
    } else {
        (8, 0)
    };

    let lower = raw.to_lowercase();
    if lower.contains("hari kerja") || lower.contains("weekday") {
        return Ok(ParsedSchedule {
            cron_expr: format!("{minute} {hour} * * 1-5"),
            timezone: iana.to_string(),
            tz_label: label.to_string(),
            min_interval_minutes: 1440,
        });
    }

    let days = [
        ("minggu", 0), ("sunday", 0),
        ("senin", 1), ("monday", 1),
        ("selasa", 2), ("tuesday", 2),
        ("rabu", 3), ("wednesday", 3),
        ("kamis", 4), ("thursday", 4),
        ("jumat", 5), ("friday", 5),
        ("sabtu", 6), ("saturday", 6),
    ];
    for (token, num) in days {
        if lower.contains(token) {
            return Ok(ParsedSchedule {
                cron_expr: format!("{minute} {hour} * * {num}"),
                timezone: iana.to_string(),
                tz_label: label.to_string(),
                min_interval_minutes: 10080,
            });
        }
    }

    if lower.contains("setiap hari") || lower.contains("every day") || lower.contains("daily") {
        return Ok(ParsedSchedule {
            cron_expr: format!("{minute} {hour} * * *"),
            timezone: iana.to_string(),
            tz_label: label.to_string(),
            min_interval_minutes: 1440,
        });
    }

    Err(SchedulerError::UnrecognizedPattern(raw.to_string()))
}

/// Pure RFC 2104 HMAC-SHA256 using sha2 (no extra crate required) + constant-time verify.
pub fn compute_hmac_sha256_hex(secret: &[u8], payload: &[u8]) -> String {
    const BLOCK_SIZE: usize = 64;
    let mut key = [0u8; BLOCK_SIZE];
    if secret.len() > BLOCK_SIZE {
        let hashed = Sha256::digest(secret);
        key[..hashed.len()].copy_from_slice(&hashed);
    } else {
        key[..secret.len()].copy_from_slice(secret);
    }

    let mut ipad = [0x36u8; BLOCK_SIZE];
    let mut opad = [0x5cu8; BLOCK_SIZE];
    for i in 0..BLOCK_SIZE {
        ipad[i] ^= key[i];
        opad[i] ^= key[i];
    }

    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(payload);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_hash);
    format!("sha256={}", hex::encode(outer.finalize()))
}

pub fn verify_webhook_hmac(secret: &str, payload: &str, signature_header: &str) -> bool {
    if secret.is_empty() || signature_header.is_empty() {
        return false;
    }
    let expected = compute_hmac_sha256_hex(secret.as_bytes(), payload.as_bytes());
    let a = expected.as_bytes();
    let b = signature_header.trim().as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
