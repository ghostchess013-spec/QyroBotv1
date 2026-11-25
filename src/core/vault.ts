/**
 * qyro-vault — Write-Only Encrypted Vault
 * Uses scrypt KDF + ChaCha20-Poly1305 AEAD with key_name bound as AAD.
 * Strict Write-Only contract: public/frontend methods ONLY return { configured: true, sha256_fingerprint }.
 */

import crypto from 'node:crypto';
import type { QyroStorage } from './storage';
import type { VaultSecretMetadata } from './types';

const KEY_LEN = 32;
const NONCE_LEN = 12;
const SALT_LEN = 16;

export class QyroVault {
  private readonly storage: QyroStorage;
  private readonly masterSecret: Buffer;

  constructor(storage: QyroStorage, masterPassphrase?: string) {
    this.storage = storage;
    const rawPass =
      masterPassphrase ??
      process.env.QYRO_VAULT_MASTER_KEY ??
      'qyrobot-phase1-dev-master-key-change-in-prod';
    this.masterSecret = Buffer.from(rawPass, 'utf8');
  }

  private deriveKey(salt: Buffer): Buffer {
    return crypto.scryptSync(this.masterSecret, salt, KEY_LEN, {
      N: 16384,
      r: 8,
      p: 1,
    });
  }

  /**
   * Write-Only store: encrypts plaintext with random salt & 96-bit nonce,
   * binds key_name as AAD, and returns metadata with ZERO plaintext.
   */
  setSecret(
    keyName: string,
    plaintext: string,
    providerHint = 'generic'
  ): VaultSecretMetadata {
    const cleanKey = keyName.trim();
    if (!cleanKey || !/^[A-Za-z0-9_.-]{2,96}$/.test(cleanKey)) {
      throw new Error('Invalid vault key_name: must match [A-Za-z0-9_.-]{2,96}');
    }
    if (!plaintext || plaintext.trim().length === 0) {
      throw new Error('Secret value cannot be empty');
    }

    const salt = crypto.randomBytes(SALT_LEN);
    const nonce = crypto.randomBytes(NONCE_LEN);
    const derivedKey = this.deriveKey(salt);

    const cipher = crypto.createCipheriv('chacha20-poly1305', derivedKey, nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(Buffer.from(cleanKey, 'utf8'), {
      plaintextLength: Buffer.byteLength(plaintext, 'utf8'),
    });

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const fingerprint = crypto
      .createHash('sha256')
      .update(`${cleanKey}:`)
      .update(ciphertext)
      .digest('hex')
      .slice(0, 16);

    const now = new Date().toISOString();
    this.storage.db
      .prepare(
        `INSERT INTO vault_secrets (
          key_name, provider_hint, kdf_salt_b64, nonce_b64, ciphertext_b64, auth_tag_b64, sha256_fingerprint, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key_name) DO UPDATE SET
          provider_hint = excluded.provider_hint,
          kdf_salt_b64 = excluded.kdf_salt_b64,
          nonce_b64 = excluded.nonce_b64,
          ciphertext_b64 = excluded.ciphertext_b64,
          auth_tag_b64 = excluded.auth_tag_b64,
          sha256_fingerprint = excluded.sha256_fingerprint,
          updated_at = excluded.updated_at`
      )
      .run(
        cleanKey,
        providerHint.trim() || 'generic',
        salt.toString('base64'),
        nonce.toString('base64'),
        ciphertext.toString('base64'),
        authTag.toString('base64'),
        fingerprint,
        now,
        now
      );

    this.storage.appendEvent('vault.secret_updated', null, {
      key_name: cleanKey,
      provider_hint: providerHint,
      configured: true,
      sha256_fingerprint: fingerprint,
    });

    return this.getMetadata(cleanKey)!;
  }

  /**
   * Public/UI-safe metadata listing. Strictly excludes ciphertext and plaintext.
   */
  listMetadata(): VaultSecretMetadata[] {
    const rows = this.storage.db
      .prepare(
        `SELECT key_name, provider_hint, sha256_fingerprint, created_at, updated_at
         FROM vault_secrets
         ORDER BY updated_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      key_name: String(row.key_name),
      provider_hint: String(row.provider_hint),
      configured: true as const,
      sha256_fingerprint: String(row.sha256_fingerprint),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }));
  }

  getMetadata(keyName: string): VaultSecretMetadata | null {
    const row = this.storage.db
      .prepare(
        `SELECT key_name, provider_hint, sha256_fingerprint, created_at, updated_at
         FROM vault_secrets WHERE key_name = ?`
      )
      .get(keyName) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      key_name: String(row.key_name),
      provider_hint: String(row.provider_hint),
      configured: true,
      sha256_fingerprint: String(row.sha256_fingerprint),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  deleteSecret(keyName: string): boolean {
    const res = this.storage.db
      .prepare(`DELETE FROM vault_secrets WHERE key_name = ?`)
      .run(keyName);
    return Number(res.changes) > 0;
  }

  /**
   * Internal backend-only decryption for outbound cloud provider requests.
   * NEVER expose this method directly to HTTP API routes.
   */
  resolveForBackendExecution(keyName: string): string | null {
    const row = this.storage.db
      .prepare(
        `SELECT key_name, kdf_salt_b64, nonce_b64, ciphertext_b64, auth_tag_b64
         FROM vault_secrets WHERE key_name = ?`
      )
      .get(keyName) as Record<string, unknown> | undefined;

    if (!row) return null;

    const salt = Buffer.from(String(row.kdf_salt_b64), 'base64');
    const nonce = Buffer.from(String(row.nonce_b64), 'base64');
    const ciphertext = Buffer.from(String(row.ciphertext_b64), 'base64');
    const authTag = Buffer.from(String(row.auth_tag_b64), 'base64');
    const derivedKey = this.deriveKey(salt);

    const decipher = crypto.createDecipheriv('chacha20-poly1305', derivedKey, nonce, {
      authTagLength: 16,
    });
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(String(row.key_name), 'utf8'), {
      plaintextLength: ciphertext.length,
    });

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  /**
   * Redacts any currently stored vault secrets AND common credential patterns from text.
   */
  redactSecrets(input: string): { redacted: string; matches_removed: number } {
    let output = input;
    let matches = 0;

    // 1. Exact redaction for stored vault values
    const rows = this.storage.db
      .prepare(`SELECT key_name FROM vault_secrets`)
      .all() as Array<{ key_name: string }>;

    for (const { key_name } of rows) {
      try {
        const secret = this.resolveForBackendExecution(key_name);
        if (secret && secret.length >= 4 && output.includes(secret)) {
          const parts = output.split(secret);
          matches += parts.length - 1;
          output = parts.join(`[REDACTED:${key_name}]`);
        }
      } catch {
        // Ignore undecryptable records during best-effort redaction
      }
    }

    // 2. Pattern-based redaction for common cloud API tokens
    const patterns: Array<[RegExp, string]> = [
      [/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED:API_KEY]'],
      [/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED:GOOGLE_KEY]'],
      [/\bgsk_[A-Za-z0-9]{16,}\b/g, '[REDACTED:GROQ_KEY]'],
      [/\bghp_[A-Za-z0-9]{20,}\b/g, '[REDACTED:GITHUB_TOKEN]'],
      [/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, 'Bearer [REDACTED:TOKEN]'],
    ];

    for (const [regex, replacement] of patterns) {
      const found = output.match(regex);
      if (found) {
        matches += found.length;
        output = output.replace(regex, replacement);
      }
    }

    return { redacted: output, matches_removed: matches };
  }
}
