//! Write-Only Encrypted Vault using Argon2id + ChaCha20-Poly1305 AEAD.

use argon2::{Argon2, Params};
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use chacha20poly1305::{
    ChaCha20Poly1305, Key, Nonce,
    aead::{Aead, KeyInit, Payload},
};
use qyro_storage::QyroStorage;
use rand::RngCore;
use rusqlite::params;
use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum VaultError {
    #[error("invalid key name")]
    InvalidKeyName,
    #[error("kdf failure")]
    KdfFailed,
    #[error("encryption or authentication failure")]
    CryptoFailed,
    #[error("sqlite error: {0}")]
    Sql(#[from] rusqlite::Error),
}

#[derive(Debug, Clone, Serialize)]
pub struct SecretMetadata {
    pub key_name: String,
    pub provider_hint: String,
    pub configured: bool,
    pub sha256_fingerprint: String,
}

pub struct QyroVault<'a> {
    storage: &'a QyroStorage,
    master_passphrase: Vec<u8>,
}

impl<'a> QyroVault<'a> {
    pub fn new(storage: &'a QyroStorage, master_passphrase: impl AsRef<[u8]>) -> Self {
        Self {
            storage,
            master_passphrase: master_passphrase.as_ref().to_vec(),
        }
    }

    fn derive_key(&self, salt: &[u8]) -> Result<[u8; 32], VaultError> {
        let params = Params::new(19 * 1024, 2, 1, Some(32)).map_err(|_| VaultError::KdfFailed)?;
        let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
        let mut out = [0u8; 32];
        argon2
            .hash_password_into(&self.master_passphrase, salt, &mut out)
            .map_err(|_| VaultError::KdfFailed)?;
        Ok(out)
    }

    pub fn set_secret(
        &self,
        key_name: &str,
        plaintext: &str,
        provider_hint: &str,
    ) -> Result<SecretMetadata, VaultError> {
        if key_name.len() < 2 || plaintext.is_empty() {
            return Err(VaultError::InvalidKeyName);
        }
        let mut salt = [0u8; 16];
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut salt);
        rand::thread_rng().fill_bytes(&mut nonce_bytes);

        let key_bytes = self.derive_key(&salt)?;
        let cipher = ChaCha20Poly1305::new(Key::from_slice(&key_bytes));
        let ciphertext_with_tag = cipher
            .encrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: plaintext.as_bytes(),
                    aad: key_name.as_bytes(),
                },
            )
            .map_err(|_| VaultError::CryptoFailed)?;

        let split = ciphertext_with_tag.len().saturating_sub(16);
        let (ct, tag) = ciphertext_with_tag.split_at(split);

        let mut hasher = Sha256::new();
        hasher.update(key_name.as_bytes());
        hasher.update(b":");
        hasher.update(ct);
        let fp = hex::encode(hasher.finalize())[..16].to_string();

        self.storage.conn().execute(
            "INSERT INTO vault_secrets (key_name, provider_hint, kdf_salt_b64, nonce_b64, ciphertext_b64, auth_tag_b64, sha256_fingerprint)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(key_name) DO UPDATE SET
               provider_hint = excluded.provider_hint,
               kdf_salt_b64 = excluded.kdf_salt_b64,
               nonce_b64 = excluded.nonce_b64,
               ciphertext_b64 = excluded.ciphertext_b64,
               auth_tag_b64 = excluded.auth_tag_b64,
               sha256_fingerprint = excluded.sha256_fingerprint,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            params![
                key_name,
                provider_hint,
                B64.encode(salt),
                B64.encode(nonce_bytes),
                B64.encode(ct),
                B64.encode(tag),
                fp,
            ],
        )?;

        Ok(SecretMetadata {
            key_name: key_name.to_string(),
            provider_hint: provider_hint.to_string(),
            configured: true,
            sha256_fingerprint: fp,
        })
    }

    pub fn resolve_for_backend_execution(&self, key_name: &str) -> Result<Option<String>, VaultError> {
        let mut stmt = self.storage.conn().prepare(
            "SELECT kdf_salt_b64, nonce_b64, ciphertext_b64, auth_tag_b64 FROM vault_secrets WHERE key_name = ?1",
        )?;
        let mut rows = stmt.query(params![key_name])?;
        let Some(row) = rows.next()? else {
            return Ok(None);
        };
        let salt = B64.decode(row.get::<_, String>(0)?).map_err(|_| VaultError::CryptoFailed)?;
        let nonce_bytes = B64.decode(row.get::<_, String>(1)?).map_err(|_| VaultError::CryptoFailed)?;
        let mut combined = B64.decode(row.get::<_, String>(2)?).map_err(|_| VaultError::CryptoFailed)?;
        let tag = B64.decode(row.get::<_, String>(3)?).map_err(|_| VaultError::CryptoFailed)?;
        combined.extend_from_slice(&tag);

        let key_bytes = self.derive_key(&salt)?;
        let cipher = ChaCha20Poly1305::new(Key::from_slice(&key_bytes));
        let plain = cipher
            .decrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: &combined,
                    aad: key_name.as_bytes(),
                },
            )
            .map_err(|_| VaultError::CryptoFailed)?;

        String::from_utf8(plain).map(Some).map_err(|_| VaultError::CryptoFailed)
    }
}
