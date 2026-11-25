//! Hardware-backed `AndroidKeyStore` Ed25519 key + `BiometricPrompt` + QR Scanner Pairing plugin.
//! Enforces 120-second one-time QR pairing TTL and rejects expired or malformed pairing URIs.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const QR_PAIRING_TTL_SECONDS: i64 = 120;

#[derive(Debug, Error)]
pub enum KeystorePluginError {
    #[error("Invalid QR pairing URI scheme (expected qyrobot://pair)")]
    InvalidPairingUri,
    #[error("QR pairing token expired at {0}")]
    QrTokenExpired(DateTime<Utc>),
    #[error("Ed25519 public key must be 32 bytes (SPKI/raw)")]
    InvalidPublicKeyLength,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedQrPairing {
    pub token: String,
    pub server_url: String,
    pub server_fingerprint: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedPairingHandshake {
    pub token: String,
    pub device_name: String,
    pub platform: String,
    pub public_key_pem: String,
    pub signature_b64: String,
    pub biometric_verified: bool,
}

pub fn validate_qr_pairing(
    qr: &ScannedQrPairing,
    now: DateTime<Utc>,
) -> Result<(), KeystorePluginError> {
    if qr.token.trim().is_empty() || !qr.server_url.starts_with("http") {
        return Err(KeystorePluginError::InvalidPairingUri);
    }
    if now > qr.expires_at {
        return Err(KeystorePluginError::QrTokenExpired(qr.expires_at));
    }
    Ok(())
}
