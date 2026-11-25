//! Encrypted cross-architecture snapshot archive (.qyrobak) using Argon2id + ChaCha20-Poly1305.

use argon2::{Argon2, Params};
use chacha20poly1305::{
    ChaCha20Poly1305, Key, Nonce,
    aead::{Aead, KeyInit, Payload},
};
use rand::RngCore;
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const MAGIC: &[u8; 8] = b"QYROBAK1";

#[derive(Debug, Error)]
pub enum BackupError {
    #[error("passphrase must be at least 6 characters")]
    WeakPassphrase,
    #[error("invalid archive header")]
    InvalidHeader,
    #[error("kdf failure")]
    KdfFailed,
    #[error("encryption or authentication failure")]
    CryptoFailed,
    #[error("sha256 integrity mismatch")]
    IntegrityMismatch,
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], BackupError> {
    let params = Params::new(19 * 1024, 2, 1, Some(32)).map_err(|_| BackupError::KdfFailed)?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|_| BackupError::KdfFailed)?;
    Ok(key)
}

pub fn seal_snapshot(payload_json: &[u8], passphrase: &str) -> Result<(Vec<u8>, String), BackupError> {
    if passphrase.len() < 6 {
        return Err(BackupError::WeakPassphrase);
    }
    let sha = hex::encode(Sha256::digest(payload_json));
    let envelope = serde_json::json!({
        "payload_sha256": sha,
        "data": String::from_utf8_lossy(payload_json),
    })
    .to_string();

    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce);

    let key = derive_key(passphrase, &salt)?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));
    let encrypted = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: envelope.as_bytes(),
                aad: MAGIC,
            },
        )
        .map_err(|_| BackupError::CryptoFailed)?;

    let mut archive = Vec::with_capacity(8 + 16 + 12 + encrypted.len());
    archive.extend_from_slice(MAGIC);
    archive.extend_from_slice(&salt);
    archive.extend_from_slice(&nonce);
    archive.extend_from_slice(&encrypted);
    Ok((archive, sha))
}

pub fn open_snapshot(archive: &[u8], passphrase: &str) -> Result<String, BackupError> {
    if archive.len() <= 36 || &archive[..8] != MAGIC {
        return Err(BackupError::InvalidHeader);
    }
    let salt = &archive[8..24];
    let nonce = &archive[24..36];
    let ciphertext = &archive[36..];

    let key = derive_key(passphrase, salt)?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));
    let plain = cipher
        .decrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad: MAGIC,
            },
        )
        .map_err(|_| BackupError::CryptoFailed)?;

    let v: serde_json::Value = serde_json::from_slice(&plain).map_err(|_| BackupError::CryptoFailed)?;
    let expected = v["payload_sha256"].as_str().ok_or(BackupError::IntegrityMismatch)?;
    let data = v["data"].as_str().ok_or(BackupError::IntegrityMismatch)?;
    let actual = hex::encode(Sha256::digest(data.as_bytes()));
    if actual != expected {
        return Err(BackupError::IntegrityMismatch);
    }
    Ok(data.to_string())
}
