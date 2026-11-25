import type {
  ActionQueueItem,
  BotRecord,
  CloudProviderSpec,
  EventEnvelope,
  RoutingStrategy,
  UiLocale,
  UserPreferences,
  VaultSecretMetadata,
} from '../core/types';
import type { StorageGcResult, StorageStats } from '../core/storage';
import type { RouteDecision } from '../core/router/engine';
import type { CompressionResult, VerifyRtkReport } from '../core/router/compression';
import type { EndpointValidationResult } from '../core/router/endpointGuard';
import type { MemSearchIndexRow, MemoryObservation } from '../core/memory';
import type { BackupManifest } from '../core/backup';
import type { InstalledSkillRecord, LoadedSkillResult, SkillActivationMode, StaticScanResult } from '../core/skills';
import type { HumanizerResult, ImpeccableAuditResult, DesignSystemPreset } from '../core/tools';
import type { ChatMessageRecord, ReviewerVerdict } from '../core/agent';
import type {
  BrowserEngineChoice,
  ComputerBackendId,
  ComputerSessionSnapshot,
  TaughtTaskRecord,
} from '../core/computer';
import type { McpServerEntry, ReEngineProbe } from '../core/mcp';
import type {
  AndroidDeviceCapability,
  AndroidTauriPluginSpec,
  DevicePermissionPolicy,
  DevicePermissionRecord,
  PairingOffer,
} from '../core/pairing';
import type { DeviceAuthRecord } from '../core/types';
import type {
  XActiveTimezone,
  XBridgeSnapshot,
  XDisplayMode,
  XDraftRecord,
  XShieldEvaluation,
  XTriggerEventRecord,
  XTriggerKind,
  XWriteActionKind,
} from '../core/x-bridge';
import type {
  ParsedNaturalSchedule,
  RoutineRecord,
  RoutineRunRecord,
  RoutineTriggerType,
} from '../core/scheduler';
import type {
  ChannelMessageRecord,
  ChannelMode,
  ChannelRecord,
  DelegationRecord,
} from '../core/channels';
import type {
  BotMrrTeamPackage,
  CatalogSkillTemplate,
  SkillInstallSourceType,
  SkillLockHistoryRecord,
  SkillsLockfile,
  TinkabotEndpointSpec,
  TinkabotSynthesisResult,
} from '../core/ecosystem';
import type {
  AccessEvaluationResult,
  CloudBackupConfig,
  CrossArchPortabilityReport,
  ProtectedResourceKind,
  RbacMode,
  RbacState,
  TeamRole,
  UpdaterStatus,
} from '../core/ops';

export interface LibraryItemView {
  id: string;
  kind: string;
  title: string;
  size_bytes: number;
  pinned: boolean;
  created_at: string;
}

