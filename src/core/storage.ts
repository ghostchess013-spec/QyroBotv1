/**
 * qyro-storage — SQLite WAL persistence, full PRD §14.1 migrations,
 * monotonic event_log resume (last_event_id), action_queue, and pinned-safe Storage GC.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  ActionQueueItem,
  ActionQueueKind,
  BotRecord,
  EventEnvelope,
  EventKind,
  UserPreferences,
  WorkingMood,
} from './types';

export interface StorageGcResult {
  deleted_rtk_cache: number;
  deleted_temp_screenshots: number;
  deleted_media_cache: number;
  preserved_pinned_items: number;
  preserved_memory_observations: number;
  preserved_vault_secrets: number;
  ran_at: string;
}

export interface StorageStats {
  journal_mode: string;
  schema_version: string;
  table_count: number;
  tables: Array<{ name: string; rows: number }>;
  latest_event_id: number;
  pending_actions: number;
  pinned_library_items: number;
  vault_secret_count: number;
  memory_observation_count: number;
}

export class QyroStorage {
  public readonly db: DatabaseSync;
  public readonly dbPath: string;
  private readonly eventListeners = new Set<(ev: EventEnvelope) => void>();

  constructor(dbPath: string = ':memory:', migrationPath?: string) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.applyMigrations(migrationPath);
    this.ensureDefaultSeed();
  }

  private applyMigrations(migrationPath?: string): void {
    const sqlPath =
      migrationPath ?? path.resolve(process.cwd(), 'migrations/0001_phase1_core.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    this.db.exec(sql);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`
      )
      .run('0001_phase1_core');

    // Idempotent Phase 2 additive migration: onboarding_completed flag on user_preferences
    const cols = this.db
      .prepare(`PRAGMA table_info(user_preferences)`)
      .all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'onboarding_completed')) {
      this.db.exec(
        `ALTER TABLE user_preferences ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0`
      );
    }
    this.db
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`
      )
      .run('0002_phase2_ui_skills_tools');

    // Idempotent Phase 3 additive migration: Teach a Task macros & MCP Server Registry
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS taught_tasks (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        steps_json TEXT NOT NULL DEFAULT '[]',
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT NOT NULL CHECK (transport IN ('stdio', 'streamable_http')),
        endpoint_or_cmd TEXT NOT NULL,
        builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1)),
        status TEXT NOT NULL DEFAULT 'ready',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`
      )
      .run('0003_phase3_computer_mcp_pairing');

    // Idempotent Phase 4 additive migration: qyro-x-bridge persistent profile, shield audit, triggers & drafts
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS x_profiles (
        id TEXT PRIMARY KEY,
        handle TEXT,
        browser_engine TEXT NOT NULL DEFAULT 'chromium' CHECK (browser_engine IN ('chromium', 'camoufox')),
        display_mode TEXT NOT NULL DEFAULT 'cage_wayland' CHECK (display_mode IN ('cage_wayland', 'xvfb', 'headless_forbidden')),
        pinned_ip TEXT,
        session_cookie_fp TEXT,
        status TEXT NOT NULL DEFAULT 'unauthenticated' CHECK (status IN ('unauthenticated', 'authenticated', 'paused_needs_human')),
        pause_reason TEXT,
        warmup_day INTEGER NOT NULL DEFAULT 1,
        active_tz TEXT NOT NULL DEFAULT 'Asia/Jakarta' CHECK (active_tz IN ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
        active_start_hour INTEGER NOT NULL DEFAULT 7,
        active_end_hour INTEGER NOT NULL DEFAULT 23,
        writes_today INTEGER NOT NULL DEFAULT 0,
        reads_this_hour INTEGER NOT NULL DEFAULT 0,
        alt_allowlist_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS x_shield_events (
        id TEXT PRIMARY KEY,
        layer TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'block', 'circuit_breaker')),
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS x_trigger_events (
        id TEXT PRIMARY KEY,
        trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('bookmark', 'self_dm', 'mention_alt')),
        bot_id TEXT NOT NULL,
        source_handle TEXT NOT NULL,
        folder_or_thread TEXT,
        source_text TEXT NOT NULL,
        draft_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS x_draft_queue (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL,
        action_kind TEXT NOT NULL CHECK (action_kind IN ('post_tweet', 'reply', 'quote_tweet', 'dm_send')),
        target_ref TEXT,
        raw_text TEXT NOT NULL,
        humanized_text TEXT NOT NULL,
        patterns_cleaned_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'awaiting_approval' CHECK (status IN ('awaiting_approval', 'queued_serial', 'dispatched', 'rejected', 'blocked_by_shield')),
        scheduled_delay_ms INTEGER NOT NULL DEFAULT 0,
        shield_note TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`
      )
      .run('0004_phase4_x_bridge');

    // Idempotent Phase 5 additive migration: Channels messages, Lockfile history, Team RBAC, R2/S3 Backup & Auto-Updater
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channel_messages (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'bot', 'system')),
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        content TEXT NOT NULL,
        route_latency_ms REAL,
        routed_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS skill_lock_history (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        lockfile_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS rbac_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        mode TEXT NOT NULL DEFAULT 'single_owner' CHECK (mode IN ('single_owner', 'team_rbac')),
        active_user_id TEXT NOT NULL DEFAULT 'user-owner',
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS cloud_backup_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL DEFAULT 'r2' CHECK (provider IN ('local', 'r2', 's3')),
        endpoint_url TEXT NOT NULL DEFAULT 'UNSET',
        bucket_name TEXT NOT NULL DEFAULT 'UNSET',
        schedule_cron TEXT NOT NULL DEFAULT '0 3 * * *',
        schedule_tz TEXT NOT NULL DEFAULT 'Asia/Jakarta',
        auto_gc_cron TEXT NOT NULL DEFAULT '0 3 * * 0',
        last_sync_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    const routineCols = this.db
      .prepare(`PRAGMA table_info(routines)`)
      .all() as Array<{ name: string }>;
    if (!routineCols.some((c) => c.name === 'trigger_type')) {
      this.db.exec(`ALTER TABLE routines ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'cron'`);
    }
    if (!routineCols.some((c) => c.name === 'max_runs_per_hour')) {
      this.db.exec(`ALTER TABLE routines ADD COLUMN max_runs_per_hour INTEGER NOT NULL DEFAULT 200`);
    }
    if (!routineCols.some((c) => c.name === 'last_run_at')) {
      this.db.exec(`ALTER TABLE routines ADD COLUMN last_run_at TEXT`);
    }

    this.db
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`
      )
      .run('0005_phase5_ecosystem_rbac');
  }

  private ensureDefaultSeed(): void {
    // 1. Default user preferences (id-ID, Free-Tier-Only ON, Bot Accent Color ON)
    this.db
      .prepare(
        `INSERT OR IGNORE INTO user_preferences (
          id, ui_locale, timezone, theme_mode, bot_accent_mode, free_only_mode
        ) VALUES (1, 'id-ID', 'Asia/Jakarta', 'dark', 'bot_color', 1)`
      )
      .run();

    // 2. Chief of Staff primary bot
    const existingChief = this.db
      .prepare(`SELECT id FROM bots WHERE is_chief_of_staff = 1 LIMIT 1`)
      .get() as { id: string } | undefined;

    if (!existingChief) {
      const chiefId = 'bot-chief-of-staff';
      this.db
        .prepare(
          `INSERT INTO bots (
            id, name, label, description, avatar_spec_json, current_mood, is_chief_of_staff, routing_target
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .run(
          chiefId,
          'Chief of Staff',
          'Primary Orchestrator',
          'Koordinator utama QyroBot untuk delegasi tugas, briefing harian, dan persetujuan aksi.',
          JSON.stringify({
            type: 'procedural',
            shape: 'pebble',
            color: 'amber',
            expression: 'attentive',
            animationOverride: null,
            assetPath: null,
          }),
          'idle',
          'auto/fast'
        );

      const engineerId = 'bot-systems-engineer';
      this.db
        .prepare(
          `INSERT OR IGNORE INTO bots (
            id, name, label, description, avatar_spec_json, current_mood, is_chief_of_staff, routing_target
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
        )
        .run(
          engineerId,
          'Rust & Core Architect',
          'Systems Engineer',
          'Spesialis arsitektur Rust, audit kode, dan pengujian kompresi RTK+Caveman.',
          JSON.stringify({
            type: 'procedural',
            shape: 'hexagon',
            color: 'blue',
            expression: 'curious',
            animationOverride: null,
            assetPath: null,
          }),
          'idle',
          'auto/coding'
        );

      // Seed one sample pinned item + one old cache item to demonstrate GC protection
      this.db
        .prepare(
          `INSERT OR IGNORE INTO library_items (id, bot_id, kind, title, file_path, size_bytes, pinned, created_at)
           VALUES (?, ?, 'document', ?, ?, 48200, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-45 days'))`
        )
        .run(
          'lib-pinned-prd',
          chiefId,
          'PRD_Lengkap_QyroBot_v1.7.md (Pinned)',
          '/library/pinned/prd-v1.7.md'
        );

      this.db
        .prepare(
          `INSERT OR IGNORE INTO library_items (id, bot_id, kind, title, file_path, size_bytes, pinned, created_at)
           VALUES (?, ?, 'rtk_raw_cache', ?, ?, 184320, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-21 days'))`
        )
        .run(
          'lib-stale-rtk-1',
          engineerId,
          'cargo-build-raw-output-21d.log',
          '/cache/rtk/cargo-build-21d.log'
        );

      // Seed one sample pending Action Queue item
      this.db
        .prepare(
          `INSERT OR IGNORE INTO action_queue (id, bot_id, kind, status, payload_json, expires_at)
           VALUES (?, ?, 'approval', 'pending', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+15 minutes'))`
        )
        .run(
          'act-initial-review',
          chiefId,
          JSON.stringify({
            title: 'Konfirmasi Sinkronisasi Registry Provider Free-Tier',
            summary:
              'Memverifikasi 154 provider cloud free-tier pada mode Free-Tier-Only tanpa endpoint lokal.',
            risk: 'low',
          })
        );

      // Seed initial boot event
      this.appendEvent('router.decision', chiefId, {
        message: 'Phase 1 Core initialized with Free-Tier-Only Mode and Anti-Local-Model Guard',
        free_only_mode: true,
      });
    }
  }

  onEvent(listener: (ev: EventEnvelope) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  appendEvent<T extends Record<string, unknown>>(
    kind: EventKind,
    botId: string | null,
    payload: T
  ): EventEnvelope<T> {
    const timestamp = new Date().toISOString();
    const res = this.db
      .prepare(
        `INSERT INTO event_log (kind, bot_id, payload_json, created_at) VALUES (?, ?, ?, ?)`
      )
      .run(kind, botId, JSON.stringify(payload), timestamp);

    const envelope: EventEnvelope<T> = {
      event_id: Number(res.lastInsertRowid),
      timestamp,
      kind,
      bot_id: botId,
      payload,
    };

    for (const listener of this.eventListeners) {
      listener(envelope);
    }
    return envelope;
  }

  resumeEvents(lastEventId: number, limit = 200): EventEnvelope[] {
    const safeLastId = Number.isFinite(lastEventId) && lastEventId >= 0 ? Math.floor(lastEventId) : 0;
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 1000);
    const rows = this.db
      .prepare(
        `SELECT event_id, kind, bot_id, payload_json, created_at
         FROM event_log
         WHERE event_id > ?
         ORDER BY event_id ASC
         LIMIT ?`
      )
      .all(safeLastId, safeLimit) as Array<{
      event_id: number;
      kind: EventKind;
      bot_id: string | null;
      payload_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      event_id: Number(row.event_id),
      timestamp: row.created_at,
      kind: row.kind,
      bot_id: row.bot_id,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    }));
  }

  getPreferences(): UserPreferences {
    const row = this.db
      .prepare(`SELECT * FROM user_preferences WHERE id = 1`)
      .get() as Record<string, unknown>;
    return {
      ui_locale: (row.ui_locale as 'id-ID' | 'en-US') ?? 'id-ID',
      timezone: String(row.timezone ?? 'Asia/Jakarta'),
      theme_mode: (row.theme_mode as 'system' | 'dark' | 'light') ?? 'dark',
      bot_accent_mode: (row.bot_accent_mode as 'bot_color' | 'black') ?? 'bot_color',
      voice_language: String(row.voice_language ?? 'auto'),
      caveman_non_en_mode: String(row.caveman_non_en_mode ?? 'preserve_language'),
      free_only_mode: Number(row.free_only_mode) === 1,
      default_browser_engine: (row.default_browser_engine as 'chromium' | 'camoufox') ?? 'chromium',
      ponytail_default_level: String(row.ponytail_default_level ?? 'balanced'),
      show_telemetry_band: Number(row.show_telemetry_band) === 1,
      skill_index_token_budget: Number(row.skill_index_token_budget ?? 1500),
      sandbox_ram_limit_mb: Number(row.sandbox_ram_limit_mb ?? 2048),
      browser_idle_sleep_min: Number(row.browser_idle_sleep_min ?? 15),
      gc_retention_days: Number(row.gc_retention_days ?? 30),
      theme_hex: JSON.parse(String(row.theme_hex_json ?? '{}')) as Record<string, string>,
      onboarding_completed: Number(row.onboarding_completed ?? 0) === 1,
    };
  }

  updatePreferences(patch: Partial<UserPreferences>): UserPreferences {
    const current = this.getPreferences();
    const merged: UserPreferences = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE user_preferences SET
          ui_locale = ?,
          timezone = ?,
          theme_mode = ?,
          bot_accent_mode = ?,
          voice_language = ?,
          caveman_non_en_mode = ?,
          free_only_mode = ?,
          default_browser_engine = ?,
          ponytail_default_level = ?,
          show_telemetry_band = ?,
          skill_index_token_budget = ?,
          sandbox_ram_limit_mb = ?,
          browser_idle_sleep_min = ?,
          gc_retention_days = ?,
          theme_hex_json = ?,
          onboarding_completed = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 1`
      )
      .run(
        merged.ui_locale,
        merged.timezone,
        merged.theme_mode,
        merged.bot_accent_mode,
        merged.voice_language,
        merged.caveman_non_en_mode,
        merged.free_only_mode ? 1 : 0,
        merged.default_browser_engine,
        merged.ponytail_default_level,
        merged.show_telemetry_band ? 1 : 0,
        merged.skill_index_token_budget,
        merged.sandbox_ram_limit_mb,
        merged.browser_idle_sleep_min,
        merged.gc_retention_days,
        JSON.stringify(merged.theme_hex),
        merged.onboarding_completed ? 1 : 0
      );
    return this.getPreferences();
  }

  listBots(): BotRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM bots ORDER BY is_chief_of_staff DESC, created_at ASC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      label: String(row.label),
      description: String(row.description),
      avatar_spec: JSON.parse(String(row.avatar_spec_json)),
      current_mood: row.current_mood as WorkingMood,
      is_chief_of_staff: Number(row.is_chief_of_staff) === 1,
      routing_target: String(row.routing_target),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }));
  }

  createBot(params: {
    name: string;
    label: string;
    description: string;
    avatar_spec: BotRecord['avatar_spec'];
    routing_target?: string;
  }): BotRecord {
    const id = `bot-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO bots (
          id, name, label, description, avatar_spec_json, current_mood, is_chief_of_staff, routing_target, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'idle', 0, ?, ?, ?)`
      )
      .run(
        id,
        params.name.trim(),
        params.label.trim() || 'Specialist Bot',
        params.description.trim(),
        JSON.stringify(params.avatar_spec),
        params.routing_target ?? 'auto/fast',
        now,
        now
      );
    return this.listBots().find((b) => b.id === id)!;
  }

  updateBot(
    botId: string,
    patch: Partial<{
      name: string;
      label: string;
      description: string;
      avatar_spec: BotRecord['avatar_spec'];
      current_mood: WorkingMood;
      routing_target: string;
    }>
  ): BotRecord | null {
    const existing = this.listBots().find((b) => b.id === botId);
    if (!existing) return null;

    const merged = {
      name: patch.name ?? existing.name,
      label: patch.label ?? existing.label,
      description: patch.description ?? existing.description,
      avatar_spec: patch.avatar_spec ?? existing.avatar_spec,
      current_mood: patch.current_mood ?? existing.current_mood,
      routing_target: patch.routing_target ?? existing.routing_target,
    };

    this.db
      .prepare(
        `UPDATE bots SET
          name = ?,
          label = ?,
          description = ?,
          avatar_spec_json = ?,
          current_mood = ?,
          routing_target = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`
      )
      .run(
        merged.name,
        merged.label,
        merged.description,
        JSON.stringify(merged.avatar_spec),
        merged.current_mood,
        merged.routing_target,
        botId
      );

    if (patch.current_mood && patch.current_mood !== existing.current_mood) {
      this.appendEvent('bot.mood_changed', botId, { mood: patch.current_mood });
    }

    return this.listBots().find((b) => b.id === botId) ?? null;
  }

  enqueueAction(
    botId: string,
    kind: ActionQueueKind,
    payload: Record<string, unknown>,
    options?: { targetDeviceId?: string; ttlSeconds?: number }
  ): ActionQueueItem {
    const id = `act-${crypto.randomUUID().slice(0, 8)}`;
    const ttl = options?.ttlSeconds ?? 300;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO action_queue (id, bot_id, kind, status, payload_json, target_device_id, expires_at, created_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`
      )
      .run(
        id,
        botId,
        kind,
        JSON.stringify(payload),
        options?.targetDeviceId ?? null,
        expiresAt,
        createdAt
      );

    this.appendEvent('approval.requested', botId, {
      action_id: id,
      kind,
      expires_at: expiresAt,
      summary: payload.title ?? payload.summary ?? kind,
    });

    return {
      id,
      bot_id: botId,
      kind,
      status: 'pending',
      payload,
      target_device_id: options?.targetDeviceId ?? null,
      expires_at: expiresAt,
      created_at: createdAt,
      resolved_at: null,
    };
  }

  listActionQueue(statusFilter?: 'pending' | 'resolved' | 'expired'): ActionQueueItem[] {
    const sql = statusFilter
      ? `SELECT aq.*, b.name AS bot_name FROM action_queue aq LEFT JOIN bots b ON aq.bot_id = b.id WHERE aq.status = ? ORDER BY aq.created_at DESC`
      : `SELECT aq.*, b.name AS bot_name FROM action_queue aq LEFT JOIN bots b ON aq.bot_id = b.id ORDER BY aq.created_at DESC LIMIT 100`;

    const rows = (
      statusFilter ? this.db.prepare(sql).all(statusFilter) : this.db.prepare(sql).all()
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      bot_id: String(row.bot_id),
      bot_name: row.bot_name ? String(row.bot_name) : undefined,
      kind: row.kind as ActionQueueKind,
      status: row.status as 'pending' | 'resolved' | 'expired',
      payload: JSON.parse(String(row.payload_json)) as Record<string, unknown>,
      target_device_id: row.target_device_id ? String(row.target_device_id) : null,
      expires_at: row.expires_at ? String(row.expires_at) : null,
      created_at: String(row.created_at),
      resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    }));
  }

  resolveAction(actionId: string, decision: 'approved' | 'denied'): ActionQueueItem | null {
    const existing = this.db
      .prepare(`SELECT * FROM action_queue WHERE id = ?`)
      .get(actionId) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const payload = JSON.parse(String(existing.payload_json)) as Record<string, unknown>;
    payload.decision = decision;
    const resolvedAt = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE action_queue SET status = 'resolved', payload_json = ?, resolved_at = ? WHERE id = ?`
      )
      .run(JSON.stringify(payload), resolvedAt, actionId);

    this.appendEvent('approval.resolved', String(existing.bot_id), {
      action_id: actionId,
      decision,
      resolved_at: resolvedAt,
    });

    return {
      id: String(existing.id),
      bot_id: String(existing.bot_id),
      kind: existing.kind as ActionQueueKind,
      status: 'resolved',
      payload,
      target_device_id: existing.target_device_id ? String(existing.target_device_id) : null,
      expires_at: existing.expires_at ? String(existing.expires_at) : null,
      created_at: String(existing.created_at),
      resolved_at: resolvedAt,
    };
  }

  /**
   * Storage GC (PRD §13.4):
   * - Removes unpinned rtk_raw_cache > 14 days
   * - Removes unpinned screenshot > 30 days
   * - Removes unpinned media_cache > gc_retention_days (default 30)
   * - INVARIANT: Never touches pinned=1 library_items, memory_observations text, or vault_secrets
   */
  runStorageGc(retentionDaysOverride?: number): StorageGcResult {
    const prefs = this.getPreferences();
    const mediaDays = retentionDaysOverride ?? prefs.gc_retention_days ?? 30;

    const delRtk = this.db
      .prepare(
        `DELETE FROM library_items
         WHERE pinned = 0 AND kind = 'rtk_raw_cache'
           AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-14 days')`
      )
      .run();

    const delShots = this.db
      .prepare(
        `DELETE FROM library_items
         WHERE pinned = 0 AND kind = 'screenshot'
           AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')`
      )
      .run();

    const delMedia = this.db
      .prepare(
        `DELETE FROM library_items
         WHERE pinned = 0 AND kind = 'media_cache'
           AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
      )
      .run(`-${Math.max(1, Math.floor(mediaDays))} days`);

    const pinnedCount = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS c FROM library_items WHERE pinned = 1`)
          .get() as { c: number }
      ).c
    );
    const memoryCount = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS c FROM memory_observations`)
          .get() as { c: number }
      ).c
    );
    const vaultCount = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS c FROM vault_secrets`)
          .get() as { c: number }
      ).c
    );

    const result: StorageGcResult = {
      deleted_rtk_cache: Number(delRtk.changes),
      deleted_temp_screenshots: Number(delShots.changes),
      deleted_media_cache: Number(delMedia.changes),
      preserved_pinned_items: pinnedCount,
      preserved_memory_observations: memoryCount,
      preserved_vault_secrets: vaultCount,
      ran_at: new Date().toISOString(),
    };

    this.appendEvent('storage.gc_completed', null, { ...result });
    return result;
  }

  listLibraryItems(): Array<{
    id: string;
    kind: string;
    title: string;
    size_bytes: number;
    pinned: boolean;
    created_at: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, kind, title, size_bytes, pinned, created_at FROM library_items ORDER BY pinned DESC, created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      kind: String(r.kind),
      title: String(r.title),
      size_bytes: Number(r.size_bytes),
      pinned: Number(r.pinned) === 1,
      created_at: String(r.created_at),
    }));
  }

  addLibraryItem(params: {
    kind: 'document' | 'image' | 'video' | 'audio' | 'screenshot' | 'rtk_raw_cache' | 'media_cache';
    title: string;
    size_bytes: number;
    pinned: boolean;
    ageDays?: number;
  }): string {
    const id = `lib-${crypto.randomUUID().slice(0, 8)}`;
    const age = params.ageDays ?? 0;
    const createdAt = new Date(Date.now() - age * 86400_000).toISOString();
    this.db
      .prepare(
        `INSERT INTO library_items (id, kind, title, file_path, size_bytes, pinned, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.kind,
        params.title,
        `/library/${params.kind}/${id}`,
        params.size_bytes,
        params.pinned ? 1 : 0,
        createdAt
      );
    return id;
  }

  getStats(): StorageStats {
    const jmRow = this.db.prepare('PRAGMA journal_mode').get() as Record<string, unknown>;
    const journalMode = String(Object.values(jmRow)[0] ?? 'unknown');

    const migRow = this.db
      .prepare(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`)
      .get() as { version: string } | undefined;

    const tableRows = this.db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts_%'
         ORDER BY name ASC`
      )
      .all() as Array<{ name: string }>;

    const tables = tableRows.map(({ name }) => {
      const cnt = this.db.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get() as { c: number };
      return { name, rows: Number(cnt.c) };
    });

    const latestEventRow = this.db
      .prepare(`SELECT COALESCE(MAX(event_id), 0) AS max_id FROM event_log`)
      .get() as { max_id: number };

    const pendingActions = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS c FROM action_queue WHERE status = 'pending'`)
          .get() as { c: number }
      ).c
    );

    const pinnedLib = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS c FROM library_items WHERE pinned = 1`)
          .get() as { c: number }
      ).c
    );

    const vaultCount = Number(
      (this.db.prepare(`SELECT COUNT(*) AS c FROM vault_secrets`).get() as { c: number }).c
    );

    const memCount = Number(
      (this.db.prepare(`SELECT COUNT(*) AS c FROM memory_observations`).get() as { c: number }).c
    );

    return {
      journal_mode: journalMode,
      schema_version: migRow?.version ?? 'unknown',
      table_count: tables.length,
      tables,
      latest_event_id: Number(latestEventRow.max_id),
      pending_actions: pendingActions,
      pinned_library_items: pinnedLib,
      vault_secret_count: vaultCount,
      memory_observation_count: memCount,
    };
  }

  close(): void {
    this.db.close();
  }
}
