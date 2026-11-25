/**
 * qyro-pairing — Zero-Password Ed25519 QR Device Pairing (120s one-time token),
 * Manage Your Devices with Instant Revoke, 5-Minute (300s) Fail-Closed Android Device
 * Permissions, and 5 Native Android Tauri v2 Plugins Manifest (PRD v1.7.0 §5, §13.1, §13.2).
 */

import crypto from 'node:crypto';
import type { QyroStorage } from './storage';
import type { DeviceAuthRecord } from './types';

export type AndroidDeviceCapability = 'calendar' | 'contacts' | 'location' | 'alarms_timers';
export type DevicePermissionPolicy = 'ask' | 'always_allow' | 'never_allow';

export interface PairingOffer {
  server_url: string;
  server_ed25519_pubkey: string;
  one_time_pairing_token: string;
  created_at: string;
  expires_at: string;
  ttl_seconds: 120;
  qr_matrix: boolean[][];
}

export interface DevicePermissionRecord {
  device_id: string;
  capability: AndroidDeviceCapability;
  policy: DevicePermissionPolicy;
  updated_at: string;
}

export interface PendingPermissionRequest {
  action_id: string;
  device_id: string;
  capability: AndroidDeviceCapability;
  reason: string;
  status: 'pending' | 'resolved' | 'expired';
  expires_at: string;
  fail_closed_seconds: 300;
}

export interface AndroidTauriPluginSpec {
  id: string;
  crate_path: string;
  android_apis: string[];
  guardrail: string;
  capabilities: string[];
}

export const ANDROID_5_TAURI_PLUGINS: AndroidTauriPluginSpec[] = [
  {
    id: 'tauri-plugin-qyro-share',
    crate_path: 'qyrobot/plugins/tauri-plugin-qyro-share',
    android_apis: ['Intent.ACTION_SEND', 'Intent.ACTION_SEND_MULTIPLE'],
    guardrail: 'Meneruskan teks/gambar/PDF dari Android Share Sheet ke Chief of Staff atau bot pilihan user.',
    capabilities: ['share_sheet_ingest'],
  },
  {
    id: 'tauri-plugin-qyro-device-apps',
    crate_path: 'qyrobot/plugins/tauri-plugin-qyro-device-apps',
    android_apis: ['CalendarContract', 'ContactsContract (READ_ONLY)', 'FusedLocationProvider', 'AlarmClock'],
    guardrail: 'Khusus chat pribadi bot sendiri; Calendar non-berulang tanpa undangan, Alarms <= 24 jam; DILARANG memakai NotificationListenerService.',
    capabilities: ['calendar', 'contacts', 'location', 'alarms_timers'],
  },
  {
    id: 'tauri-plugin-qyro-voice',
    crate_path: 'qyrobot/plugins/tauri-plugin-qyro-voice',
    android_apis: ['ForegroundService (MICROPHONE)', 'SpeechRecognizer (id-ID/en-US)'],
    guardrail: 'Live Voice Chat & Dictation id-ID/en-US + Pinned Voice Call bar.',
    capabilities: ['live_voice_chat', 'dictation_id_en'],
  },
  {
    id: 'tauri-plugin-qyro-push',
    crate_path: 'qyrobot/plugins/tauri-plugin-qyro-push',
    android_apis: ['UnifiedPush (ntfy / Sunup)', 'Optional FCM Fallback'],
    guardrail: 'Notifikasi push gratis & self-hosted untuk Action Queue, Takeover, dan X Shield alert.',
    capabilities: ['unified_push', 'fcm_optional'],
  },
  {
    id: 'tauri-plugin-qyro-keystore',
    crate_path: 'qyrobot/plugins/tauri-plugin-qyro-keystore',
    android_apis: ['AndroidKeyStore (Ed25519)', 'BiometricPrompt', 'CameraX QR Scanner'],
    guardrail: 'Private key Ed25519 perangkat tidak pernah keluar dari hardware-backed Android KeyStore.',
    capabilities: ['ed25519_keystore', 'biometric_prompt', 'qr_pairing_scanner'],
  },
];

