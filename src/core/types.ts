/**
 * qyro-types — Core domain types for QyroBot (PRD v1.7.0)
 */

export const UNSET_SENTINEL = 'UNSET' as const;
export type UnsetOr<T> = T | typeof UNSET_SENTINEL;

export type UiLocale = 'id-ID' | 'en-US';
export type ThemeMode = 'system' | 'dark' | 'light';
export type BotAccentMode = 'bot_color' | 'black';

export const AVATAR_SHAPES = [
  'circle',
  'pebble',
  'squircle',
  'capsule',
  'triangle',
  'hexagon',
  'cloud',
  'droplet',
] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

export interface AvatarColorDef {
  id: AvatarColorName;
  hex: string;
  eyeHex: '#ffffff' | '#0a0a0c';
  tintDark: string;
  tintLight: string;
}

export const AVATAR_COLORS = [
  { id: 'ink', hex: '#0a0a0c', eyeHex: '#ffffff', tintDark: '#18181b', tintLight: '#f4f4f5' },
  { id: 'brown', hex: '#8b5e3c', eyeHex: '#ffffff', tintDark: 'rgba(139, 94, 60, 0.16)', tintLight: 'rgba(139, 94, 60, 0.10)' },
  { id: 'red', hex: '#e8483f', eyeHex: '#ffffff', tintDark: 'rgba(232, 72, 63, 0.15)', tintLight: 'rgba(232, 72, 63, 0.10)' },
  { id: 'orange', hex: '#f08a24', eyeHex: '#ffffff', tintDark: 'rgba(240, 138, 36, 0.15)', tintLight: 'rgba(240, 138, 36, 0.10)' },
  { id: 'amber', hex: '#f0b429', eyeHex: '#0a0a0c', tintDark: 'rgba(240, 180, 41, 0.16)', tintLight: 'rgba(240, 180, 41, 0.12)' },
  { id: 'green', hex: '#3ecf8e', eyeHex: '#0a0a0c', tintDark: 'rgba(62, 207, 142, 0.15)', tintLight: 'rgba(62, 207, 142, 0.11)' },
  { id: 'turquoise', hex: '#2fbfa0', eyeHex: '#0a0a0c', tintDark: 'rgba(47, 191, 160, 0.15)', tintLight: 'rgba(47, 191, 160, 0.11)' },
  { id: 'blue', hex: '#3b93f0', eyeHex: '#ffffff', tintDark: 'rgba(59, 147, 240, 0.15)', tintLight: 'rgba(59, 147, 240, 0.10)' },
  { id: 'purple', hex: '#8b5cf6', eyeHex: '#ffffff', tintDark: 'rgba(139, 92, 246, 0.15)', tintLight: 'rgba(139, 92, 246, 0.10)' },
  { id: 'pink', hex: '#e152b0', eyeHex: '#ffffff', tintDark: 'rgba(225, 82, 176, 0.15)', tintLight: 'rgba(225, 82, 176, 0.10)' },
  { id: 'grey', hex: '#a3a3a3', eyeHex: '#0a0a0c', tintDark: 'rgba(163, 163, 163, 0.16)', tintLight: 'rgba(163, 163, 163, 0.12)' },
  { id: 'cream', hex: '#f1efe9', eyeHex: '#0a0a0c', tintDark: 'rgba(241, 239, 233, 0.14)', tintLight: 'rgba(241, 239, 233, 0.45)' },
] as const;

export type AvatarColorName = (typeof AVATAR_COLORS)[number]['id'];

export const AVATAR_EXPRESSIONS = [
  'neutral',
  'attentive',
  'surprised',
  'excited',
  'happy',
  'laughing',
  'angry',
  'sad',
  'scared',
  'suspicious',
  'confused',
  'curious',
  'proud',
  'shy',
  'unimpressed',
  'sleepy',
] as const;
export type AvatarExpression = (typeof AVATAR_EXPRESSIONS)[number];

export const AVATAR_ANIMATIONS = [
  'idle',
  'thinking',
  'wink',
  'wide_eyes',
  'alert',
  'notification',
  'exclamation',
  'sleep',
  'egg',
  'hexagon',
  'play',
  'orbit',
  'swirl',
  'burst',
  'comet',
] as const;
export type AvatarAnimation = (typeof AVATAR_ANIMATIONS)[number];

export const WORKING_MOODS = [
  'idle',
  'thinking',
  'working',
  'waiting',
  'blocked',
  'done',
] as const;
export type WorkingMood = (typeof WORKING_MOODS)[number];

