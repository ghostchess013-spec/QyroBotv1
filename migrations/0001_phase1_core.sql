-- QyroBot Phase 1 Core SQLite Schema (PRD v1.7.0 §14.1)
-- Compatible with SQLite 3.35+ (WAL Mode + FTS5 + Foreign Keys)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ui_locale TEXT NOT NULL DEFAULT 'id-ID' CHECK (ui_locale IN ('id-ID', 'en-US')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  theme_mode TEXT NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('system', 'dark', 'light')),
  bot_accent_mode TEXT NOT NULL DEFAULT 'bot_color' CHECK (bot_accent_mode IN ('bot_color', 'black')),
  voice_language TEXT NOT NULL DEFAULT 'auto',
  caveman_non_en_mode TEXT NOT NULL DEFAULT 'preserve_language',
  free_only_mode INTEGER NOT NULL DEFAULT 1 CHECK (free_only_mode IN (0, 1)),
  default_browser_engine TEXT NOT NULL DEFAULT 'chromium' CHECK (default_browser_engine IN ('chromium', 'camoufox')),
  ponytail_default_level TEXT NOT NULL DEFAULT 'balanced',
  show_telemetry_band INTEGER NOT NULL DEFAULT 1 CHECK (show_telemetry_band IN (0, 1)),
  skill_index_token_budget INTEGER NOT NULL DEFAULT 1500,
  sandbox_ram_limit_mb INTEGER NOT NULL DEFAULT 2048,
  browser_idle_sleep_min INTEGER NOT NULL DEFAULT 15,
  gc_retention_days INTEGER NOT NULL DEFAULT 30,
  theme_hex_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  avatar_spec_json TEXT NOT NULL,
  current_mood TEXT NOT NULL DEFAULT 'idle' CHECK (current_mood IN ('idle', 'thinking', 'working', 'waiting', 'blocked', 'done')),
  is_chief_of_staff INTEGER NOT NULL DEFAULT 0 CHECK (is_chief_of_staff IN (0, 1)),
  section_id TEXT,
  routing_target TEXT NOT NULL DEFAULT 'auto/fast',
  modality_overrides_json TEXT NOT NULL DEFAULT '{}',
  browser_engine_override TEXT,
  core_tools_policy_json TEXT NOT NULL DEFAULT '{}',
  coding_pack_profile TEXT NOT NULL DEFAULT 'standard',
  response_locale_override TEXT,
  voice_language_override TEXT,
  compression_policy_json TEXT NOT NULL DEFAULT '{"rtk":true,"caveman":"medium"}',
  approval_profile_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'channel' CHECK (kind IN ('channel', 'group_chat', 'direct')),
  routing_mode TEXT NOT NULL DEFAULT 'fast_auto',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  turn_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_id, bot_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  active_skills_json TEXT NOT NULL DEFAULT '[]',
  draft_card_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS delegations (
  id TEXT PRIMARY KEY,
  from_bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  to_bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  task_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS action_queue (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('approval', 'secure_form', 'takeover', 'skill_trust', 'device_permission', 'draft_review')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'expired')),
  payload_json TEXT NOT NULL,
  target_device_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_action_queue_status ON action_queue(status, created_at);

CREATE TABLE IF NOT EXISTS event_log (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  bot_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_event_log_kind ON event_log(kind);

CREATE TABLE IF NOT EXISTS memory_sessions (
  id TEXT PRIMARY KEY,
  bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS memory_observations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES memory_sessions(id) ON DELETE CASCADE,
  bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'observation' CHECK (kind IN ('observation', 'decision', 'preference', 'artifact', 'tool_run')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  private_blocks_redacted INTEGER NOT NULL DEFAULT 0,
  screenshot_path TEXT,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_observations_fts USING fts5(
  observation_id UNINDEXED,
  title,
  summary,
  body,
  tags,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_memory_obs_ai AFTER INSERT ON memory_observations BEGIN
  INSERT INTO memory_observations_fts(observation_id, title, summary, body, tags)
  VALUES (new.id, new.title, new.summary, new.body, new.tags_json);
END;

CREATE TRIGGER IF NOT EXISTS trg_memory_obs_ad AFTER DELETE ON memory_observations BEGIN
  DELETE FROM memory_observations_fts WHERE observation_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_memory_obs_au AFTER UPDATE ON memory_observations BEGIN
  DELETE FROM memory_observations_fts WHERE observation_id = old.id;
  INSERT INTO memory_observations_fts(observation_id, title, summary, body, tags)
  VALUES (new.id, new.title, new.summary, new.body, new.tags_json);
END;

CREATE TABLE IF NOT EXISTS media_jobs (
  id TEXT PRIMARY KEY,
  bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  modality TEXT NOT NULL CHECK (modality IN ('image', 'video', 'tts', 'stt', 'vision')),
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress_pct INTEGER NOT NULL DEFAULT 0,
  result_path TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('document', 'image', 'video', 'audio', 'screenshot', 'rtk_raw_cache', 'media_cache')),
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schedule_expr TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  prompt TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS routine_runs (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  output_summary TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS skills (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'builtin',
  activation_mode TEXT NOT NULL DEFAULT 'auto' CHECK (activation_mode IN ('auto', 'always_on', 'manual_only')),
  sha256 TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  installed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS skill_bindings (
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  skill_slug TEXT NOT NULL REFERENCES skills(slug) ON DELETE CASCADE,
  activation_mode TEXT NOT NULL DEFAULT 'auto',
  PRIMARY KEY (bot_id, skill_slug)
);

CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  slug UNINDEXED,
  name,
  description,
  keywords,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS skill_trust_audit (
  id TEXT PRIMARY KEY,
  skill_slug TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'denied', 'tampered_blocked')),
  notes TEXT NOT NULL DEFAULT '',
  audited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  label TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'oauth_sub', 'paid')),
  auth_type TEXT NOT NULL CHECK (auth_type IN ('api_key', 'oauth_sub')),
  vault_secret_key TEXT,
  endpoint_override TEXT,
  remaining_quota INTEGER NOT NULL DEFAULT 1000,
  quota_limit INTEGER NOT NULL DEFAULT 1000,
  reset_at TEXT,
  priority INTEGER NOT NULL DEFAULT 50,
  weight INTEGER NOT NULL DEFAULT 10,
  avg_latency_ms INTEGER NOT NULL DEFAULT 350,
  cache_hit_rate REAL NOT NULL DEFAULT 0.25,
  cost_per_1m_usd REAL NOT NULL DEFAULT 0.0,
  healthy INTEGER NOT NULL DEFAULT 1 CHECK (healthy IN (0, 1)),
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  strategy TEXT NOT NULL DEFAULT 'priority',
  modality TEXT NOT NULL DEFAULT 'text',
  targets_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  ed25519_pubkey TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS device_permissions (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  policy TEXT NOT NULL DEFAULT 'ask' CHECK (policy IN ('ask', 'always_allow', 'never_allow')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (device_id, capability)
);

CREATE TABLE IF NOT EXISTS approval_rules (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'ask')),
  scope TEXT NOT NULL DEFAULT 'global',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  outcome TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS team_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS vault_secrets (
  key_name TEXT PRIMARY KEY,
  provider_hint TEXT NOT NULL DEFAULT 'generic',
  kdf_salt_b64 TEXT NOT NULL,
  nonce_b64 TEXT NOT NULL,
  ciphertext_b64 TEXT NOT NULL,
  auth_tag_b64 TEXT NOT NULL,
  sha256_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
