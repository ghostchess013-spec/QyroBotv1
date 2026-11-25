/**
 * qyro-backup — Encrypted Cross-Architecture Snapshot Backup & Restore (.qyrobak)
 * Format: [8-byte magic "QYROBAK1"][16-byte salt][12-byte nonce][16-byte authTag][ChaCha20-Poly1305 ciphertext]
 * Platform-independent JSON payload: portable between AMD x86_64, Ampere ARM64, Windows, macOS.
 */

import crypto from 'node:crypto';
import type { QyroStorage } from './storage';

const MAGIC = Buffer.from('QYROBAK1', 'ascii');
const SALT_LEN = 16;
const NONCE_LEN = 12;
const TAG_LEN = 16;

export type BackupMode = 'compact' | 'full';

export interface BackupManifest {
  format_version: string;
  mode: BackupMode;
  source_arch: string;
  source_platform: string;
  created_at: string;
  table_counts: Record<string, number>;
  payload_sha256: string;
}

export interface BackupPayload {
  manifest: Omit<BackupManifest, 'payload_sha256'>;
  tables: Record<string, Array<Record<string, unknown>>>;
}

const COMPACT_TABLES = [
  'user_preferences',
  'bots',
  'channels',
  'channel_members',
  'action_queue',
  'memory_sessions',
  'memory_observations',
  'library_items',
  'routines',
  'skills',
  'provider_connections',
  'combos',
  'approval_rules',
  'vault_secrets',
] as const;

const FULL_EXTRA_TABLES = [
  'messages',
  'event_log',
  'media_jobs',
  'routine_runs',
  'devices',
  'device_permissions',
  'audit_log',
] as const;

function deriveBackupKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(Buffer.from(passphrase, 'utf8'), salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
  });
}

export class QyroBackup {
  private readonly storage: QyroStorage;

  constructor(storage: QyroStorage) {
    this.storage = storage;
  }