/**
 * Deterministic 25x25 visual QR matrix (standard 7x7 finder patterns + SHA-256 bit payload)
 * for crisp client-side SVG rendering without external network calls.
 */
export function buildQrMatrix(payloadText: string): boolean[][] {
  const size = 25;
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const center = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = border || center;
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Deterministic payload bits
  const hashA = crypto.createHash('sha256').update(payloadText).digest();
  const hashB = crypto.createHash('sha256').update(hashA).digest();
  const bytes = Buffer.concat([hashA, hashB, Buffer.from(payloadText, 'utf8')]);
  let bitCursor = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inFinder =
        (r < 8 && c < 8) ||
        (r < 8 && c >= size - 8) ||
        (r >= size - 8 && c < 8) ||
        r === 6 ||
        c === 6;
      if (inFinder) continue;
      const byteVal = bytes[Math.floor(bitCursor / 8) % bytes.length];
      const bit = (byteVal >> (bitCursor % 8)) & 1;
      grid[r][c] = bit === 1;
      bitCursor += 1;
    }
  }

  return grid;
}

export class QyroPairingManager {
  private readonly storage: QyroStorage;
  private readonly serverPubKeyBase64: string;
  private readonly activeTokens = new Map<
    string,
    { expiresAtMs: number; serverUrl: string; consumed: boolean }
  >();

  constructor(storage: QyroStorage) {
    this.storage = storage;
    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' });
    this.serverPubKeyBase64 = Buffer.from(der).toString('base64');
  }

  getServerPubKey(): string {
    return this.serverPubKeyBase64;
  }

  /**
   * Generate a One-Time QR Pairing Token valid strictly for 120 seconds (PRD §13.1).
   */
  createPairingOffer(serverUrl: string): PairingOffer {
    const token = `qpair_${crypto.randomBytes(20).toString('hex')}`;
    const nowMs = Date.now();
    const expiresAtMs = nowMs + 120_000;
    const createdAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(expiresAtMs).toISOString();

    this.activeTokens.set(token, {
      expiresAtMs,
      serverUrl,
      consumed: false,
    });

    const payloadJson = JSON.stringify({
      server_url: serverUrl,
      server_ed25519_pubkey: this.serverPubKeyBase64,
      one_time_pairing_token: token,
      expires_at: expiresAt,
    });

    return {
      server_url: serverUrl,
      server_ed25519_pubkey: this.serverPubKeyBase64,
      one_time_pairing_token: token,
      created_at: createdAt,
      expires_at: expiresAt,
      ttl_seconds: 120,
      qr_matrix: buildQrMatrix(payloadJson),
    };
  }

