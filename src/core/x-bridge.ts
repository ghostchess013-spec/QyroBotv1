/**
 * qyro-x-bridge — Free Self-Auth X / Twitter Engine + 6-Layer Anti-Ban Shield (PRD v1.7.0 §11)
 *
 * Honest technical boundary (PRD §11):
 * No client-side software can mathematically guarantee 100% immunity against X's server-side
 * detection systems. QyroBot minimizes risk through the user's own persistent browser profile,
 * Dynamic Bundle Extraction (zero hardcoded queryIds), human-in-the-loop Inline Draft Cards
 * with mandatory Humanizer pass, serial 1-worker pacing, and fail-closed Circuit Breaker.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { QyroStorage } from './storage';
import type { QyroComputerEngine, BrowserEngineChoice } from './computer';
import { runHumanizerPass } from './tools';

export const X_SHIELD_HONEST_DISCLAIMER_ID =
  'Batasan Teknis Jujur (PRD §11): Tidak ada software sisi klien yang dapat menjamin 100% bebas blokir secara matematis terhadap sistem deteksi sisi server X. QyroBot meminimalkan risiko lewat sesi browser persisten asli milik user, Dynamic Bundle Extractor (nol hardcoded queryId), serta kontrol penuh manusia pada setiap aksi tulis.';

export const X_SHIELD_HONEST_DISCLAIMER_EN =
  'Honest Technical Boundary (PRD §11): No client-side software can mathematically guarantee 100% ban immunity against X server-side detection. QyroBot minimizes risk via the user’s own persistent browser profile, Dynamic Bundle Extractor (zero hardcoded queryIds), and explicit human approval on every write action.';

export type XDisplayMode = 'cage_wayland' | 'xvfb' | 'headless_forbidden';
export type XProfileStatus = 'unauthenticated' | 'authenticated' | 'paused_needs_human';
export type XActiveTimezone = 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';
export type XTriggerKind = 'bookmark' | 'self_dm' | 'mention_alt';
export type XWriteActionKind = 'post_tweet' | 'reply' | 'quote_tweet' | 'dm_send';

export interface XManifest {
  schema_version: string;
  status: 'UNSET' | 'EXTRACTED';
  source: string;
  bundle_hash: string;
  extracted_at: string | null;
  query_ids: 'UNSET' | Record<string, string>;
  feature_switches: 'UNSET' | Record<string, boolean | string | number>;
  notes?: string;
}

export interface WarmupQuota {
  day: number;
  stage_label: string;
  max_writes_per_day: number;
  max_reads_per_hour: number;
  writes_allowed: boolean;
}

export interface XProfileState {
  id: string;
  handle: string | null;
  browser_engine: BrowserEngineChoice;
  display_mode: XDisplayMode;
  pinned_ip: string | null;
  session_cookie_fp: string | null;
  status: XProfileStatus;
  pause_reason: string | null;
  warmup_day: number;
  active_tz: XActiveTimezone;
  active_start_hour: number;
  active_end_hour: number;
  writes_today: number;
  reads_this_hour: number;
  alt_allowlist: string[];
  serial_worker_busy: boolean;
  updated_at: string;
}

export interface XShieldLayerStatus {
  layer_number: 1 | 2 | 3 | 4 | 5 | 6;
  id: string;
  name: string;
  status: 'active' | 'warning' | 'tripped';
  detail: string;
}

export interface XShieldEventRecord {
  id: string;
  layer: string;
  severity: 'info' | 'warn' | 'block' | 'circuit_breaker';
  code: string;
  message: string;
  created_at: string;
}

export interface XTriggerEventRecord {
  id: string;
  trigger_kind: XTriggerKind;
  bot_id: string;
  source_handle: string;
  folder_or_thread: string | null;
  source_text: string;
  draft_id: string | null;
  created_at: string;
}

export interface XDraftRecord {
  id: string;
  bot_id: string;
  action_kind: XWriteActionKind;
  target_ref: string | null;
  raw_text: string;
  humanized_text: string;
  patterns_cleaned: string[];
  status: 'awaiting_approval' | 'queued_serial' | 'dispatched' | 'rejected' | 'blocked_by_shield';
  scheduled_delay_ms: number;
  shield_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface XBridgeSnapshot {
  disclaimer_id: string;
  disclaimer_en: string;
  profile: XProfileState;
  manifest: XManifest;
  warmup_quota: WarmupQuota;
  warmup_schedule: WarmupQuota[];
  layers: XShieldLayerStatus[];
  next_jitter_preview_ms: number;
  local_hour_in_active_tz: number;
  in_active_hours: boolean;
  drafts: XDraftRecord[];
  shield_events: XShieldEventRecord[];
  trigger_events: XTriggerEventRecord[];
}

export interface XShieldEvaluation {
  allowed: boolean;
  code:
    | 'OK'
    | 'UNAUTHENTICATED'
    | 'CIRCUIT_BREAKER_PAUSED'
    | 'MANIFEST_UNSET'
    | 'STRICT_WRITE_GATE_BLOCKED'
    | 'WARMUP_WRITE_LIMIT'
    | 'OUTSIDE_ACTIVE_HOURS'
    | 'IP_MISMATCH_BLOCKED'
    | 'ZERO_LEAK_HEADLESS_BLOCKED'
    | 'SERIAL_WORKER_BUSY';
  reason: string;
  layer: string;
  delay_ms: number;
}

export const WARMUP_SCHEDULE_DAYS_1_TO_7: WarmupQuota[] = [
  { day: 1, stage_label: 'Hari 1 — Read & Bookmark Only', max_writes_per_day: 0, max_reads_per_hour: 15, writes_allowed: false },
  { day: 2, stage_label: 'Hari 2 — Read & Bookmark Only', max_writes_per_day: 0, max_reads_per_hour: 15, writes_allowed: false },
  { day: 3, stage_label: 'Hari 3 — Light Replies', max_writes_per_day: 3, max_reads_per_hour: 25, writes_allowed: true },
  { day: 4, stage_label: 'Hari 4 — Light Replies', max_writes_per_day: 3, max_reads_per_hour: 25, writes_allowed: true },
  { day: 5, stage_label: 'Hari 5 — Gradual Growth', max_writes_per_day: 8, max_reads_per_hour: 40, writes_allowed: true },
  { day: 6, stage_label: 'Hari 6 — Gradual Growth', max_writes_per_day: 8, max_reads_per_hour: 40, writes_allowed: true },
  { day: 7, stage_label: 'Hari 7+ — Steady State', max_writes_per_day: 15, max_reads_per_hour: 60, writes_allowed: true },
];

export const ANOMALY_STATUS_CODES = new Set([403, 429]);
export const ANOMALY_KEYWORDS = [
  'captcha',
  'arkose',
  'challenge_required',
  'account_locked',
  'rate limit exceeded',
  'unusual login',
  'automated behavior',
];

/**
 * Pure Progressive Warm-Up Quota resolver for Days 1–7+ (PRD §11 Layer 6).
 */