export const MOOD_TO_ANIMATION: Record<WorkingMood, AvatarAnimation> = {
  idle: 'idle',
  thinking: 'thinking',
  working: 'orbit',
  waiting: 'notification',
  blocked: 'alert',
  done: 'burst',
};

export interface BotAvatarSpec {
  type: 'procedural' | 'generated' | 'uploaded';
  shape: AvatarShape;
  color: AvatarColorName;
  expression: AvatarExpression;
  animationOverride?: AvatarAnimation | null;
  assetPath?: string | null;
}

export type EventKind =
  | 'bot.mood_changed'
  | 'chat.delta'
  | 'draft.proposed'
  | 'skill.activated'
  | 'approval.requested'
  | 'approval.resolved'
  | 'computer.takeover_requested'
  | 'media.job_progress'
  | 'device.permission_requested'
  | 'vault.secret_updated'
  | 'memory.observation_recorded'
  | 'router.decision'
  | 'backup.snapshot_created'
  | 'storage.gc_completed';

export interface EventEnvelope<T = Record<string, unknown>> {
  event_id: number;
  timestamp: string;
  kind: EventKind;
  bot_id: string | null;
  payload: T;
}

export type ActionQueueKind =
  | 'approval'
  | 'secure_form'
  | 'takeover'
  | 'skill_trust'
  | 'device_permission'
  | 'draft_review';

export type ActionQueueStatus = 'pending' | 'resolved' | 'expired';

export interface ActionQueueItem {
  id: string;
  bot_id: string;
  bot_name?: string;
  kind: ActionQueueKind;
  status: ActionQueueStatus;
  payload: Record<string, unknown>;
  target_device_id: string | null;
  expires_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface UserPreferences {
  ui_locale: UiLocale;
  timezone: string;
  theme_mode: ThemeMode;
  bot_accent_mode: BotAccentMode;
  voice_language: string;
  caveman_non_en_mode: string;
  free_only_mode: boolean;
  default_browser_engine: 'chromium' | 'camoufox';
  ponytail_default_level: string;
  show_telemetry_band: boolean;
  skill_index_token_budget: number;
  sandbox_ram_limit_mb: number;
  browser_idle_sleep_min: number;
  gc_retention_days: number;
  theme_hex: Record<string, string>;
  onboarding_completed?: boolean;
}

export interface BotRecord {
  id: string;
  name: string;
  label: string;
  description: string;
  avatar_spec: BotAvatarSpec;
  current_mood: WorkingMood;
  is_chief_of_staff: boolean;
  routing_target: string;
  created_at: string;
  updated_at: string;
}

export type Modality = 'text' | 'code' | 'vision' | 'image' | 'video' | 'tts' | 'stt' | 'audio';
export type ProviderTier = 'free' | 'oauth_sub' | 'paid';

export const ROUTING_STRATEGIES = [
  'priority',
  'weighted',
  'round-robin',
  'context-relay',
  'fill-first',
  'p2c',
  'random',
  'least-used',
  'cost-optimized',
  'reset-aware',
  'reset-window',
  'headroom',
  'quota-weighted',
  'strict-random',
  'auto',
  'lkgp',
  'context-optimized',
  'cache-optimized',
  'fusion',
  'pipeline',
] as const;

export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number];

export interface CloudProviderSpec {
  id: string;
  name: string;
  protocol: string;
  endpoint: UnsetOr<string>;
  tier: ProviderTier;
  auth_type: 'api_key' | 'oauth_sub';
  modalities: Modality[];
  context_window: number;
  cost_per_1m_usd: number;
  default_model: string;
  priority: number;
  weight: number;
  avg_latency_ms: number;
  cache_hit_rate: number;
  quota_limit: number;
  remaining_quota?: number;
  reset_at?: string | null;
  healthy?: boolean;
  usage_count?: number;
  notes?: string;
}

export type CavemanIntensity = 'light' | 'medium' | 'aggressive';

export interface VaultSecretMetadata {
  key_name: string;
  provider_hint: string;
  configured: true;
  sha256_fingerprint: string;
  created_at: string;
  updated_at: string;
}

export interface DeviceAuthRecord {
  id: string;
  name: string;
  platform: string;
  ed25519_pubkey: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface MediaJobRecord {
  id: string;
  bot_id: string | null;
  modality: 'image' | 'video' | 'tts' | 'stt' | 'vision';
  provider_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress_pct: number;
  result_path: string | null;
  error_message: string | null;
}
