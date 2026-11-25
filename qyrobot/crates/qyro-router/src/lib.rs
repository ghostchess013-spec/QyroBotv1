//! Native Rust OmniRoute Cloud Router Engine (PRD v1.7.0 §8):
//! - Hard Anti-Local-Model Guard (localhost, 127.0.0.0/8, ::1, RFC1918, UNSET)
//! - Free-Tier-Only Mode default guard
//! - Stacked RTK -> Caveman Compression with Indonesian Language Guard

use std::net::IpAddr;
use qyro_types::UNSET_SENTINEL;
use regex::Regex;
use thiserror::Error;
use url::Url;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EndpointGuardError {
    #[error("cloud endpoint is UNSET")]
    Unset,
    #[error("malformed URL: {0}")]
    InvalidUrl(String),
    #[error("loopback/local host blocked by Anti-Local-Model Guard: {0}")]
    LoopbackBlocked(String),
    #[error("internal/private network host blocked by Anti-Local-Model Guard: {0}")]
    PrivateNetworkBlocked(String),
    #[error("non-HTTPS cloud endpoint rejected: {0}")]
    NonHttpsBlocked(String),
}

pub fn validate_cloud_endpoint(raw: &str) -> Result<String, EndpointGuardError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case(UNSET_SENTINEL) {
        return Err(EndpointGuardError::Unset);
    }

    let parsed = Url::parse(trimmed).map_err(|_| EndpointGuardError::InvalidUrl(trimmed.to_string()))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| EndpointGuardError::InvalidUrl(trimmed.to_string()))?
        .trim_matches(|c| c == '[' || c == ']')
        .to_ascii_lowercase();

    if host == "localhost" || host.ends_with(".localhost") || host == "0.0.0.0" {
        return Err(EndpointGuardError::LoopbackBlocked(host));
    }
    if host == "host.docker.internal" || host.ends_with(".local") || host.ends_with(".internal") {
        return Err(EndpointGuardError::PrivateNetworkBlocked(host));
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        match ip {
            IpAddr::V4(v4) => {
                if v4.is_loopback() || v4.is_unspecified() {
                    return Err(EndpointGuardError::LoopbackBlocked(host));
                }
                if v4.is_private() || v4.is_link_local() {
                    return Err(EndpointGuardError::PrivateNetworkBlocked(host));
                }
            }
            IpAddr::V6(v6) => {
                if v6.is_loopback() || v6.is_unspecified() {
                    return Err(EndpointGuardError::LoopbackBlocked(host));
                }
                let seg0 = v6.segments()[0];
                if (seg0 & 0xfe00) == 0xfc00 || (seg0 & 0xffc0) == 0xfe80 {
                    return Err(EndpointGuardError::PrivateNetworkBlocked(host));
                }
            }
        }
    }

    if parsed.scheme() != "https" {
        return Err(EndpointGuardError::NonHttpsBlocked(parsed.scheme().to_string()));
    }

    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

pub const LOCKED_ID_NEGATIONS: [&str; 10] = [
    "tidak", "jangan", "bukan", "belum", "kecuali", "hanya", "wajib", "dilarang", "tanpa", "harus",
];

pub fn compress_indonesian_caveman(input: &str) -> String {
    let re = Regex::new(
        r"(?i)\b(sebenarnya|pada dasarnya|sebagai informasi|mohon dicatat bahwa|perlu diketahui bahwa|terima kasih banyak sebelumnya)\b",
    )
    .expect("valid regex");
    let candidate = re.replace_all(input, " ").into_owned();
    let lower_before = input.to_ascii_lowercase();
    let lower_after = candidate.to_ascii_lowercase();

    // Language Guard invariant: every Indonesian negation word present before MUST remain present
    for neg in LOCKED_ID_NEGATIONS {
        if lower_before.contains(neg) && !lower_after.contains(neg) {
            return input.to_string();
        }
    }

    candidate
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anti_local_guard_blocks_loopback_and_unset() {
        assert!(validate_cloud_endpoint("UNSET").is_err());
        assert!(validate_cloud_endpoint("http://localhost:11434/v1").is_err());
        assert!(validate_cloud_endpoint("http://127.0.0.1:1234/v1").is_err());
        assert!(validate_cloud_endpoint("http://[::1]:8000/v1").is_err());
        assert!(validate_cloud_endpoint("https://192.168.1.10:11434/v1").is_err());
        assert!(validate_cloud_endpoint("https://voxcpm2.cloud.example.com/v1").is_ok());
    }

    #[test]
    fn caveman_preserves_indonesian_negations() {
        let src = "Mohon dicatat bahwa sebenarnya sistem ini tidak boleh memakai model lokal dan jangan bocor.";
        let out = compress_indonesian_caveman(src);
        assert!(out.contains("tidak"));
        assert!(out.contains("jangan"));
        assert!(out.len() < src.len());
    }
}