export function getWarmupQuota(day: number): WarmupQuota {
  const clamped = Math.max(1, Math.min(7, Math.floor(day || 1)));
  return WARMUP_SCHEDULE_DAYS_1_TO_7[clamped - 1];
}

/**
 * Pure Box-Muller Log-Normal Jitter delay calculator (PRD §11 Layer 2).
 * Produces realistic human pacing delays clamped safely to [minMs, maxMs].
 */
export function computeLogNormalDelayMs(
  medianSeconds = 22,
  sigma = 0.55,
  rng: () => number = Math.random,
  minMs = 4_000,
  maxMs = 180_000
): number {
  const u1 = Math.max(1e-9, Math.min(1 - 1e-9, rng()));
  const u2 = Math.max(1e-9, Math.min(1 - 1e-9, rng()));
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const seconds = medianSeconds * Math.exp(sigma * z);
  const ms = Math.round(seconds * 1000);
  if (!Number.isFinite(ms)) return minMs;
  return Math.max(minMs, Math.min(maxMs, ms));
}

/**
 * Pure helper to obtain local hour (0-23) in WIB/WITA/WIT timezone.
 */
export function getLocalHourInTimezone(tz: XActiveTimezone, date: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  const parsed = Number.parseInt(formatted, 10);
  return Number.isFinite(parsed) ? parsed % 24 : 12;
}

/**
 * Pure Active Hours Window evaluator supporting overnight wrap if configured.
 */
export function isWithinActiveHours(
  localHour: number,
  startHour: number,
  endHour: number
): boolean {
  const h = ((Math.floor(localHour) % 24) + 24) % 24;
  const s = ((Math.floor(startHour) % 24) + 24) % 24;
  const e = ((Math.floor(endHour) % 24) + 24) % 24;
  if (s === e) return true;
  if (s < e) return h >= s && h < e;
  return h >= s || h < e;
}

/**
 * Pure Anomaly & Challenge detector (PRD §11 Layer 5).
 */
export function detectXAnomaly(input: { httpStatus?: number; bodySnippet?: string }): {
  tripped: boolean;
  reason: string | null;
} {
  if (input.httpStatus !== undefined && ANOMALY_STATUS_CODES.has(input.httpStatus)) {
    return {
      tripped: true,
      reason: `HTTP ${input.httpStatus} dari x.com — Circuit Breaker aktif (nol auto-retry).`,
    };
  }
  const lowered = (input.bodySnippet ?? '').toLowerCase();
  for (const kw of ANOMALY_KEYWORDS) {
    if (lowered.includes(kw)) {
      return {
        tripped: true,
        reason: `Sinyal challenge/anomali terdeteksi ("${kw}") — akun dijeda ke PAUSED_NEEDS_HUMAN.`,
      };
    }
  }
  return { tripped: false, reason: null };
}

/**
 * Pure Dynamic Bundle Extractor (PRD §11 & §14.2 — Zero Hardcoded queryIds).
 * Parses live X client JS webpack bundles for `{queryId:"...",operationName:"..."}`
 * and optional feature switch pairs, returning an honest UNSET manifest if nothing is found.
 */