export interface BootstrapResponse {
  preferences: UserPreferences;
  i18n: {
    locale: UiLocale;
    supported: UiLocale[];
    bundle: Record<string, string>;
  };
  stats: StorageStats;
  bots: BotRecord[];
  action_queue: ActionQueueItem[];
  events: EventEnvelope[];
  catalog: {
    schema_version: string;
    policy: string;
    totals: {
      supported_cloud_providers: number;
      free_tier_cloud_providers: number;
      supported_models: number;
    };
    strategies: RoutingStrategy[];
    virtual_combos: string[];
    providers: CloudProviderSpec[];
  };
  vault: VaultSecretMetadata[];
  memory_sessions: Array<{
    id: string;
    title: string;
    observation_count: number;
    started_at: string;
  }>;
  library_items: LibraryItemView[];
  skills: InstalledSkillRecord[];
  skill_index: {
    entries: Array<{ slug: string; name: string; mode: SkillActivationMode; summary: string }>;
    estimated_tokens: number;
    within_budget: boolean;
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  bootstrap: () => requestJson<BootstrapResponse>('/api/bootstrap'),

  updatePreferences: (patch: Partial<UserPreferences>) =>
    requestJson<{ preferences: UserPreferences; bundle: Record<string, string> }>(
      '/api/preferences',
      { method: 'PATCH', body: JSON.stringify(patch) }
    ),

  resumeEvents: (resumeFrom: number) =>
    requestJson<{ resume_from: number; count: number; events: EventEnvelope[] }>(
      `/api/events?resume_from=${encodeURIComponent(resumeFrom)}`
    ),

  enqueueAction: (title: string, summary: string, kind = 'approval') =>
    requestJson<{ item: ActionQueueItem; stats: StorageStats }>('/api/action-queue', {
      method: 'POST',
      body: JSON.stringify({ title, summary, kind }),
    }),

  resolveAction: (id: string, decision: 'approved' | 'denied') =>
    requestJson<{ item: ActionQueueItem; stats: StorageStats }>(
      `/api/action-queue/${encodeURIComponent(id)}/resolve`,
      { method: 'POST', body: JSON.stringify({ decision }) }
    ),

  validateEndpoint: (endpoint: string, providerId?: string) =>
    requestJson<EndpointValidationResult>('/api/router/validate-endpoint', {
      method: 'POST',
      body: JSON.stringify({ endpoint, provider_id: providerId }),
    }),

  configureVoxCpm2: (endpoint: string) =>
    fetch('/api/router/voxcpm2-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).then(async (r) => ({ status: r.status, data: await r.json() })),

  routeRequest: (payload: {
    target: string;
    strategy?: RoutingStrategy;
    required_context_tokens?: number;
    free_only_override?: boolean;
    simulate_free_exhausted?: boolean;
  }) =>
    requestJson<{ decision: RouteDecision; stats: StorageStats }>('/api/router/route', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  runCompression: (payload: {
    text: string;
    role: string;
    enable_rtk: boolean;
    caveman_intensity: string;
  }) =>
    requestJson<CompressionResult>('/api/compression/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyRtk: () =>
    requestJson<VerifyRtkReport>('/api/compression/verify-rtk', { method: 'POST' }),

  storeSecret: (key_name: string, value: string, provider_hint: string) =>
    requestJson<{
      secret: VaultSecretMetadata;
      secrets: VaultSecretMetadata[];
      stats: StorageStats;
    }>('/api/vault/secrets', {
      method: 'POST',
      body: JSON.stringify({ key_name, value, provider_hint }),
    }),

  deleteSecret: (keyName: string) =>
    requestJson<{ deleted: boolean; secrets: VaultSecretMetadata[]; stats: StorageStats }>(
      `/api/vault/secrets/${encodeURIComponent(keyName)}`,
      { method: 'DELETE' }
    ),

  redactText: (text: string) =>
    requestJson<{ redacted: string; matches_removed: number }>('/api/vault/redact', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  recordObservation: (payload: {
    title: string;
    body: string;
    tags: string;
    kind: string;
  }) =>
    requestJson<{
      observation: MemoryObservation;
      sessions: BootstrapResponse['memory_sessions'];
      stats: StorageStats;
    }>('/api/memory/observations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  searchMemoryIndex: (q: string) =>
    requestJson<{ results: MemSearchIndexRow[] }>(
      `/api/memory/search/index?q=${encodeURIComponent(q)}`
    ),

  searchMemoryTimeline: (id: string) =>
    requestJson<{ timeline: MemSearchIndexRow[] }>(
      `/api/memory/search/timeline/${encodeURIComponent(id)}`
    ),

  searchMemoryDetails: (ids: string[]) =>
    requestJson<{ observations: MemoryObservation[] }>('/api/memory/search/details', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  createBackup: (passphrase: string, mode: 'compact' | 'full') =>
    requestJson<{
      size_bytes: number;
      manifest: BackupManifest;
      archive_base64: string;
      stats: StorageStats;
    }>('/api/backup/create', {
      method: 'POST',
      body: JSON.stringify({ passphrase, mode }),
    }),

  verifyBackup: (archive_base64: string, passphrase: string) =>
    fetch('/api/backup/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archive_base64, passphrase }),
    }).then(async (r) => ({ status: r.status, data: await r.json() })),

  runStorageGc: () =>
    requestJson<{
      result: StorageGcResult;
      library_items: LibraryItemView[];
      stats: StorageStats;
    }>('/api/storage/gc', { method: 'POST' }),

  seedStaleLibraryCache: () =>
    requestJson<{
      id: string;
      library_items: LibraryItemView[];
      stats: StorageStats;
    }>('/api/storage/library/seed-stale', { method: 'POST' }),

  // Phase 2: Bots CRUD (Avatar Studio & Mood)
  createBot: (payload: {
    name: string;
    label?: string;
    description?: string;
    avatar_spec?: BotRecord['avatar_spec'];
    routing_target?: string;
  }) =>
    requestJson<{ bot: BotRecord; bots: BotRecord[] }>('/api/bots', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBot: (
    id: string,
    patch: Partial<
      Pick<
        BotRecord,
        'name' | 'label' | 'description' | 'avatar_spec' | 'current_mood' | 'routing_target'
      >
    >
  ) =>
    requestJson<{ bot: BotRecord; bots: BotRecord[] }>(`/api/bots/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Phase 2: Chat Agent Loop & Interactive Draft Cards
  listMessages: (botId: string) =>
    requestJson<{ messages: ChatMessageRecord[] }>(
      `/api/chat/${encodeURIComponent(botId)}/messages`
    ),

  sendMessage: (botId: string, text: string) =>
    requestJson<{
      user_message: ChatMessageRecord;
      assistant_message: ChatMessageRecord;
      telemetry: {
        provider_id: string;
        model: string;
        tier: string;
        savings_pct: number;
        cost_usd: number;
        active_skills: string[];
        reviewer_verdict: ReviewerVerdict;
      };
      messages: ChatMessageRecord[];
      bots: BotRecord[];
      action_queue: ActionQueueItem[];
      stats: StorageStats;
    }>(`/api/chat/${encodeURIComponent(botId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  mutateDraft: (
    messageId: string,
    action: 'edit' | 'humanize' | 'approve_send' | 'save' | 'discard',
    patch?: { to?: string; subject?: string; body?: string }
  ) =>
    requestJson<{
      message: ChatMessageRecord;
      bots: BotRecord[];
      stats: StorageStats;
    }>(`/api/chat/drafts/${encodeURIComponent(messageId)}`, {
      method: 'POST',
      body: JSON.stringify({ action, ...patch }),
    }),

  // Phase 2: Skills Manager (23 Built-in Packs + Static Scanner)
  updateSkillMode: (slug: string, activation_mode: SkillActivationMode) =>
    requestJson<{ skill: InstalledSkillRecord; skills: InstalledSkillRecord[] }>(
      `/api/skills/${encodeURIComponent(slug)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ activation_mode }),
      }
    ),

  loadSkill: (slug: string) =>
    fetch('/api/skills/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    }).then(async (r) => ({ status: r.status, data: (await r.json()) as LoadedSkillResult })),

  installSkill: (payload: {
    slug: string;
    name: string;
    description: string;
    skill_md: string;
    keywords?: string[];
  }) =>
    requestJson<{
      installed: boolean;
      scan: StaticScanResult;
      skill?: InstalledSkillRecord;
      action_queue_id?: string;
      skills: InstalledSkillRecord[];
      action_queue: ActionQueueItem[];
      stats: StorageStats;
    }>('/api/skills/install', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Phase 2: Permanent Core Tools
  runImpeccable: (source: string) =>
    requestJson<ImpeccableAuditResult>('/api/tools/impeccable', {
      method: 'POST',
      body: JSON.stringify({ source }),
    }),

  runUiUxBm25: (query: string) =>
    requestJson<{
      query: string;
      llm_tokens_used: 0;
      best_match: DesignSystemPreset;
      candidates: Array<DesignSystemPreset & { score: number }>;
    }>('/api/tools/ui-ux-bm25', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  runHumanizer: (text: string) =>
    requestJson<HumanizerResult>('/api/tools/humanizer', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  runMultimodal: (payload: {
    bot_id: string;
    modality: 'image' | 'video' | 'tts' | 'stt' | 'vision';
    prompt: string;
    use_voxcpm2?: boolean;
  }) =>
    fetch('/api/tools/multimodal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        ok: boolean;
        decision: RouteDecision;
        job_id?: string;
        status?: string;
      },
    })),

  evaluateReviewer: (payload: { tool: string; target: string; summary: string }) =>
    requestJson<ReviewerVerdict>('/api/reviewer/evaluate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Phase 3: qyro-computer
  getComputerState: () =>
    requestJson<{
      snapshot: ComputerSessionSnapshot;
      backends: Array<{
        id: ComputerBackendId;
        name: string;
        target: string;
        transport: string;
        summary: string;
      }>;
    }>('/api/computer/state'),

  updateComputerConfig: (patch: {
    backend?: ComputerBackendId;
    browser_engine?: BrowserEngineChoice;
    cgroups_ram_limit_mb?: number;
    cpu_quota_pct?: number;
    max_tabs?: number;
    idle_sleep_min?: number;
  }) =>
    requestJson<{ snapshot: ComputerSessionSnapshot; preferences: UserPreferences }>(
      '/api/computer/config',
      { method: 'PATCH', body: JSON.stringify(patch) }
    ),

  openComputerTab: (url: string, title?: string) =>
    fetch('/api/computer/tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title }),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as { ok: boolean; error?: string; snapshot: ComputerSessionSnapshot },
    })),

  closeComputerTab: (tabId: string) =>
    requestJson<{ snapshot: ComputerSessionSnapshot }>(
      `/api/computer/tabs/${encodeURIComponent(tabId)}`,
      { method: 'DELETE' }
    ),

  sleepComputer: () =>
    requestJson<{ snapshot: ComputerSessionSnapshot; stats: StorageStats }>('/api/computer/sleep', {
      method: 'POST',
    }),

  wakeComputer: () =>
    requestJson<{ snapshot: ComputerSessionSnapshot }>('/api/computer/wake', {
      method: 'POST',
    }),

  recoverComputerWatchdog: () =>
    requestJson<{ recovered: boolean; restarts: number; snapshot: ComputerSessionSnapshot }>(
      '/api/computer/watchdog/recover',
      { method: 'POST' }
    ),

  startComputerTakeover: (bot_id: string, reason: string) =>
    requestJson<{
      snapshot: ComputerSessionSnapshot;
      action_queue: ActionQueueItem[];
      stats: StorageStats;
    }>('/api/computer/takeover/start', {
      method: 'POST',
      body: JSON.stringify({ bot_id, reason }),
    }),

  endComputerTakeover: () =>
    requestJson<{
      snapshot: ComputerSessionSnapshot;
      action_queue: ActionQueueItem[];
      stats: StorageStats;
    }>('/api/computer/takeover/end', { method: 'POST' }),

  runComputerPty: (cmd: string) =>
    requestJson<{ snapshot: ComputerSessionSnapshot }>('/api/computer/pty', {
      method: 'POST',
      body: JSON.stringify({ cmd }),
    }),

  startTeachTask: () =>
    requestJson<{ snapshot: ComputerSessionSnapshot }>('/api/computer/teach/start', {
      method: 'POST',
    }),

  addTeachStep: (action: 'navigate' | 'click' | 'type' | 'pty_command' | 'assert', target: string, value?: string) =>
    requestJson<{ snapshot: ComputerSessionSnapshot }>('/api/computer/teach/step', {
      method: 'POST',
      body: JSON.stringify({ action, target, value }),
    }),

  saveTeachTask: (name: string, description: string, bot_id?: string) =>
    requestJson<{ task: TaughtTaskRecord; snapshot: ComputerSessionSnapshot; stats: StorageStats }>(
      '/api/computer/teach/save',
      { method: 'POST', body: JSON.stringify({ name, description, bot_id }) }
    ),

  replayTeachTask: (taskId: string) =>
    requestJson<{ ok: boolean; steps_executed: number; snapshot: ComputerSessionSnapshot }>(
      `/api/computer/teach/${encodeURIComponent(taskId)}/replay`,
      { method: 'POST' }
    ),

  // Phase 3: Permanent REA MCP Bridge
  getMcpState: () =>
    requestJson<{
      probes: ReEngineProbe[];
      servers: McpServerEntry[];
      tools: Array<{ name: string; description: string }>;
    }>('/api/mcp/state'),

  callMcpRpc: (payload: { id?: number | string; method: string; params?: Record<string, unknown> }) =>
    requestJson<Record<string, unknown>>('/api/mcp/rpc', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', ...payload }),
    }),

  registerMcpServer: (payload: {
    name: string;
    transport: 'stdio' | 'streamable_http';
    endpoint_or_cmd: string;
  }) =>
    requestJson<{ server: McpServerEntry; servers: McpServerEntry[] }>('/api/mcp/servers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Phase 3: QR Pairing (Ed25519) & Android Tauri Plugins
  getPairingState: () =>
    requestJson<{
      server_ed25519_pubkey: string;
      devices: DeviceAuthRecord[];
      permissions: DevicePermissionRecord[];
      android_plugins: AndroidTauriPluginSpec[];
    }>('/api/pairing/state'),

  createPairingOffer: (server_url?: string) =>
    requestJson<{ offer: PairingOffer }>('/api/pairing/offer', {
      method: 'POST',
      body: JSON.stringify({ server_url }),
    }),

  simulatePairingHandshake: (payload: {
    one_time_pairing_token: string;
    device_name: string;
    platform?: string;
  }) =>
    fetch('/api/pairing/simulate-handshake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        ok: boolean;
        error?: string;
        device?: DeviceAuthRecord;
        session_token?: string;
        devices: DeviceAuthRecord[];
        permissions: DevicePermissionRecord[];
      },
    })),

  revokeDevice: (deviceId: string) =>
    requestJson<{ device: DeviceAuthRecord; devices: DeviceAuthRecord[]; stats: StorageStats }>(
      `/api/pairing/devices/${encodeURIComponent(deviceId)}/revoke`,
      { method: 'POST' }
    ),

  setDevicePermission: (
    device_id: string,
    capability: AndroidDeviceCapability,
    policy: DevicePermissionPolicy
  ) =>
    requestJson<{ permission: DevicePermissionRecord; permissions: DevicePermissionRecord[] }>(
      '/api/pairing/permissions',
      { method: 'PATCH', body: JSON.stringify({ device_id, capability, policy }) }
    ),

  requestDevicePermission: (payload: {
    bot_id: string;
    device_id: string;
    capability: string;
    reason: string;
  }) =>
    fetch('/api/pairing/permissions/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        allowed_immediately?: boolean;
        denied?: boolean;
        error?: string;
        pending_request?: { action_id: string; expires_at: string; fail_closed_seconds: number };
        action_queue: ActionQueueItem[];
        stats: StorageStats;
      },
    })),

  simulateAndroidShare: (payload: { bot_id: string; title: string; text: string }) =>
    requestJson<{
      bots: BotRecord[];
      action_queue: ActionQueueItem[];
      stats: StorageStats;
    }>('/api/android/share', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Phase 4: qyro-x-bridge (Free Self-Auth X + 6-Layer Anti-Ban Shield)
  getXBridgeState: () => requestJson<{ snapshot: XBridgeSnapshot }>('/api/x-bridge/state'),

  startXSelfAuthTakeover: (bot_id: string) =>
    requestJson<{
      snapshot: XBridgeSnapshot;
      computer_tab_opened: boolean;
      action_queue: ActionQueueItem[];
      stats: StorageStats;
    }>('/api/x-bridge/auth/takeover', {
      method: 'POST',
      body: JSON.stringify({ bot_id }),
    }),

  completeXSelfAuth: (payload: {
    handle: string;
    pinned_ip: string;
    browser_engine?: BrowserEngineChoice;
    warmup_day?: number;
  }) =>
    requestJson<{ snapshot: XBridgeSnapshot; stats: StorageStats }>('/api/x-bridge/auth/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  extractXManifest: (bundle_text: string, source_label?: string) =>
    fetch('/api/x-bridge/manifest/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle_text, source_label }),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        ok: boolean;
        extracted_query_count: number;
        extracted_switch_count: number;
        error?: string;
        snapshot: XBridgeSnapshot;
      },
    })),

  resetXManifest: () =>
    requestJson<{ snapshot: XBridgeSnapshot }>('/api/x-bridge/manifest/reset', {
      method: 'POST',
    }),

  updateXShieldConfig: (
    patch: Partial<{
      browser_engine: BrowserEngineChoice;
      display_mode: XDisplayMode;
      pinned_ip: string;
      warmup_day: number;
      active_tz: XActiveTimezone;
      active_start_hour: number;
      active_end_hour: number;
      alt_allowlist: string[];
    }>
  ) =>
    requestJson<{ snapshot: XBridgeSnapshot }>('/api/x-bridge/shield', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  proposeXDraft: (payload: {
    bot_id: string;
    action_kind: XWriteActionKind;
    raw_text: string;
    target_ref?: string;
  }) =>
    requestJson<{
      draft: XDraftRecord;
      snapshot: XBridgeSnapshot;
      action_queue: ActionQueueItem[];
      stats: StorageStats;
    }>('/api/x-bridge/drafts/propose', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  approveXDraft: (
    draftId: string,
    payload?: { edited_text?: string; outbound_ip?: string }
  ) =>
    fetch(`/api/x-bridge/drafts/${encodeURIComponent(draftId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        ok: boolean;
        evaluation: XShieldEvaluation;
        draft: XDraftRecord | null;
        snapshot: XBridgeSnapshot;
      },
    })),

  tripXCircuitBreaker: (payload: {
    bot_id: string;
    http_status?: number;
    body_snippet?: string;
    reason?: string;
  }) =>
    requestJson<{
      tripped: boolean;
      reason: string;
      snapshot: XBridgeSnapshot;
      action_queue: ActionQueueItem[];
    }>('/api/x-bridge/circuit-breaker/trip', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resumeXCircuitBreaker: () =>
    requestJson<{ snapshot: XBridgeSnapshot; stats: StorageStats }>(
      '/api/x-bridge/circuit-breaker/resume',
      { method: 'POST' }
    ),

  ingestXTrigger: (payload: {
    trigger_kind: XTriggerKind;
    bot_id: string;
    source_handle: string;
    source_text: string;
    folder_or_thread?: string;
  }) =>
    fetch('/api/x-bridge/triggers/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        accepted: boolean;
        error?: string;
        trigger?: XTriggerEventRecord;
        draft?: XDraftRecord;
        snapshot: XBridgeSnapshot;
      },
    })),

  // Phase 5: Channels & Routines
  getChannelsState: (channelId?: string) =>
    requestJson<{
      channels: ChannelRecord[];
      active_channel_id: string | null;
      messages: ChannelMessageRecord[];
      delegations: DelegationRecord[];
    }>(
      channelId
        ? `/api/channels/state?channel_id=${encodeURIComponent(channelId)}`
        : '/api/channels/state'
    ),

  createChannel: (payload: { name: string; mode: ChannelMode; member_bot_ids?: string[] }) =>
    requestJson<{ channel: ChannelRecord; channels: ChannelRecord[] }>('/api/channels', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  postChannelMessage: (channelId: string, content: string) =>
    requestJson<{
      user_message: ChannelMessageRecord;
      bot_replies: ChannelMessageRecord[];
      channel_messages: ChannelMessageRecord[];
      routing_latency_ms: number;
    }>(`/api/channels/${encodeURIComponent(channelId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  pokeBot: (payload: { from_bot_id: string; to_bot_id: string; task_summary: string }) =>
    requestJson<{
      delegation: DelegationRecord;
      delegations: DelegationRecord[];
      stats: StorageStats;
    }>('/api/channels/poke', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getRoutinesState: () =>
    requestJson<{ routines: RoutineRecord[]; runs: RoutineRunRecord[] }>('/api/routines/state'),

  parseRoutineSchedule: (input: string) =>
    requestJson<ParsedNaturalSchedule>('/api/routines/parse', {
      method: 'POST',
      body: JSON.stringify({ input }),
    }),

  createRoutine: (payload: {
    bot_id: string;
    name: string;
    trigger_type: RoutineTriggerType;
    schedule_input: string;
    prompt: string;
  }) =>
    fetch('/api/routines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        ok: boolean;
        error?: string;
        routine?: RoutineRecord;
        parsed?: ParsedNaturalSchedule;
        routines: RoutineRecord[];
      },
    })),

  toggleRoutine: (id: string, enabled: boolean) =>
    requestJson<{ routine: RoutineRecord; routines: RoutineRecord[] }>(
      `/api/routines/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify({ enabled }) }
    ),

  deleteRoutine: (id: string) =>
    requestJson<{ deleted: boolean; routines: RoutineRecord[]; runs: RoutineRunRecord[] }>(
      `/api/routines/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    ),

  runRoutineNow: (id: string, context?: string) =>
    requestJson<{
      ok: boolean;
      error?: string;
      run?: RoutineRunRecord;
      routines: RoutineRecord[];
      runs: RoutineRunRecord[];
    }>(`/api/routines/${encodeURIComponent(id)}/run`, {
      method: 'POST',
      body: JSON.stringify({ context }),
    }),

  triggerRoutineWebhook: (
    id: string,
    payload: { secret: string; payload: string; signature?: string }
  ) =>
    fetch(`/api/routines/${encodeURIComponent(id)}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        ok: boolean;
        verified: boolean;
        signature?: string;
        error?: string;
        routines?: RoutineRecord[];
        runs?: RoutineRunRecord[];
      },
    })),

  // Phase 5: Ecosystem (Skill Installer, Tinkabot, BotMRR)
  getEcosystemState: () =>
    requestJson<{
      lockfile: SkillsLockfile;
      lock_history: SkillLockHistoryRecord[];
      catalog: CatalogSkillTemplate[];
      skills_count: number;
    }>('/api/ecosystem/state'),

  installEcosystemSkill: (payload: {
    source_type: SkillInstallSourceType;
    source_ref: string;
    slug?: string;
    name?: string;
    version?: string;
    description?: string;
    skill_md?: string;
    keywords?: string[];
  }) =>
    fetch('/api/ecosystem/skills/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        installed: boolean;
        requires_trust_review: boolean;
        error?: string;
        scan?: StaticScanResult;
        lockfile: SkillsLockfile;
        lock_history: SkillLockHistoryRecord[];
        skills: InstalledSkillRecord[];
      },
    })),

  rollbackSkillsLock: (history_id?: string) =>
    fetch('/api/ecosystem/skills/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history_id }),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        rolled_back: boolean;
        error?: string;
        removed_slugs: string[];
        lockfile: SkillsLockfile;
        lock_history: SkillLockHistoryRecord[];
      },
    })),

  synthesizeTinkabot: (payload: {
    service_name: string;
    base_url: string;
    auth_header?: string;
    vault_secret_name: string;
    endpoints: TinkabotEndpointSpec[];
    install?: boolean;
  }) =>
    fetch('/api/ecosystem/tinkabot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as TinkabotSynthesisResult & {
        lockfile: SkillsLockfile;
        lock_history: SkillLockHistoryRecord[];
      },
    })),

  exportBotMrrPackage: (payload: {
    package_name: string;
    author?: string;
    description?: string;
  }) =>
    requestJson<{ package: BotMrrTeamPackage }>('/api/ecosystem/botmrr/export', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  importBotMrrPackage: (pkg: BotMrrTeamPackage) =>
    fetch('/api/ecosystem/botmrr/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg }),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        ok: boolean;
        error?: string;
        imported_bots: number;
        imported_skills: number;
        skipped_existing_bots: number;
        zero_secret_verified: boolean;
      },
    })),

  // Phase 5: Ops (Live Team RBAC, Cloud R2/S3, Cross-Arch, Auto-Updater)
  getOpsState: () =>
    requestJson<{
      rbac: RbacState;
      cloud_backup: CloudBackupConfig;
      portability: CrossArchPortabilityReport;
      updater: UpdaterStatus;
    }>('/api/ops/state'),

  setRbacMode: (mode: RbacMode, active_user_id?: string) =>
    requestJson<{ rbac: RbacState }>('/api/ops/rbac/mode', {
      method: 'PATCH',
      body: JSON.stringify({ mode, active_user_id }),
    }),

  addTeamMember: (payload: { email: string; display_name: string; role: TeamRole }) =>
    fetch('/api/ops/rbac/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as { ok: boolean; error?: string; state: RbacState },
    })),

  removeTeamMember: (id: string) =>
    requestJson<{ ok: boolean; error?: string; state: RbacState }>(
      `/api/ops/rbac/members/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    ),

  evaluateRbacAccess: (payload: {
    actor_user_id: string;
    resource_owner_id: string;
    resource_kind: ProtectedResourceKind;
  }) =>
    requestJson<AccessEvaluationResult>('/api/ops/rbac/evaluate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCloudBackup: (patch: Partial<CloudBackupConfig>) =>
    fetch('/api/ops/cloud-backup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as { ok: boolean; error?: string; config: CloudBackupConfig },
    })),

  verifyUpdaterDemo: (payload: {
    version: string;
    arch: 'linux/amd64' | 'linux/arm64';
    tamper: boolean;
  }) =>
    fetch('/api/ops/updater/verify-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({
      status: r.status,
      data: (await r.json()) as {
        verified: boolean;
        rolled_back: boolean;
        sha256: string;
        message: string;
        updater: UpdaterStatus;
      },
    })),
};