  /**
   * Complete Ed25519 pairing handshake with cryptographic signature verification.
   */
  completePairing(params: {
    one_time_pairing_token: string;
    device_name: string;
    platform: string;
    client_ed25519_pubkey_spki_b64: string;
    signature_b64: string;
    nowMs?: number;
  }): { ok: boolean; error?: string; device?: DeviceAuthRecord; session_token?: string } {
    const record = this.activeTokens.get(params.one_time_pairing_token);
    const nowMs = params.nowMs ?? Date.now();

    if (!record) {
      return { ok: false, error: 'Token pairing tidak dikenal.' };
    }
    if (record.consumed) {
      return { ok: false, error: 'Token pairing sekali pakai sudah digunakan.' };
    }
    if (nowMs > record.expiresAtMs) {
      this.activeTokens.delete(params.one_time_pairing_token);
      return { ok: false, error: 'Token pairing sudah kedaluwarsa (> 120 detik).' };
    }

    // Real Ed25519 cryptographic signature verification over the one-time token
    let validSig = false;
    try {
      const pubKeyObj = crypto.createPublicKey({
        key: Buffer.from(params.client_ed25519_pubkey_spki_b64, 'base64'),
        format: 'der',
        type: 'spki',
      });
      validSig = crypto.verify(
        null,
        Buffer.from(params.one_time_pairing_token, 'utf8'),
        pubKeyObj,
        Buffer.from(params.signature_b64, 'base64')
      );
    } catch {
      return { ok: false, error: 'Format kunci publik Ed25519 atau tanda tangan tidak valid.' };
    }

    if (!validSig) {
      return { ok: false, error: 'Verifikasi tanda tangan Ed25519 gagal.' };
    }

    record.consumed = true;
    const deviceId = `dev-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date(nowMs).toISOString();

    this.storage.db
      .prepare(
        `INSERT INTO devices (id, name, platform, ed25519_pubkey, last_seen_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`
      )
      .run(
        deviceId,
        params.device_name.trim() || 'Android Device',
        params.platform.trim() || 'android-arm64',
        params.client_ed25519_pubkey_spki_b64,
        nowIso
      );

    // Seed default fail-closed 'ask' policies for the 4 permitted device app capabilities
    const insertPerm = this.storage.db.prepare(
      `INSERT OR IGNORE INTO device_permissions (device_id, capability, policy) VALUES (?, ?, 'ask')`
    );
    for (const cap of ['calendar', 'contacts', 'location', 'alarms_timers'] as const) {
      insertPerm.run(deviceId, cap);
    }

    this.storage.db
      .prepare(
        `INSERT INTO audit_log (actor, action, target, outcome, metadata_json)
         VALUES ('pairing', 'device.paired', ?, 'ok', ?)`
      )
      .run(deviceId, JSON.stringify({ platform: params.platform }));

    const device = this.listDevices().find((d) => d.id === deviceId)!;
    const sessionToken = `qdev_${deviceId}_${crypto.randomBytes(16).toString('hex')}`;
    return { ok: true, device, session_token: sessionToken };
  }

  /**
   * Helper for interactive UI / tests: generates a real ephemeral client Ed25519 keypair,
   * signs the one-time token, and executes completePairing().
   */
  simulateEd25519ClientHandshake(params: {
    one_time_pairing_token: string;
    device_name: string;
    platform?: string;
  }) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubDerB64 = Buffer.from(publicKey.export({ format: 'der', type: 'spki' })).toString('base64');
    const sig = crypto.sign(null, Buffer.from(params.one_time_pairing_token, 'utf8'), privateKey);
    return this.completePairing({
      one_time_pairing_token: params.one_time_pairing_token,
      device_name: params.device_name,
      platform: params.platform ?? 'android-14-arm64',
      client_ed25519_pubkey_spki_b64: pubDerB64,
      signature_b64: sig.toString('base64'),
    });
  }

  listDevices(): DeviceAuthRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT id, name, platform, ed25519_pubkey, last_seen_at, revoked_at FROM devices ORDER BY created_at DESC`)
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      platform: String(r.platform),
      ed25519_pubkey: String(r.ed25519_pubkey),
      last_seen_at: String(r.last_seen_at),
      revoked_at: r.revoked_at ? String(r.revoked_at) : null,
    }));
  }

  revokeDevice(deviceId: string): DeviceAuthRecord | null {
    const now = new Date().toISOString();
    const info = this.storage.db
      .prepare(`UPDATE devices SET revoked_at = ? WHERE id = ?`)
      .run(now, deviceId);
    if (Number(info.changes) === 0) return null;

    this.storage.db
      .prepare(
        `INSERT INTO audit_log (actor, action, target, outcome, metadata_json)
         VALUES ('owner', 'device.revoked', ?, 'revoked_instant', '{}')`
      )
      .run(deviceId);

    this.storage.appendEvent('device.permission_requested', null, {
      event: 'device_revoked_instant',
      device_id: deviceId,
      revoked_at: now,
    });

    return this.listDevices().find((d) => d.id === deviceId) ?? null;
  }

  listDevicePermissions(deviceId?: string): DevicePermissionRecord[] {
    const rows = (deviceId
      ? this.storage.db
          .prepare(`SELECT device_id, capability, policy, updated_at FROM device_permissions WHERE device_id = ?`)
          .all(deviceId)
      : this.storage.db
          .prepare(`SELECT device_id, capability, policy, updated_at FROM device_permissions ORDER BY device_id, capability`)
          .all()) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      device_id: String(r.device_id),
      capability: r.capability as AndroidDeviceCapability,
      policy: r.policy as DevicePermissionPolicy,
      updated_at: String(r.updated_at),
    }));
  }

  setDevicePermissionPolicy(
    deviceId: string,
    capability: AndroidDeviceCapability,
    policy: DevicePermissionPolicy
  ): DevicePermissionRecord {
    const now = new Date().toISOString();
    this.storage.db
      .prepare(
        `INSERT INTO device_permissions (device_id, capability, policy, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(device_id, capability) DO UPDATE SET policy = excluded.policy, updated_at = excluded.updated_at`
      )
      .run(deviceId, capability, policy, now);
    return { device_id: deviceId, capability, policy, updated_at: now };
  }

  /**
   * 5-Minute (300s) Fail-Closed Device Permission Request (PRD §5).
   * Rejects banned capabilities like NotificationListenerService immediately.
   */
  requestDevicePermission(params: {
    bot_id: string;
    device_id: string;
    capability: string;
    reason: string;
    nowMs?: number;
  }): {
    allowed_immediately?: boolean;
    denied?: boolean;
    error?: string;
    pending_request?: PendingPermissionRequest;
  } {
    if (params.capability === 'notification_listener' || /notificationlistener/i.test(params.capability)) {
      return {
        denied: true,
        error: 'DIBLOKIR (PRD §5): NotificationListenerService dilarang secara permanen demi privasi Android.',
      };
    }

    const allowedCaps: AndroidDeviceCapability[] = ['calendar', 'contacts', 'location', 'alarms_timers'];
    if (!allowedCaps.includes(params.capability as AndroidDeviceCapability)) {
      return { denied: true, error: `Kapabilitas perangkat tidak dikenal: ${params.capability}` };
    }
    const cap = params.capability as AndroidDeviceCapability;

    const device = this.listDevices().find((d) => d.id === params.device_id);
    if (!device || device.revoked_at) {
      return { denied: true, error: 'Perangkat target tidak ditemukan atau sudah dicabut (revoked).' };
    }

    const perm = this.listDevicePermissions(params.device_id).find((p) => p.capability === cap);
    if (perm?.policy === 'always_allow') {
      return { allowed_immediately: true };
    }
    if (perm?.policy === 'never_allow') {
      return { denied: true, error: `Kebijakan perangkat menolak "${cap}" (never_allow).` };
    }

    const nowMs = params.nowMs ?? Date.now();
    const expiresAt = new Date(nowMs + 300_000).toISOString();

    const item = this.storage.enqueueAction(
      params.bot_id || 'bot-chief-of-staff',
      'device_permission',
      {
        title: `QyroBot butuh izin: ${cap} (${device.name})`,
        summary: `${params.reason} — Fail-closed otomatis dalam 300 detik.`,
        device_id: params.device_id,
        capability: cap,
        fail_closed_seconds: 300,
      },
      { targetDeviceId: params.device_id, ttlSeconds: 300 }
    );

    this.storage.appendEvent('device.permission_requested', params.bot_id || 'bot-chief-of-staff', {
      action_id: item.id,
      device_id: params.device_id,
      capability: cap,
      expires_at: expiresAt,
    });

    return {
      pending_request: {
        action_id: item.id,
        device_id: params.device_id,
        capability: cap,
        reason: params.reason,
        status: 'pending',
        expires_at: expiresAt,
        fail_closed_seconds: 300,
      },
    };
  }

  /**
   * Sweep expired device permission cards (> 300s) -> fail-closed status = 'expired'.
   */
  sweepExpiredPermissions(nowMs = Date.now()): number {
    const nowIso = new Date(nowMs).toISOString();
    const info = this.storage.db
      .prepare(
        `UPDATE action_queue
         SET status = 'expired', resolved_at = ?
         WHERE kind = 'device_permission' AND status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?`
      )
      .run(nowIso, nowIso);
    return Number(info.changes ?? 0);
  }
}