export function extractXManifestFromBundle(
  bundleText: string,
  sourceLabel = 'live-x-bundle-chunk.js'
): {
  ok: boolean;
  manifest: XManifest;
  extracted_query_count: number;
  extracted_switch_count: number;
  error?: string;
} {
  const queryIds: Record<string, string> = {};
  const featureSwitches: Record<string, boolean | string | number> = {};

  // Match standard X webpack GraphQL operation descriptors in either key order
  const qFirst = /queryId\s*:\s*["']([A-Za-z0-9_-]{10,64})["']\s*,\s*operationName\s*:\s*["']([A-Za-z0-9_]{3,80})["']/g;
  const opFirst = /operationName\s*:\s*["']([A-Za-z0-9_]{3,80})["']\s*,\s*queryId\s*:\s*["']([A-Za-z0-9_-]{10,64})["']/g;

  let m: RegExpExecArray | null;
  while ((m = qFirst.exec(bundleText)) !== null) {
    queryIds[m[2]] = m[1];
  }
  while ((m = opFirst.exec(bundleText)) !== null) {
    queryIds[m[1]] = m[2];
  }

  // Match feature switches arrays or boolean flag declarations (e.g. "responsive_web_...":true)
  const switchRegex = /["']((?:responsive_web|tweetypie|graphql|rweb|longform|blue|creator|freedom_of_speech)_[a-z0-9_]{3,80})["']\s*:\s*(true|false|\d+)/g;
  while ((m = switchRegex.exec(bundleText)) !== null) {
    const rawVal = m[2];
    featureSwitches[m[1]] =
      rawVal === 'true' ? true : rawVal === 'false' ? false : Number(rawVal);
  }

  const qCount = Object.keys(queryIds).length;
  const sCount = Object.keys(featureSwitches).length;

  if (qCount === 0) {
    return {
      ok: false,
      manifest: createUnsetManifest(),
      extracted_query_count: 0,
      extracted_switch_count: sCount,
      error:
        'Tidak ditemukan pasangan queryId + operationName yang valid pada teks bundle JS. Status configs/x-manifest.json tetap UNSET.',
    };
  }

  const bundleHash = crypto.createHash('sha256').update(bundleText, 'utf8').digest('hex');

  const manifest: XManifest = {
    schema_version: '1.0',
    status: 'EXTRACTED',
    source: sourceLabel,
    bundle_hash: `sha256:${bundleHash}`,
    extracted_at: new Date().toISOString(),
    query_ids: queryIds,
    feature_switches: sCount > 0 ? featureSwitches : {},
    notes: 'Extracted dynamically from supplied X client JS bundle via qyro-x-bridge.',
  };

  return {
    ok: true,
    manifest,
    extracted_query_count: qCount,
    extracted_switch_count: sCount,
  };
}

export function createUnsetManifest(): XManifest {
  return {
    schema_version: '1.0',
    status: 'UNSET',
    source: 'UNSET',
    bundle_hash: 'UNSET',
    extracted_at: null,
    query_ids: 'UNSET',
    feature_switches: 'UNSET',
    notes:
      'PRD v1.7.0 §11 & §14.2: Zero hardcoded X GraphQL queryIds. Extract dynamically from live x.com client JS bundles after Self-Auth Takeover login.',
  };
}

export class QyroXBridgeEngine {
  private readonly storage: QyroStorage;
  private readonly computer: QyroComputerEngine;
  private readonly manifestPath: string;
  private serialWorkerBusy = false;

  constructor(
    storage: QyroStorage,
    computer: QyroComputerEngine,
    manifestPath: string = path.resolve(process.cwd(), 'configs', 'x-manifest.json')
  ) {
    this.storage = storage;
    this.computer = computer;
    this.manifestPath = manifestPath;
    this.ensureDefaultProfile();
  }

  private ensureDefaultProfile(): void {
    this.storage.db
      .prepare(
        `INSERT OR IGNORE INTO x_profiles (
          id, handle, browser_engine, display_mode, status, warmup_day, active_tz, active_start_hour, active_end_hour, alt_allowlist_json
        ) VALUES ('x-primary', NULL, 'chromium', 'cage_wayland', 'unauthenticated', 1, 'Asia/Jakarta', 7, 23, '[]')`
      )
      .run();
  }

  loadManifest(): XManifest {
    try {
      if (!fs.existsSync(this.manifestPath)) {
        return createUnsetManifest();
      }
      const parsed = JSON.parse(fs.readFileSync(this.manifestPath, 'utf8')) as XManifest;
      if (parsed.status !== 'EXTRACTED' || parsed.query_ids === 'UNSET') {
        return createUnsetManifest();
      }
      return parsed;
    } catch {
      return createUnsetManifest();
    }
  }

  private saveManifest(manifest: XManifest): void {
    const dir = path.dirname(this.manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  getProfile(): XProfileState {
    const row = this.storage.db
      .prepare(`SELECT * FROM x_profiles WHERE id = 'x-primary'`)
      .get() as Record<string, unknown>;

    return {
      id: String(row.id),
      handle: row.handle ? String(row.handle) : null,
      browser_engine: (row.browser_engine as BrowserEngineChoice) ?? 'chromium',
      display_mode: (row.display_mode as XDisplayMode) ?? 'cage_wayland',
      pinned_ip: row.pinned_ip ? String(row.pinned_ip) : null,
      session_cookie_fp: row.session_cookie_fp ? String(row.session_cookie_fp) : null,
      status: (row.status as XProfileStatus) ?? 'unauthenticated',
      pause_reason: row.pause_reason ? String(row.pause_reason) : null,
      warmup_day: Number(row.warmup_day ?? 1),
      active_tz: (row.active_tz as XActiveTimezone) ?? 'Asia/Jakarta',
      active_start_hour: Number(row.active_start_hour ?? 7),
      active_end_hour: Number(row.active_end_hour ?? 23),
      writes_today: Number(row.writes_today ?? 0),
      reads_this_hour: Number(row.reads_this_hour ?? 0),
      alt_allowlist: JSON.parse(String(row.alt_allowlist_json ?? '[]')) as string[],
      serial_worker_busy: this.serialWorkerBusy,
      updated_at: String(row.updated_at),
    };
  }

  private logShieldEvent(
    layer: string,
    severity: XShieldEventRecord['severity'],
    code: string,
    message: string
  ): XShieldEventRecord {
    const id = `xev-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    this.storage.db
      .prepare(
        `INSERT INTO x_shield_events (id, layer, severity, code, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, layer, severity, code, message, now);

    return { id, layer, severity, code, message, created_at: now };
  }

  startSelfAuthTakeover(botId: string): { snapshot: XBridgeSnapshot; computer_tab_opened: boolean } {
    this.computer.openTab('https://x.com/i/flow/login');
    this.computer.startTakeover(
      botId,
      'Self-Auth Login X sekali jalan pada profil persisten (Ambil alih -> Selesai).'
    );
    this.logShieldEvent(
      'self_auth',
      'info',
      'TAKEOVER_LOGIN_STARTED',
      'Sesi Ambil Alih dibuka ke https://x.com/i/flow/login pada profil browser persisten.'
    );
    return { snapshot: this.getSnapshot(), computer_tab_opened: true };
  }

  completeSelfAuthLogin(params: {
    handle: string;
    pinned_ip: string;
    browser_engine?: BrowserEngineChoice;
    warmup_day?: number;
  }): XBridgeSnapshot {
    const cleanHandle = params.handle.trim().replace(/^@+/, '');
    if (!cleanHandle) {
      throw new Error('Handle X tidak boleh kosong.');
    }
    const pinnedIp = params.pinned_ip.trim();
    if (!pinnedIp) {
      throw new Error('IP Pinning wajib diisi agar Layer 3 X Shield dapat mengunci sesi.');
    }

    const engine: BrowserEngineChoice = params.browser_engine ?? 'chromium';
    const cookieFp = `fp_${crypto
      .createHash('sha256')
      .update(`${cleanHandle}:${pinnedIp}:${engine}`)
      .digest('hex')
      .slice(0, 16)}`;

    const warmupDay = Math.max(1, Math.min(7, Math.floor(params.warmup_day ?? 1)));

    this.storage.db
      .prepare(
        `UPDATE x_profiles SET
          handle = ?,
          browser_engine = ?,
          pinned_ip = ?,
          session_cookie_fp = ?,
          status = 'authenticated',
          pause_reason = NULL,
          warmup_day = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 'x-primary'`
      )
      .run(`@${cleanHandle}`, engine, pinnedIp, cookieFp, warmupDay);

    this.computer.endTakeover();
    this.logShieldEvent(
      'self_auth',
      'info',
      'SELF_AUTH_LOCKED',
      `Profil persisten @${cleanHandle} terkunci pada IP ${pinnedIp} (${engine}, Warm-Up Hari ${warmupDay}).`
    );
    return this.getSnapshot();
  }

  extractManifest(bundleText: string, sourceLabel?: string): {
    ok: boolean;
    extracted_query_count: number;
    extracted_switch_count: number;
    error?: string;
    snapshot: XBridgeSnapshot;
  } {
    const result = extractXManifestFromBundle(bundleText, sourceLabel);
    if (result.ok) {
      this.saveManifest(result.manifest);
      this.logShieldEvent(
        'bundle_extractor',
        'info',
        'MANIFEST_EXTRACTED',
        `Berhasil mengekstrak ${result.extracted_query_count} queryId & ${result.extracted_switch_count} feature switches (${result.manifest.bundle_hash.slice(0, 22)}...).`
      );
    } else {
      this.logShieldEvent(
        'bundle_extractor',
        'warn',
        'MANIFEST_EXTRACT_EMPTY',
        result.error ?? 'Bundle JS tidak mengandung pasangan queryId/operationName.'
      );
    }
    return {
      ok: result.ok,
      extracted_query_count: result.extracted_query_count,
      extracted_switch_count: result.extracted_switch_count,
      error: result.error,
      snapshot: this.getSnapshot(),
    };
  }

  resetManifestToUnset(): XBridgeSnapshot {
    this.saveManifest(createUnsetManifest());
    this.logShieldEvent(
      'bundle_extractor',
      'info',
      'MANIFEST_RESET_UNSET',
      'configs/x-manifest.json dikembalikan ke status UNSET.'
    );
    return this.getSnapshot();
  }

  updateShieldConfig(patch: Partial<{
    browser_engine: BrowserEngineChoice;
    display_mode: XDisplayMode;
    pinned_ip: string;
    warmup_day: number;
    active_tz: XActiveTimezone;
    active_start_hour: number;
    active_end_hour: number;
    alt_allowlist: string[];
  }>): XBridgeSnapshot {
    const cur = this.getProfile();
    const browserEngine = patch.browser_engine ?? cur.browser_engine;
    const displayMode = patch.display_mode ?? cur.display_mode;
    const pinnedIp = patch.pinned_ip !== undefined ? patch.pinned_ip.trim() || null : cur.pinned_ip;
    const warmupDay =
      patch.warmup_day !== undefined
        ? Math.max(1, Math.min(7, Math.floor(patch.warmup_day)))
        : cur.warmup_day;
    const activeTz = patch.active_tz ?? cur.active_tz;
    const activeStart =
      patch.active_start_hour !== undefined
        ? Math.max(0, Math.min(23, Math.floor(patch.active_start_hour)))
        : cur.active_start_hour;
    const activeEnd =
      patch.active_end_hour !== undefined
        ? Math.max(0, Math.min(23, Math.floor(patch.active_end_hour)))
        : cur.active_end_hour;
    const allowlist = patch.alt_allowlist ?? cur.alt_allowlist;

    this.storage.db
      .prepare(
        `UPDATE x_profiles SET
          browser_engine = ?,
          display_mode = ?,
          pinned_ip = ?,
          warmup_day = ?,
          active_tz = ?,
          active_start_hour = ?,
          active_end_hour = ?,
          alt_allowlist_json = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 'x-primary'`
      )
      .run(
        browserEngine,
        displayMode,
        pinnedIp,
        warmupDay,
        activeTz,
        activeStart,
        activeEnd,
        JSON.stringify(allowlist)
      );

    return this.getSnapshot();
  }

  /**
   * Evaluates ALL 6 X Shield layers synchronously before any X write execution.
   */
  evaluateWriteShield(options: {
    humanApproved: boolean;
    outboundIp?: string;
    now?: Date;
    rng?: () => number;
  }): XShieldEvaluation {
    const profile = this.getProfile();
    const manifest = this.loadManifest();
    const quota = getWarmupQuota(profile.warmup_day);

    // Layer 5 — Anomaly & Challenge Circuit Breaker (Highest Priority)
    if (profile.status === 'paused_needs_human') {
      return {
        allowed: false,
        code: 'CIRCUIT_BREAKER_PAUSED',
        layer: 'layer_5_circuit_breaker',
        reason:
          profile.pause_reason ??
          'Akun berstatus PAUSED_NEEDS_HUMAN. Nol auto-retry — selesaikan via Ambil alih terlebih dahulu.',
        delay_ms: 0,
      };
    }

    if (profile.status !== 'authenticated' || !profile.handle) {
      return {
        allowed: false,
        code: 'UNAUTHENTICATED',
        layer: 'self_auth',
        reason: 'Belum login Self-Auth. Jalankan Ambil alih Login X pada profil persisten terlebih dahulu.',
        delay_ms: 0,
      };
    }

    // Dynamic Bundle Manifest Gate (PRD §14.2)
    if (manifest.status !== 'EXTRACTED' || manifest.query_ids === 'UNSET') {
      return {
        allowed: false,
        code: 'MANIFEST_UNSET',
        layer: 'bundle_extractor',
        reason:
          'configs/x-manifest.json masih berstatus UNSET. Ekstrak queryId dari live x.com bundle terlebih dahulu.',
        delay_ms: 0,
      };
    }

    // Layer 1 — Strict Write Gate (Ask + Inline Draft Card + Humanizer)
    if (!options.humanApproved) {
      return {
        allowed: false,
        code: 'STRICT_WRITE_GATE_BLOCKED',
        layer: 'layer_1_strict_write_gate',
        reason:
          'Layer 1 Strict Write Gate menolak auto-post langsung. Wajib melalui Inline Draft Card + Humanizer + persetujuan manusia.',
        delay_ms: 0,
      };
    }

    // Layer 4 — Zero-Leak Hygiene (Non-headless Cage/Xvfb + 1 serial worker/akun)
    if (profile.display_mode === 'headless_forbidden') {
      return {
        allowed: false,
        code: 'ZERO_LEAK_HEADLESS_BLOCKED',
        layer: 'layer_4_zero_leak_hygiene',
        reason:
          'Layer 4 Zero-Leak Hygiene melarang mode headless murni. Gunakan Cage Wayland atau Xvfb non-headless.',
        delay_ms: 0,
      };
    }
    if (this.serialWorkerBusy) {
      return {
        allowed: false,
        code: 'SERIAL_WORKER_BUSY',
        layer: 'layer_4_zero_leak_hygiene',
        reason: 'Layer 4 antrean serial 1 worker/akun sedang sibuk. Tunggu aksi sebelumnya tuntas.',
        delay_ms: 0,
      };
    }

    // Layer 3 — IP & Session Pinning
    const outboundIp = options.outboundIp ?? profile.pinned_ip ?? '';
    if (!profile.pinned_ip || outboundIp !== profile.pinned_ip) {
      return {
        allowed: false,
        code: 'IP_MISMATCH_BLOCKED',
        layer: 'layer_3_ip_session_pinning',
        reason: `Layer 3 IP Pinning menolak aksi: IP aktif (${outboundIp || 'unknown'}) berbeda dari IP terkunci (${profile.pinned_ip ?? 'UNSET'}).`,
        delay_ms: 0,
      };
    }

    // Layer 6 — Progressive Warm-Up Guard (Hari 1–7)
    if (!quota.writes_allowed || profile.writes_today >= quota.max_writes_per_day) {
      return {
        allowed: false,
        code: 'WARMUP_WRITE_LIMIT',
        layer: 'layer_6_warmup_guard',
        reason: `Layer 6 Warm-Up Guard (${quota.stage_label}): kuota tulis harian tercapai (${profile.writes_today}/${quota.max_writes_per_day}).`,
        delay_ms: 0,
      };
    }

    // Layer 2 — Human-Like Pacing (Active Hours WIB/WITA/WIT + Log-Normal Jitter)
    const localHour = getLocalHourInTimezone(profile.active_tz, options.now);
    if (!isWithinActiveHours(localHour, profile.active_start_hour, profile.active_end_hour)) {
      return {
        allowed: false,
        code: 'OUTSIDE_ACTIVE_HOURS',
        layer: 'layer_2_human_pacing',
        reason: `Layer 2 Active Hours (${profile.active_tz}): jam lokal ${String(localHour).padStart(2, '0')}:00 berada di luar jendela ${String(profile.active_start_hour).padStart(2, '0')}:00–${String(profile.active_end_hour).padStart(2, '0')}:00.`,
        delay_ms: 0,
      };
    }

    const delayMs = computeLogNormalDelayMs(22, 0.55, options.rng);
    return {
      allowed: true,
      code: 'OK',
      layer: 'all_6_layers_passed',
      reason: `Seluruh 6 lapisan X Shield lolos. Dijadwalkan pada antrean serial 1-worker dengan log-normal jitter ${(delayMs / 1000).toFixed(1)} detik.`,
      delay_ms: delayMs,
    };
  }

  /**
   * Proposes an Interactive Inline Draft Card with mandatory Humanizer pass (PRD §11 Layer 1).
   * NEVER auto-posts; queues a human review card in `action_queue` and `x_draft_queue`.
   */
  proposeWriteDraft(params: {
    bot_id: string;
    action_kind: XWriteActionKind;
    raw_text: string;
    target_ref?: string | null;
  }): { draft: XDraftRecord; snapshot: XBridgeSnapshot } {
    const human = runHumanizerPass(params.raw_text);
    const id = `xdraft-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const previewDelay = computeLogNormalDelayMs(18, 0.45);

    this.storage.db
      .prepare(
        `INSERT INTO x_draft_queue (
          id, bot_id, action_kind, target_ref, raw_text, humanized_text, patterns_cleaned_json,
          status, scheduled_delay_ms, shield_note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_approval', ?, ?, ?, ?)`
      )
      .run(
        id,
        params.bot_id,
        params.action_kind,
        params.target_ref ?? null,
        params.raw_text,
        human.humanized,
        JSON.stringify(human.patterns_cleaned),
        previewDelay,
        `Humanizer membersihkan ${human.patterns_cleaned.length} pola AI. Menunggu persetujuan manusia (Layer 1 Ask).`,
        now,
        now
      );

    // Queue into Unified Action Queue ("Perlu Perhatian")
    this.storage.enqueueAction(params.bot_id, 'draft_review', {
      title: `Review Draft X (${params.action_kind})`,
      summary: human.humanized.slice(0, 140),
      x_draft_id: id,
      patterns_cleaned: human.patterns_cleaned,
    });

    this.storage.appendEvent('draft.proposed', params.bot_id, {
      x_draft_id: id,
      action_kind: params.action_kind,
      humanized_patterns_cleaned: human.patterns_cleaned.length,
    });

    this.logShieldEvent(
      'layer_1_strict_write_gate',
      'info',
      'DRAFT_PROPOSED_HUMANIZED',
      `Draft ${id} (${params.action_kind}) melewati Humanizer (${human.patterns_cleaned.length} pola dibersihkan) dan masuk antrean persetujuan.`
    );

    const draft = this.listDrafts().find((d) => d.id === id)!;
    return { draft, snapshot: this.getSnapshot() };
  }

  /**
   * Human approves an Inline Draft Card -> verifies all 6 X Shield layers + executes 1-worker serial dispatch.
   */
  approveAndDispatchDraft(
    draftId: string,
    options?: {
      edited_text?: string;
      outbound_ip?: string;
      now?: Date;
      rng?: () => number;
    }
  ): {
    ok: boolean;
    evaluation: XShieldEvaluation;
    draft: XDraftRecord | null;
    snapshot: XBridgeSnapshot;
  } {
    const existing = this.listDrafts().find((d) => d.id === draftId);
    if (!existing) {
      return {
        ok: false,
        evaluation: {
          allowed: false,
          code: 'STRICT_WRITE_GATE_BLOCKED',
          layer: 'layer_1_strict_write_gate',
          reason: `Draft ${draftId} tidak ditemukan.`,
          delay_ms: 0,
        },
        draft: null,
        snapshot: this.getSnapshot(),
      };
    }

    const finalText = options?.edited_text?.trim()
      ? runHumanizerPass(options.edited_text).humanized
      : existing.humanized_text;

    const evaluation = this.evaluateWriteShield({
      humanApproved: true,
      outboundIp: options?.outbound_ip,
      now: options?.now,
      rng: options?.rng,
    });

    if (!evaluation.allowed) {
      this.storage.db
        .prepare(
          `UPDATE x_draft_queue SET status = 'blocked_by_shield', humanized_text = ?, shield_note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`
        )
        .run(finalText, evaluation.reason, draftId);

      this.logShieldEvent(evaluation.layer, 'block', evaluation.code, evaluation.reason);
      return {
        ok: false,
        evaluation,
        draft: this.listDrafts().find((d) => d.id === draftId) ?? null,
        snapshot: this.getSnapshot(),
      };
    }

    // Acquire 1-worker serial lock, record dispatch cleanly, increment writes_today
    this.serialWorkerBusy = true;
    try {
      this.storage.db
        .prepare(
          `UPDATE x_draft_queue SET
            status = 'dispatched',
            humanized_text = ?,
            scheduled_delay_ms = ?,
            shield_note = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`
        )
        .run(finalText, evaluation.delay_ms, evaluation.reason, draftId);

      this.storage.db
        .prepare(
          `UPDATE x_profiles SET writes_today = writes_today + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = 'x-primary'`
        )
        .run();

      this.logShieldEvent(
        'layer_4_zero_leak_hygiene',
        'info',
        'SERIAL_DISPATCH_OK',
        `Draft ${draftId} disetujui manusia & dieksekusi pada antrean serial 1-worker (jitter ${(evaluation.delay_ms / 1000).toFixed(1)}s).`
      );
    } finally {
      this.serialWorkerBusy = false;
    }

    return {
      ok: true,
      evaluation,
      draft: this.listDrafts().find((d) => d.id === draftId) ?? null,
      snapshot: this.getSnapshot(),
    };
  }

  /**
   * Layer 5 Circuit Breaker: trips immediately to PAUSED_NEEDS_HUMAN with ZERO auto-retry
   * and pushes an urgent takeover/approval card to Action Queue.
   */
  tripCircuitBreaker(params: {
    bot_id: string;
    http_status?: number;
    body_snippet?: string;
    reason?: string;
  }): { tripped: boolean; reason: string; snapshot: XBridgeSnapshot } {
    const detected = detectXAnomaly({
      httpStatus: params.http_status,
      bodySnippet: params.body_snippet,
    });
    const reason =
      params.reason ??
      detected.reason ??
      'Anomali / Challenge X terdeteksi — Circuit Breaker aktif (PAUSED_NEEDS_HUMAN, nol auto-retry).';

    this.storage.db
      .prepare(
        `UPDATE x_profiles SET status = 'paused_needs_human', pause_reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 'x-primary'`
      )
      .run(reason);

    this.storage.enqueueAction(params.bot_id, 'takeover', {
      title: 'X Shield Circuit Breaker: PAUSED_NEEDS_HUMAN',
      summary: `${reason} Buka Ambil alih untuk verifikasi manusia. Tidak ada auto-retry.`,
      severity: 'critical',
      auto_retry: false,
    });

    this.storage.appendEvent('approval.requested', params.bot_id, {
      kind: 'x_circuit_breaker',
      status: 'PAUSED_NEEDS_HUMAN',
      reason,
      auto_retry: false,
    });

    this.logShieldEvent('layer_5_circuit_breaker', 'circuit_breaker', 'PAUSED_NEEDS_HUMAN', reason);

    return { tripped: true, reason, snapshot: this.getSnapshot() };
  }

  resumeAfterHumanCheck(): XBridgeSnapshot {
    const cur = this.getProfile();
    const nextStatus: XProfileStatus = cur.handle ? 'authenticated' : 'unauthenticated';
    this.storage.db
      .prepare(
        `UPDATE x_profiles SET status = ?, pause_reason = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 'x-primary'`
      )
      .run(nextStatus);

    this.logShieldEvent(
      'layer_5_circuit_breaker',
      'info',
      'HUMAN_RESUMED',
      `Verifikasi manusia selesai; akun kembali ke status ${nextStatus}.`
    );
    return this.getSnapshot();
  }

  /**
   * 3 Free Global Triggers (PRD §11):
   *  1. bookmark / bookmark_folder (safest, zero public noise)
   *  2. self_dm (private instructions to self)
   *  3. mention_alt (mentions or alt-account with strict allowlist)
   */
  ingestFreeTrigger(params: {
    trigger_kind: XTriggerKind;
    bot_id: string;
    source_handle: string;
    source_text: string;
    folder_or_thread?: string;
  }): {
    accepted: boolean;
    error?: string;
    trigger?: XTriggerEventRecord;
    draft?: XDraftRecord;
    snapshot: XBridgeSnapshot;
  } {
    const profile = this.getProfile();

    if (profile.status === 'paused_needs_human') {
      return {
        accepted: false,
        error: 'Akun sedang PAUSED_NEEDS_HUMAN (Circuit Breaker aktif). Trigger ditahan.',
        snapshot: this.getSnapshot(),
      };
    }

    const cleanSource = '@' + params.source_handle.trim().replace(/^@+/, '');

    // For mention_alt, if an allowlist is configured, enforce strict trusted-handle allowlist
    if (
      params.trigger_kind === 'mention_alt' &&
      profile.alt_allowlist.length > 0 &&
      !profile.alt_allowlist.some(
        (allowed) => allowed.toLowerCase().replace(/^@+/, '') === cleanSource.toLowerCase().replace(/^@+/, '')
      )
    ) {
      this.logShieldEvent(
        'trigger_mention_alt',
        'block',
        'ALT_HANDLE_NOT_ALLOWED',
        `Trigger mention_alt dari ${cleanSource} ditolak (tidak masuk allowlist).`
      );
      return {
        accepted: false,
        error: `Handle ${cleanSource} tidak ada di allowlist mention/alt-account.`,
        snapshot: this.getSnapshot(),
      };
    }

    // Increment hourly read counter
    this.storage.db
      .prepare(
        `UPDATE x_profiles SET reads_this_hour = reads_this_hour + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 'x-primary'`
      )
      .run();

    // Generate humanized Inline Draft response (never auto-posted!)
    const rawDraftText =
      params.trigger_kind === 'bookmark'
        ? `Di era digital saat ini, catatan penting dari bookmark (${params.folder_or_thread ?? 'Default'}): ${params.source_text.trim()} — inti utamanya langsung bisa dipakai tim hari ini.`
        : params.trigger_kind === 'self_dm'
          ? `Tentu saja, mari kita tindak lanjuti instruksi Self-DM: ${params.source_text.trim()}`
          : `In today's fast-paced digital landscape, balasan ringkas untuk ${cleanSource}: ${params.source_text.trim()}`;

    const actionKind: XWriteActionKind =
      params.trigger_kind === 'self_dm'
        ? 'post_tweet'
        : params.trigger_kind === 'bookmark'
          ? 'quote_tweet'
          : 'reply';

    const proposed = this.proposeWriteDraft({
      bot_id: params.bot_id,
      action_kind: actionKind,
      raw_text: rawDraftText,
      target_ref: `${params.trigger_kind}:${cleanSource}`,
    });

    const trigId = `xtrig-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    this.storage.db
      .prepare(
        `INSERT INTO x_trigger_events (
          id, trigger_kind, bot_id, source_handle, folder_or_thread, source_text, draft_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        trigId,
        params.trigger_kind,
        params.bot_id,
        cleanSource,
        params.folder_or_thread ?? null,
        params.source_text.trim(),
        proposed.draft.id,
        now
      );

    const trigger: XTriggerEventRecord = {
      id: trigId,
      trigger_kind: params.trigger_kind,
      bot_id: params.bot_id,
      source_handle: cleanSource,
      folder_or_thread: params.folder_or_thread ?? null,
      source_text: params.source_text.trim(),
      draft_id: proposed.draft.id,
      created_at: now,
    };

    return {
      accepted: true,
      trigger,
      draft: proposed.draft,
      snapshot: this.getSnapshot(),
    };
  }

  listDrafts(): XDraftRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT * FROM x_draft_queue ORDER BY created_at DESC LIMIT 25`)
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      bot_id: String(r.bot_id),
      action_kind: r.action_kind as XWriteActionKind,
      target_ref: r.target_ref ? String(r.target_ref) : null,
      raw_text: String(r.raw_text),
      humanized_text: String(r.humanized_text),
      patterns_cleaned: JSON.parse(String(r.patterns_cleaned_json ?? '[]')) as string[],
      status: r.status as XDraftRecord['status'],
      scheduled_delay_ms: Number(r.scheduled_delay_ms ?? 0),
      shield_note: r.shield_note ? String(r.shield_note) : null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    }));
  }

  listShieldEvents(): XShieldEventRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT * FROM x_shield_events ORDER BY created_at DESC LIMIT 25`)
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      layer: String(r.layer),
      severity: r.severity as XShieldEventRecord['severity'],
      code: String(r.code),
      message: String(r.message),
      created_at: String(r.created_at),
    }));
  }

  listTriggerEvents(): XTriggerEventRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT * FROM x_trigger_events ORDER BY created_at DESC LIMIT 20`)
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      trigger_kind: r.trigger_kind as XTriggerKind,
      bot_id: String(r.bot_id),
      source_handle: String(r.source_handle),
      folder_or_thread: r.folder_or_thread ? String(r.folder_or_thread) : null,
      source_text: String(r.source_text),
      draft_id: r.draft_id ? String(r.draft_id) : null,
      created_at: String(r.created_at),
    }));
  }

  getSnapshot(now: Date = new Date()): XBridgeSnapshot {
    const profile = this.getProfile();
    const manifest = this.loadManifest();
    const quota = getWarmupQuota(profile.warmup_day);
    const localHour = getLocalHourInTimezone(profile.active_tz, now);
    const inActiveHours = isWithinActiveHours(
      localHour,
      profile.active_start_hour,
      profile.active_end_hour
    );

    const layers: XShieldLayerStatus[] = [
      {
        layer_number: 1,
        id: 'strict_write_gate',
        name: 'Strict Write Gate (Ask + Draft + Humanizer)',
        status: 'active',
        detail: 'Semua aksi tulis wajib lewat Inline Draft Card + Humanizer v4.0.0 + klik persetujuan manusia.',
      },
      {
        layer_number: 2,
        id: 'human_pacing',
        name: 'Human-Like Pacing (Jitter + Active Hours)',
        status: inActiveHours ? 'active' : 'warning',
        detail: `${profile.active_tz} (${String(localHour).padStart(2, '0')}:00) · Jendela ${String(profile.active_start_hour).padStart(2, '0')}:00–${String(profile.active_end_hour).padStart(2, '0')}:00 · Log-Normal Jitter aktif.`,
      },
      {
        layer_number: 3,
        id: 'ip_session_pinning',
        name: 'IP & Session Pinning',
        status: profile.pinned_ip ? 'active' : 'warning',
        detail: profile.pinned_ip
          ? `Terkunci di ${profile.pinned_ip} (${profile.session_cookie_fp ?? 'cookie-bound'}).`
          : 'Belum ada IP terkunci — lengkapi Self-Auth Login terlebih dahulu.',
      },
      {
        layer_number: 4,
        id: 'zero_leak_hygiene',
        name: 'Zero-Leak Hygiene (Non-Headless + 1 Worker)',
        status: profile.display_mode === 'headless_forbidden' ? 'tripped' : 'active',
        detail: `Display: ${profile.display_mode} · Serial Queue: 1 worker/akun (${this.serialWorkerBusy ? 'busy' : 'idle'}).`,
      },
      {
        layer_number: 5,
        id: 'circuit_breaker',
        name: 'Anomaly & Challenge Circuit Breaker',
        status: profile.status === 'paused_needs_human' ? 'tripped' : 'active',
        detail:
          profile.status === 'paused_needs_human'
            ? `PAUSED_NEEDS_HUMAN: ${profile.pause_reason ?? 'Challenge terdeteksi'} (nol auto-retry).`
            : 'Siaga 403/429/Captcha/Arkose -> PAUSED_NEEDS_HUMAN tanpa auto-retry.',
      },
      {
        layer_number: 6,
        id: 'warmup_guard',
        name: 'Progressive Warm-Up Guard (Hari 1–7)',
        status: quota.writes_allowed ? 'active' : 'warning',
        detail: `${quota.stage_label} · Tulis ${profile.writes_today}/${quota.max_writes_per_day}/hari · Baca ${profile.reads_this_hour}/${quota.max_reads_per_hour}/jam.`,
      },
    ];

    return {
      disclaimer_id: X_SHIELD_HONEST_DISCLAIMER_ID,
      disclaimer_en: X_SHIELD_HONEST_DISCLAIMER_EN,
      profile,
      manifest,
      warmup_quota: quota,
      warmup_schedule: WARMUP_SCHEDULE_DAYS_1_TO_7,
      layers,
      next_jitter_preview_ms: computeLogNormalDelayMs(22, 0.55),
      local_hour_in_active_tz: localHour,
      in_active_hours: inActiveHours,
      drafts: this.listDrafts(),
      shield_events: this.listShieldEvents(),
      trigger_events: this.listTriggerEvents(),
    };
  }
}
