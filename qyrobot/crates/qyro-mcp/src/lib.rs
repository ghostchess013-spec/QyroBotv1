//! qyro-mcp — Permanent REA MCP Bridge (JSON-RPC 2.0, deterministic PE/ELF inspector,
//! wildcard AOB byte scanner, ASCII string xref extractor, and honest BACKEND_UNSET gating).

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AobMatch {
    pub file_offset: usize,
    pub file_offset_hex: String,
}

#[derive(Debug, Error)]
pub enum McpError {
    #[error("invalid AOB token: {0}")]
    InvalidAobToken(String),
}

pub fn scan_aob_pattern(buf: &[u8], pattern: &str) -> Result<Vec<AobMatch>, McpError> {
    let mut parsed: Vec<Option<u8>> = Vec::new();
    for tok in pattern.split_whitespace() {
        if tok == "?" || tok == "??" {
            parsed.push(None);
        } else {
            let b = u8::from_str_radix(tok, 16).map_err(|_| McpError::InvalidAobToken(tok.to_string()))?;
            parsed.push(Some(b));
        }
    }
    if parsed.is_empty() || buf.len() < parsed.len() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    for i in 0..=(buf.len() - parsed.len()) {
        let mut matched = true;
        for (j, want) in parsed.iter().enumerate() {
            if let Some(byte) = want {
                if buf[i + j] != *byte {
                    matched = false;
                    break;
                }
            }
        }
        if matched {
            out.push(AobMatch {
                file_offset: i,
                file_offset_hex: format!("0x{:04x}", i),
            });
        }
    }
    Ok(out)
}

pub fn detect_binary_format(buf: &[u8]) -> &'static str {
    if buf.len() >= 4 && &buf[0..4] == b"\x7fELF" {
        "ELF"
    } else if buf.len() >= 2 && &buf[0..2] == b"MZ" {
        "PE"
    } else {
        "RAW"
    }
}