  createSnapshot(
    passphrase: string,
    mode: BackupMode = 'compact'
  ): {
    archive: Buffer;
    archive_base64: string;
    size_bytes: number;
    manifest: BackupManifest;
  } {
    if (!passphrase || passphrase.length < 6) {
      throw new Error('Backup passphrase must be at least 6 characters');
    }

    const tableNames: readonly string[] =
      mode === 'full' ? [...COMPACT_TABLES, ...FULL_EXTRA_TABLES] : COMPACT_TABLES;

    const tables: Record<string, Array<Record<string, unknown>>> = {};
    const tableCounts: Record<string, number> = {};

    for (const table of tableNames) {
      const rows =
        table === 'library_items' && mode === 'compact'
          ? (this.storage.db
              .prepare(`SELECT * FROM library_items WHERE pinned = 1`)
              .all() as Array<Record<string, unknown>>)
          : (this.storage.db
              .prepare(`SELECT * FROM "${table}"`)
              .all() as Array<Record<string, unknown>>);

      // Convert null-prototype objects from node:sqlite to plain JSON objects
      const plainRows = rows.map((r) => ({ ...r }));
      tables[table] = plainRows;
      tableCounts[table] = plainRows.length;
    }

    const rawManifest: Omit<BackupManifest, 'payload_sha256'> = {
      format_version: '1.7.0',
      mode,
      source_arch: process.arch,
      source_platform: process.platform,
      created_at: new Date().toISOString(),
      table_counts: tableCounts,
    };

    const payloadJson = JSON.stringify({ manifest: rawManifest, tables });
    const payloadBuf = Buffer.from(payloadJson, 'utf8');
    const payloadSha256 = crypto.createHash('sha256').update(payloadBuf).digest('hex');

    const envelopeJson = JSON.stringify({
      payload_sha256: payloadSha256,
      data: payloadJson,
    });
    const plaintext = Buffer.from(envelopeJson, 'utf8');

    const salt = crypto.randomBytes(SALT_LEN);
    const nonce = crypto.randomBytes(NONCE_LEN);
    const key = deriveBackupKey(passphrase, salt);

    const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonce, {
      authTagLength: TAG_LEN,
    });
    cipher.setAAD(MAGIC, { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const archive = Buffer.concat([MAGIC, salt, nonce, authTag, ciphertext]);

    const manifest: BackupManifest = {
      ...rawManifest,
      payload_sha256: payloadSha256,
    };

    this.storage.appendEvent('backup.snapshot_created', null, {
      mode,
      size_bytes: archive.length,
      payload_sha256: payloadSha256,
      source_arch: process.arch,
    });

    return {
      archive,
      archive_base64: archive.toString('base64'),
      size_bytes: archive.length,
      manifest,
    };
  }

  static decryptAndVerify(
    archive: Buffer,
    passphrase: string
  ): { manifest: BackupManifest; payload: BackupPayload } {
    const headerLen = MAGIC.length + SALT_LEN + NONCE_LEN + TAG_LEN;
    if (archive.length <= headerLen) {
      throw new Error('Archive truncated or corrupt');
    }
    const magic = archive.subarray(0, MAGIC.length);
    if (!magic.equals(MAGIC)) {
      throw new Error('Invalid .qyrobak magic header');
    }

    let offset = MAGIC.length;
    const salt = archive.subarray(offset, offset + SALT_LEN);
    offset += SALT_LEN;
    const nonce = archive.subarray(offset, offset + NONCE_LEN);
    offset += NONCE_LEN;
    const authTag = archive.subarray(offset, offset + TAG_LEN);
    offset += TAG_LEN;
    const ciphertext = archive.subarray(offset);

    const key = deriveBackupKey(passphrase, salt);
    const decipher = crypto.createDecipheriv('chacha20-poly1305', key, nonce, {
      authTagLength: TAG_LEN,
    });
    decipher.setAuthTag(authTag);
    decipher.setAAD(MAGIC, { plaintextLength: ciphertext.length });

    let decrypted: Buffer;
    try {
      decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error('Backup decryption failed: wrong passphrase or tampered archive');
    }

    const parsedEnvelope = JSON.parse(decrypted.toString('utf8')) as {
      payload_sha256: string;
      data: string;
    };

    const actualSha = crypto
      .createHash('sha256')
      .update(Buffer.from(parsedEnvelope.data, 'utf8'))
      .digest('hex');

    if (actualSha !== parsedEnvelope.payload_sha256) {
      throw new Error('Backup SHA-256 integrity mismatch');
    }

    const payload = JSON.parse(parsedEnvelope.data) as BackupPayload;
    return {
      manifest: {
        ...payload.manifest,
        payload_sha256: actualSha,
      },
      payload,
    };
  }

  /**
   * Restores a verified .qyrobak snapshot into the target storage database inside a transaction.
   */
  restoreSnapshot(
    archive: Buffer,
    passphrase: string
  ): { restored_tables: Record<string, number>; manifest: BackupManifest } {
    const { manifest, payload } = QyroBackup.decryptAndVerify(archive, passphrase);
    const restoredCounts: Record<string, number> = {};

    this.storage.db.exec('PRAGMA foreign_keys = OFF;');
    this.storage.db.exec('BEGIN TRANSACTION;');
    try {
      for (const [tableName, rows] of Object.entries(payload.tables)) {
        // Only allow known safe table names
        if (!/^[a-z0-9_]+$/.test(tableName)) continue;
        this.storage.db.exec(`DELETE FROM "${tableName}"`);
        for (const row of rows) {
          const cols = Object.keys(row);
          if (cols.length === 0) continue;
          const colList = cols.map((c) => `"${c}"`).join(', ');
          const placeholders = cols.map(() => '?').join(', ');
          const values = cols.map((c) => row[c] as string | number | null | Uint8Array);
          this.storage.db
            .prepare(`INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`)
            .run(...values);
        }
        restoredCounts[tableName] = rows.length;
      }
      this.storage.db.exec('COMMIT;');
    } catch (err) {
      this.storage.db.exec('ROLLBACK;');
      throw err;
    } finally {
      this.storage.db.exec('PRAGMA foreign_keys = ON;');
    }

    return { restored_tables: restoredCounts, manifest };
  }
}
