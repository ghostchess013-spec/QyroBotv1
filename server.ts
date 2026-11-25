import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { QyroI18n, resolveTimezone } from './src/core/i18n';
import { QyroStorage } from './src/core/storage';
import { QyroVault } from './src/core/vault';
import { QyroMemory } from './src/core/memory';
import { QyroBackup, type BackupMode } from './src/core/backup';
import { OmniRouteEngine } from './src/core/router/engine';
import { validateCloudEndpoint } from './src/core/router/endpointGuard';
import { compressContext, runVerifyRtkGate } from './src/core/router/compression';
import { QyroSkillsManager, type SkillActivationMode } from './src/core/skills';
import {
  dispatchMultimodalTool,
  generateDesignSystemBm25,
  runHumanizerPass,
  runImpeccable62Audit,
} from './src/core/tools';
import { QyroAgentEngine, evaluateReviewerAgent } from './src/core/agent';
import { COMPUTER_BACKENDS, QyroComputerEngine } from './src/core/computer';
import { QyroReaMcpBridge, REA_MCP_TOOL_CATALOG } from './src/core/mcp';
import {
  ANDROID_5_TAURI_PLUGINS,
  QyroPairingManager,
  type AndroidDeviceCapability,
  type DevicePermissionPolicy,
} from './src/core/pairing';
import {
  QyroXBridgeEngine,
  type XActiveTimezone,
  type XDisplayMode,
  type XTriggerKind,
  type XWriteActionKind,
} from './src/core/x-bridge';
import {
  QyroSchedulerEngine,
  computeWebhookHmac,
  parseNaturalSchedule,
  verifyWebhookHmac,
  type RoutineTriggerType,
} from './src/core/scheduler';
import { QyroChannelsEngine, type ChannelMode } from './src/core/channels';
import { QyroEcosystemManager, type SkillInstallSourceType } from './src/core/ecosystem';
import {
  QyroOpsManager,
  type ProtectedResourceKind,
  type RbacMode,
  type TeamRole,
} from './src/core/ops';
import type { CavemanIntensity, RoutingStrategy, UiLocale } from './src/core/types';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const dbPath = path.resolve(process.cwd(), 'data/qyrobot.db');
  const i18n = new QyroI18n();
  const storage = new QyroStorage(dbPath);
  const vault = new QyroVault(storage);
  const memory = new QyroMemory(storage);
  const backup = new QyroBackup(storage);
  const router = new OmniRouteEngine(storage);
  const skills = new QyroSkillsManager(storage);
  const agent = new QyroAgentEngine(storage, memory, skills, router);
  const computer = new QyroComputerEngine(storage, memory);
  const mcp = new QyroReaMcpBridge(storage);
  const pairing = new QyroPairingManager(storage);
  const xBridge = new QyroXBridgeEngine(storage, computer);
  const scheduler = new QyroSchedulerEngine(storage);
  const channels = new QyroChannelsEngine(storage);
  const ecosystem = new QyroEcosystemManager(storage, skills);
  const ops = new QyroOpsManager(storage);

  // Health & Bootstrap
  app.get('/api/bootstrap', (_req, res) => {
    const prefs = storage.getPreferences();
    const bots = storage.listBots();
    res.json({
      preferences: prefs,
      i18n: {
        locale: prefs.ui_locale,
        supported: i18n.getSupportedLocales(),
        bundle: i18n.getBundle(prefs.ui_locale),
      },
      stats: storage.getStats(),
      bots,
      action_queue: storage.listActionQueue(),
      events: storage.resumeEvents(0, 50),
      catalog: router.getCatalogSummary(),
      vault: vault.listMetadata(),
      memory_sessions: memory.listSessions(),
      library_items: storage.listLibraryItems(),
      skills: skills.listSkills(),
      skill_index: skills.buildLayer1Index(prefs.skill_index_token_budget),
    });
  });

  // Phase 2: Bots CRUD (Avatar Studio & Mood persistence)
  app.post('/api/bots', (req, res) => {
    try {
      const { name, label, description, avatar_spec, routing_target } = req.body ?? {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Bot name is required' });
        return;
      }
      const created = storage.createBot({
        name: name.trim(),
        label: String(label ?? 'Specialist Bot'),
        description: String(description ?? ''),
        avatar_spec: avatar_spec ?? {
          type: 'procedural',
          shape: 'squircle',
          color: 'green',
          expression: 'happy',
          animationOverride: null,
          assetPath: null,
        },
        routing_target: String(routing_target ?? 'auto/fast'),
      });
      agent.ensureBotDirectChannel(created.id, created.name);
      res.status(201).json({ bot: created, bots: storage.listBots() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create bot' });
    }
  });

  app.patch('/api/bots/:id', (req, res) => {
    const updated = storage.updateBot(req.params.id, req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }
    res.json({ bot: updated, bots: storage.listBots() });
  });

  // Phase 2: Chat Agent Loop & Interactive Draft Cards
  app.get('/api/chat/:botId/messages', (req, res) => {
    res.json({ messages: agent.listMessagesForBot(req.params.botId) });
  });

  app.post('/api/chat/:botId/messages', (req, res) => {
    const text = String(req.body?.text ?? '').trim();
    if (!text) {
      res.status(400).json({ error: 'Message text is required' });
      return;
    }
    const result = agent.sendMessage({ bot_id: req.params.botId, text });
    res.status(201).json({
      ...result,
      messages: agent.listMessagesForBot(req.params.botId),
      bots: storage.listBots(),
      action_queue: storage.listActionQueue(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/chat/drafts/:messageId', (req, res) => {
    const { action, to, subject, body } = req.body ?? {};
    const validActions = ['edit', 'humanize', 'approve_send', 'save', 'discard'];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: 'Invalid draft action' });
      return;
    }
    const updated = agent.mutateDraftCard(req.params.messageId, action, { to, subject, body });
    if (!updated) {
      res.status(404).json({ error: 'Draft card message not found' });
      return;
    }
    res.json({
      message: updated,
      bots: storage.listBots(),
      stats: storage.getStats(),
    });
  });

  // Phase 2: Skills Manager (23 Built-in Packs + Progressive Disclosure + Static Scanner)
  app.get('/api/skills', (_req, res) => {
    const prefs = storage.getPreferences();
    res.json({
      skills: skills.listSkills(),
      index: skills.buildLayer1Index(prefs.skill_index_token_budget),
    });
  });

  app.patch('/api/skills/:slug', (req, res) => {
    const mode = req.body?.activation_mode as SkillActivationMode;
    if (!['auto', 'always_on', 'manual_only'].includes(mode)) {
      res.status(400).json({ error: 'Invalid activation_mode' });
      return;
    }
    const updated = skills.updateActivationMode(req.params.slug, mode);
    if (!updated) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ skill: updated, skills: skills.listSkills() });
  });

  app.post('/api/skills/load', (req, res) => {
    const slug = String(req.body?.slug ?? '');
    const loaded = skills.loadSkill(slug);
    res.status(loaded.ok ? 200 : 400).json(loaded);
  });

  app.post('/api/skills/install', (req, res) => {
    try {
      const { slug, name, description, skill_md, keywords } = req.body ?? {};
      const result = skills.installCustomSkill({
        slug: String(slug ?? ''),
        name: String(name ?? ''),
        description: String(description ?? ''),
        skill_md: String(skill_md ?? ''),
        keywords: Array.isArray(keywords) ? keywords.map(String) : undefined,
      });
      res.status(result.installed ? 201 : 202).json({
        ...result,
        skills: skills.listSkills(),
        action_queue: storage.listActionQueue(),
        stats: storage.getStats(),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Install failed' });
    }
  });

  // Phase 2: Permanent Core Tools (Impeccable 62-rule, UI-UX BM25, Humanizer, Multimodal, Reviewer)
  app.post('/api/tools/impeccable', (req, res) => {
    const source = String(req.body?.source ?? '');
    res.json(runImpeccable62Audit(source));
  });

  app.post('/api/tools/ui-ux-bm25', (req, res) => {
    const query = String(req.body?.query ?? '');
    res.json(generateDesignSystemBm25(query));
  });

  app.post('/api/tools/humanizer', (req, res) => {
    const text = String(req.body?.text ?? '');
    res.json(runHumanizerPass(text));
  });

  app.post('/api/tools/multimodal', (req, res) => {
    const { bot_id, modality, prompt, use_voxcpm2 } = req.body ?? {};
    const result = dispatchMultimodalTool(storage, router, {
      bot_id: String(bot_id ?? 'bot-chief-of-staff'),
      modality: modality ?? 'image',
      prompt: String(prompt ?? ''),
      use_voxcpm2: Boolean(use_voxcpm2),
    });
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/reviewer/evaluate', (req, res) => {
    const { tool, target, summary } = req.body ?? {};
    const verdict = evaluateReviewerAgent(storage, {
      tool: String(tool ?? ''),
      target: String(target ?? ''),
      summary: String(summary ?? ''),
    });
    res.json(verdict);
  });

  // =========================================================================
  // Phase 3: qyro-computer (Chromium + Camoufox + cgroups Watchdog + Teach a Task)
  // =========================================================================
  app.get('/api/computer/state', (_req, res) => {
    res.json({
      snapshot: computer.getSnapshot(),
      backends: COMPUTER_BACKENDS,
    });
  });

  app.patch('/api/computer/config', (req, res) => {
    const snapshot = computer.updateConfig(req.body ?? {});
    res.json({ snapshot, preferences: storage.getPreferences() });
  });

  app.post('/api/computer/tabs', (req, res) => {
    const { url, title } = req.body ?? {};
    const result = computer.openTab(String(url ?? 'https://example.com'), title ? String(title) : undefined);
    res.status(result.ok ? 201 : 400).json(result);
  });

  app.delete('/api/computer/tabs/:tabId', (req, res) => {
    res.json({ snapshot: computer.closeTab(req.params.tabId) });
  });

  app.post('/api/computer/sleep', (_req, res) => {
    res.json({ snapshot: computer.triggerIdleSleep(), stats: storage.getStats() });
  });

  app.post('/api/computer/wake', (_req, res) => {
    res.json({ snapshot: computer.wakeSandbox() });
  });

  app.post('/api/computer/watchdog/recover', (_req, res) => {
    res.json({ ...computer.simulateWatchdogCrashRecovery(), stats: storage.getStats() });
  });

  app.post('/api/computer/takeover/start', (req, res) => {
    const { bot_id, reason } = req.body ?? {};
    const snapshot = computer.startTakeover(String(bot_id ?? 'bot-chief-of-staff'), String(reason ?? ''));
    res.json({ snapshot, action_queue: storage.listActionQueue(), stats: storage.getStats() });
  });

  app.post('/api/computer/takeover/end', (_req, res) => {
    const snapshot = computer.endTakeover();
    res.json({ snapshot, action_queue: storage.listActionQueue(), stats: storage.getStats() });
  });

  app.post('/api/computer/pty', (req, res) => {
    const cmd = String(req.body?.cmd ?? '');
    res.json({ snapshot: computer.runPtyCommand(cmd) });
  });

  app.post('/api/computer/teach/start', (_req, res) => {
    res.json({ snapshot: computer.startRecordingTask() });
  });

  app.post('/api/computer/teach/step', (req, res) => {
    const { action, target, value } = req.body ?? {};
    res.json({
      snapshot: computer.recordStep({
        action: action ?? 'click',
        target: String(target ?? '#target'),
        value: value ? String(value) : undefined,
      }),
    });
  });

  app.post('/api/computer/teach/save', (req, res) => {
    const { bot_id, name, description } = req.body ?? {};
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Task name is required' });
      return;
    }
    const saved = computer.saveTaughtTask({
      bot_id: bot_id ? String(bot_id) : undefined,
      name: String(name),
      description: description ? String(description) : '',
    });
    res.status(201).json({ ...saved, stats: storage.getStats() });
  });

  app.post('/api/computer/teach/:taskId/replay', (req, res) => {
    const replayed = computer.replayTaughtTask(req.params.taskId);
    res.status(replayed.ok ? 200 : 404).json(replayed);
  });

  // =========================================================================
  // Phase 3: Permanent REA MCP Bridge (JSON-RPC 2.0 + Binary/AOB/Strings)
  // =========================================================================
  app.get('/api/mcp/state', (_req, res) => {
    res.json({
      probes: mcp.getProbes(),
      servers: mcp.listServers(),
      tools: REA_MCP_TOOL_CATALOG,
    });
  });

  app.post('/api/mcp/rpc', (req, res) => {
    const response = mcp.handleJsonRpc(req.body ?? { method: 'tools/list' });
    res.json(response);
  });

  app.post('/api/mcp/servers', (req, res) => {
    const { name, transport, endpoint_or_cmd } = req.body ?? {};
    if (!name || !endpoint_or_cmd) {
      res.status(400).json({ error: 'name and endpoint_or_cmd are required' });
      return;
    }
    const server = mcp.registerServer({
      name: String(name),
      transport: transport === 'streamable_http' ? 'streamable_http' : 'stdio',
      endpoint_or_cmd: String(endpoint_or_cmd),
    });
    res.status(201).json({ server, servers: mcp.listServers() });
  });

  // =========================================================================
  // Phase 3: QR Device Pairing (Ed25519) & 5 Native Android Tauri Plugins
  // =========================================================================
  app.get('/api/pairing/state', (_req, res) => {
    pairing.sweepExpiredPermissions();
    res.json({
      server_ed25519_pubkey: pairing.getServerPubKey(),
      devices: pairing.listDevices(),
      permissions: pairing.listDevicePermissions(),
      android_plugins: ANDROID_5_TAURI_PLUGINS,
    });
  });

  app.post('/api/pairing/offer', (req, res) => {
    const serverUrl =
      String(req.body?.server_url ?? '').trim() ||
      `${req.protocol}://${req.get('host') ?? 'localhost:3000'}`;
    const offer = pairing.createPairingOffer(serverUrl);
    res.status(201).json({ offer });
  });

  app.post('/api/pairing/simulate-handshake', (req, res) => {
    const { one_time_pairing_token, device_name, platform } = req.body ?? {};
    const result = pairing.simulateEd25519ClientHandshake({
      one_time_pairing_token: String(one_time_pairing_token ?? ''),
      device_name: String(device_name ?? 'Android Companion'),
      platform: platform ? String(platform) : 'android-14-arm64',
    });
    res.status(result.ok ? 201 : 400).json({
      ...result,
      devices: pairing.listDevices(),
      permissions: pairing.listDevicePermissions(),
    });
  });

  app.post('/api/pairing/devices/:id/revoke', (req, res) => {
    const revoked = pairing.revokeDevice(req.params.id);
    if (!revoked) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    res.json({
      device: revoked,
      devices: pairing.listDevices(),
      stats: storage.getStats(),
    });
  });

  app.patch('/api/pairing/permissions', (req, res) => {
    const { device_id, capability, policy } = req.body ?? {};
    const updated = pairing.setDevicePermissionPolicy(
      String(device_id ?? ''),
      capability as AndroidDeviceCapability,
      policy as DevicePermissionPolicy
    );
    res.json({
      permission: updated,
      permissions: pairing.listDevicePermissions(),
    });
  });

  app.post('/api/pairing/permissions/request', (req, res) => {
    const { bot_id, device_id, capability, reason } = req.body ?? {};
    const result = pairing.requestDevicePermission({
      bot_id: String(bot_id ?? 'bot-chief-of-staff'),
      device_id: String(device_id ?? ''),
      capability: String(capability ?? ''),
      reason: String(reason ?? 'Android device capability request'),
    });
    res.status(result.denied ? 403 : 200).json({
      ...result,
      action_queue: storage.listActionQueue(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/pairing/permissions/sweep-expired', (_req, res) => {
    const expired_count = pairing.sweepExpiredPermissions();
    res.json({
      expired_count,
      action_queue: storage.listActionQueue(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/android/share', (req, res) => {
    const { bot_id, title, text } = req.body ?? {};
    const targetBot = String(bot_id ?? 'bot-chief-of-staff');
    const sharedText = `[Android Share Sheet] ${title ? `${title}: ` : ''}${String(text ?? '').trim()}`;
    const result = agent.sendMessage({ bot_id: targetBot, text: sharedText });
    res.status(201).json({
      ...result,
      bots: storage.listBots(),
      action_queue: storage.listActionQueue(),
      stats: storage.getStats(),
    });
  });

  // Preferences & i18n
  app.patch('/api/preferences', (req, res) => {
    try {
      const body = req.body ?? {};
      if (typeof body.timezone === 'string') {
        body.timezone = resolveTimezone(body.timezone);
      }
      const updated = storage.updatePreferences(body);
      res.json({
        preferences: updated,
        bundle: i18n.getBundle(updated.ui_locale),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid preferences' });
    }
  });

  app.get('/api/i18n/:locale', (req, res) => {
    const loc = (req.params.locale === 'en-US' ? 'en-US' : 'id-ID') as UiLocale;
    res.json({ locale: loc, bundle: i18n.getBundle(loc) });
  });

  // Event Log & Gapless Resume (last_event_id)
  app.get('/api/events', (req, res) => {
    const resumeFrom = Number(req.query.resume_from ?? 0);
    const limit = Number(req.query.limit ?? 100);
    const events = storage.resumeEvents(resumeFrom, limit);
    res.json({
      resume_from: resumeFrom,
      count: events.length,
      events,
    });
  });

  // Action Queue
  app.get('/api/action-queue', (req, res) => {
    const status = req.query.status as 'pending' | 'resolved' | 'expired' | undefined;
    res.json({ items: storage.listActionQueue(status) });
  });

  app.post('/api/action-queue', (req, res) => {
    const { bot_id, kind, title, summary } = req.body ?? {};
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const item = storage.enqueueAction(
      typeof bot_id === 'string' ? bot_id : 'bot-chief-of-staff',
      kind ?? 'approval',
      { title: title.trim(), summary: String(summary ?? '').trim() }
    );
    res.status(201).json({ item, stats: storage.getStats() });
  });

  app.post('/api/action-queue/:id/resolve', (req, res) => {
    const decision = req.body?.decision === 'denied' ? 'denied' : 'approved';
    const updated = storage.resolveAction(req.params.id, decision);
    if (!updated) {
      res.status(404).json({ error: 'Action item not found' });
      return;
    }
    res.json({ item: updated, stats: storage.getStats() });
  });

  // OmniRoute Cloud Router
  app.get('/api/router/catalog', (_req, res) => {
    res.json(router.getCatalogSummary());
  });

  app.post('/api/router/validate-endpoint', (req, res) => {
    const { endpoint, provider_id } = req.body ?? {};
    const result = validateCloudEndpoint(endpoint, provider_id);
    res.json(result);
  });

  app.post('/api/router/voxcpm2-endpoint', (req, res) => {
    const { endpoint } = req.body ?? {};
    const result = router.configureVoxCpm2Endpoint(String(endpoint ?? ''));
    res.status(result.ok ? 200 : 400).json({
      ...result,
      catalog: router.getCatalogSummary(),
    });
  });

  app.post('/api/router/route', (req, res) => {
    const {
      target,
      strategy,
      required_context_tokens,
      free_only_override,
      simulate_free_exhausted,
    } = req.body ?? {};

    const decision = router.route({
      target: String(target ?? 'auto/coding'),
      strategy: strategy as RoutingStrategy | undefined,
      requiredContextTokens:
        typeof required_context_tokens === 'number' ? required_context_tokens : 8192,
      freeOnlyOverride:
        typeof free_only_override === 'boolean' ? free_only_override : undefined,
      simulateFreeExhausted: Boolean(simulate_free_exhausted),
    });

    res.json({ decision, stats: storage.getStats() });
  });

  // RTK + Caveman Compression & verify-rtk Gate
  app.post('/api/compression/run', (req, res) => {
    const { text, role, enable_rtk, caveman_intensity } = req.body ?? {};
    if (typeof text !== 'string' || text.length === 0) {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    const result = compressContext({
      text,
      role: role ?? 'user_prose',
      enableRtk: enable_rtk !== false,
      cavemanIntensity: (caveman_intensity ?? 'medium') as CavemanIntensity | 'off',
      redactSecretsFn: (s) => vault.redactSecrets(s),
    });
    res.json(result);
  });

  app.post('/api/compression/verify-rtk', (_req, res) => {
    const report = runVerifyRtkGate((s) => vault.redactSecrets(s));
    res.json(report);
  });

  // Write-Only Vault (Strictly NEVER returns plaintext!)
  app.get('/api/vault/secrets', (_req, res) => {
    res.json({ secrets: vault.listMetadata() });
  });

  app.post('/api/vault/secrets', (req, res) => {
    try {
      const { key_name, value, provider_hint } = req.body ?? {};
      const metadata = vault.setSecret(
        String(key_name ?? ''),
        String(value ?? ''),
        String(provider_hint ?? 'generic')
      );
      res.status(201).json({
        secret: metadata,
        secrets: vault.listMetadata(),
        stats: storage.getStats(),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to store secret' });
    }
  });

  app.delete('/api/vault/secrets/:keyName', (req, res) => {
    const deleted = vault.deleteSecret(req.params.keyName);
    res.json({
      deleted,
      secrets: vault.listMetadata(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/vault/redact', (req, res) => {
    const text = String(req.body?.text ?? '');
    res.json(vault.redactSecrets(text));
  });

  // Observer Memory (qyro-memory FTS5 + 3-step Progressive Disclosure)
  app.get('/api/memory/sessions', (_req, res) => {
    res.json({ sessions: memory.listSessions() });
  });

  app.post('/api/memory/observations', (req, res) => {
    const { title, body, tags, kind, session_id } = req.body ?? {};
    if (!title || !body) {
      res.status(400).json({ error: 'title and body are required' });
      return;
    }
    const observation = memory.recordObservation({
      session_id: typeof session_id === 'string' && session_id ? session_id : undefined,
      title: String(title),
      body: String(body),
      kind: kind ?? 'observation',
      tags: Array.isArray(tags)
        ? tags.map(String)
        : String(tags ?? '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
    });
    res.status(201).json({
      observation,
      sessions: memory.listSessions(),
      stats: storage.getStats(),
    });
  });

  app.get('/api/memory/search/index', (req, res) => {
    const q = String(req.query.q ?? '');
    const limit = Number(req.query.limit ?? 15);
    res.json({ results: memory.memSearchIndex(q, limit) });
  });

  app.get('/api/memory/search/timeline/:id', (req, res) => {
    const windowSize = Number(req.query.window ?? 3);
    res.json({ timeline: memory.memSearchTimeline(req.params.id, windowSize) });
  });

  app.post('/api/memory/search/details', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    res.json({ observations: memory.memSearchDetails(ids) });
  });

  // Encrypted Backup (.qyrobak) & Storage GC
  app.post('/api/backup/create', (req, res) => {
    try {
      const passphrase = String(req.body?.passphrase ?? '');
      const mode: BackupMode = req.body?.mode === 'full' ? 'full' : 'compact';
      const snap = backup.createSnapshot(passphrase, mode);
      res.json({
        size_bytes: snap.size_bytes,
        manifest: snap.manifest,
        archive_base64: snap.archive_base64,
        stats: storage.getStats(),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Backup failed' });
    }
  });

  app.post('/api/backup/verify', (req, res) => {
    try {
      const archiveB64 = String(req.body?.archive_base64 ?? '');
      const passphrase = String(req.body?.passphrase ?? '');
      const buf = Buffer.from(archiveB64, 'base64');
      const verified = QyroBackup.decryptAndVerify(buf, passphrase);
      res.json({
        valid: true,
        manifest: verified.manifest,
        table_names: Object.keys(verified.payload.tables),
      });
    } catch (err) {
      res.status(400).json({
        valid: false,
        error: err instanceof Error ? err.message : 'Verification failed',
      });
    }
  });

  app.post('/api/storage/gc', (_req, res) => {
    const result = storage.runStorageGc();
    res.json({
      result,
      library_items: storage.listLibraryItems(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/storage/library/seed-stale', (_req, res) => {
    const id = storage.addLibraryItem({
      kind: 'rtk_raw_cache',
      title: `stale-rtk-output-${Date.now().toString().slice(-4)}.log`,
      size_bytes: 94208,
      pinned: false,
      ageDays: 19,
    });
    res.status(201).json({
      id,
      library_items: storage.listLibraryItems(),
      stats: storage.getStats(),
    });
  });

  // =========================================================================
  // Phase 4: qyro-x-bridge (Free Self-Auth X + 6-Layer Anti-Ban Shield)
  // =========================================================================
  app.get('/api/x-bridge/state', (_req, res) => {
    res.json({ snapshot: xBridge.getSnapshot() });
  });

  app.post('/api/x-bridge/auth/takeover', (req, res) => {
    const botId = String(req.body?.bot_id ?? 'bot-chief-of-staff');
    const result = xBridge.startSelfAuthTakeover(botId);
    res.json({
      ...result,
      action_queue: storage.listActionQueue(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/x-bridge/auth/complete', (req, res) => {
    try {
      const { handle, pinned_ip, browser_engine, warmup_day } = req.body ?? {};
      const snapshot = xBridge.completeSelfAuthLogin({
        handle: String(handle ?? ''),
        pinned_ip: String(pinned_ip ?? ''),
        browser_engine: browser_engine === 'camoufox' ? 'camoufox' : 'chromium',
        warmup_day: typeof warmup_day === 'number' ? warmup_day : undefined,
      });
      res.json({ snapshot, stats: storage.getStats() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Self-Auth completion failed' });
    }
  });

  app.post('/api/x-bridge/manifest/extract', (req, res) => {
    const { bundle_text, source_label } = req.body ?? {};
    if (typeof bundle_text !== 'string' || !bundle_text.trim()) {
      res.status(400).json({ error: 'bundle_text is required' });
      return;
    }
    const result = xBridge.extractManifest(
      bundle_text,
      typeof source_label === 'string' && source_label.trim() ? source_label.trim() : undefined
    );
    res.status(result.ok ? 200 : 422).json(result);
  });

  app.post('/api/x-bridge/manifest/reset', (_req, res) => {
    res.json({ snapshot: xBridge.resetManifestToUnset() });
  });

  app.patch('/api/x-bridge/shield', (req, res) => {
    const body = req.body ?? {};
    const snapshot = xBridge.updateShieldConfig({
      browser_engine:
        body.browser_engine === 'chromium' || body.browser_engine === 'camoufox'
          ? body.browser_engine
          : undefined,
      display_mode:
        body.display_mode === 'cage_wayland' ||
        body.display_mode === 'xvfb' ||
        body.display_mode === 'headless_forbidden'
          ? (body.display_mode as XDisplayMode)
          : undefined,
      pinned_ip: typeof body.pinned_ip === 'string' ? body.pinned_ip : undefined,
      warmup_day: typeof body.warmup_day === 'number' ? body.warmup_day : undefined,
      active_tz:
        body.active_tz === 'Asia/Jakarta' ||
        body.active_tz === 'Asia/Makassar' ||
        body.active_tz === 'Asia/Jayapura'
          ? (body.active_tz as XActiveTimezone)
          : undefined,
      active_start_hour:
        typeof body.active_start_hour === 'number' ? body.active_start_hour : undefined,
      active_end_hour: typeof body.active_end_hour === 'number' ? body.active_end_hour : undefined,
      alt_allowlist: Array.isArray(body.alt_allowlist)
        ? body.alt_allowlist.map(String).filter(Boolean)
        : undefined,
    });
    res.json({ snapshot });
  });

  app.post('/api/x-bridge/drafts/propose', (req, res) => {
    const { bot_id, action_kind, raw_text, target_ref } = req.body ?? {};
    if (typeof raw_text !== 'string' || !raw_text.trim()) {
      res.status(400).json({ error: 'raw_text is required' });
      return;
    }
    const validKinds: XWriteActionKind[] = ['post_tweet', 'reply', 'quote_tweet', 'dm_send'];
    const kind: XWriteActionKind = validKinds.includes(action_kind) ? action_kind : 'post_tweet';
    const result = xBridge.proposeWriteDraft({
      bot_id: String(bot_id ?? 'bot-chief-of-staff'),
      action_kind: kind,
      raw_text: raw_text.trim(),
      target_ref: typeof target_ref === 'string' ? target_ref : null,
    });
    res.status(201).json({
      ...result,
      action_queue: storage.listActionQueue(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/x-bridge/drafts/:id/approve', (req, res) => {
    const { edited_text, outbound_ip } = req.body ?? {};
    const result = xBridge.approveAndDispatchDraft(req.params.id, {
      edited_text: typeof edited_text === 'string' ? edited_text : undefined,
      outbound_ip: typeof outbound_ip === 'string' && outbound_ip.trim() ? outbound_ip.trim() : undefined,
    });
    res.status(result.ok ? 200 : 409).json({
      ...result,
      stats: storage.getStats(),
    });
  });

  app.post('/api/x-bridge/circuit-breaker/trip', (req, res) => {
    const { bot_id, http_status, body_snippet, reason } = req.body ?? {};
    const result = xBridge.tripCircuitBreaker({
      bot_id: String(bot_id ?? 'bot-chief-of-staff'),
      http_status: typeof http_status === 'number' ? http_status : 429,
      body_snippet: typeof body_snippet === 'string' ? body_snippet : undefined,
      reason: typeof reason === 'string' ? reason : undefined,
    });
    res.json({
      ...result,
      action_queue: storage.listActionQueue(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/x-bridge/circuit-breaker/resume', (_req, res) => {
    res.json({
      snapshot: xBridge.resumeAfterHumanCheck(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/x-bridge/triggers/ingest', (req, res) => {
    const { trigger_kind, bot_id, source_handle, source_text, folder_or_thread } = req.body ?? {};
    const validTriggers: XTriggerKind[] = ['bookmark', 'self_dm', 'mention_alt'];
    if (!validTriggers.includes(trigger_kind)) {
      res.status(400).json({ error: 'trigger_kind must be bookmark, self_dm, or mention_alt' });
      return;
    }
    if (typeof source_text !== 'string' || !source_text.trim()) {
      res.status(400).json({ error: 'source_text is required' });
      return;
    }
    const result = xBridge.ingestFreeTrigger({
      trigger_kind,
      bot_id: String(bot_id ?? 'bot-chief-of-staff'),
      source_handle: String(source_handle ?? '@owner'),
      source_text: source_text.trim(),
      folder_or_thread: typeof folder_or_thread === 'string' ? folder_or_thread : undefined,
    });
    res.status(result.accepted ? 201 : 403).json({
      ...result,
      action_queue: storage.listActionQueue(),
      stats: storage.getStats(),
    });
  });

  // =========================================================================
  // Phase 5: Channels (Auto-Router / Group Round-Robin / poke_bot) & Scheduler
  // =========================================================================
  app.get('/api/channels/state', (req, res) => {
    const channelList = channels.listChannels();
    const activeId =
      typeof req.query.channel_id === 'string' && req.query.channel_id
        ? req.query.channel_id
        : channelList[0]?.id;
    res.json({
      channels: channelList,
      active_channel_id: activeId ?? null,
      messages: activeId ? channels.listChannelMessages(activeId) : [],
      delegations: channels.listDelegations(),
    });
  });

  app.post('/api/channels', (req, res) => {
    const { name, mode, member_bot_ids } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Nama channel wajib diisi.' });
      return;
    }
    const chMode: ChannelMode = mode === 'group_round_robin' ? 'group_round_robin' : 'auto_route';
    const members = Array.isArray(member_bot_ids) && member_bot_ids.length > 0
      ? member_bot_ids.map(String)
      : storage.listBots().map((b) => b.id);
    const created = channels.createChannel({ name, mode: chMode, member_bot_ids: members });
    res.status(201).json({ channel: created, channels: channels.listChannels() });
  });

  app.post('/api/channels/:id/messages', (req, res) => {
    try {
      const content = String(req.body?.content ?? '').trim();
      if (!content) {
        res.status(400).json({ error: 'Pesan channel tidak boleh kosong.' });
        return;
      }
      const result = channels.postToChannel(req.params.id, content);
      res.status(201).json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Channel error' });
    }
  });

  app.post('/api/channels/poke', (req, res) => {
    const { from_bot_id, to_bot_id, task_summary } = req.body ?? {};
    if (!from_bot_id || !to_bot_id || !String(task_summary ?? '').trim()) {
      res.status(400).json({ error: 'from_bot_id, to_bot_id, dan task_summary wajib diisi.' });
      return;
    }
    const delegation = channels.pokeBot({
      from_bot_id: String(from_bot_id),
      to_bot_id: String(to_bot_id),
      task_summary: String(task_summary),
    });
    res.status(201).json({
      delegation,
      delegations: channels.listDelegations(),
      stats: storage.getStats(),
    });
  });

  app.get('/api/routines/state', (_req, res) => {
    res.json({
      routines: scheduler.listRoutines(),
      runs: scheduler.listRuns(),
    });
  });

  app.post('/api/routines/parse', (req, res) => {
    const input = String(req.body?.input ?? '');
    res.json(parseNaturalSchedule(input));
  });

  app.post('/api/routines', (req, res) => {
    const { bot_id, name, trigger_type, schedule_input, prompt } = req.body ?? {};
    if (!name || !String(name).trim() || !prompt || !String(prompt).trim()) {
      res.status(400).json({ error: 'Nama routine dan prompt wajib diisi.' });
      return;
    }
    const validTriggers: RoutineTriggerType[] = [
      'cron',
      'webhook_hmac',
      'slack',
      'github',
      'linear',
      'sentry',
      'pagerduty',
      'email',
      'x',
    ];
    const trig: RoutineTriggerType = validTriggers.includes(trigger_type) ? trigger_type : 'cron';
    const result = scheduler.createRoutine({
      bot_id: String(bot_id ?? 'bot-chief-of-staff'),
      name: String(name),
      trigger_type: trig,
      schedule_input: String(schedule_input ?? ''),
      prompt: String(prompt),
    });
    res.status(result.ok ? 201 : 400).json({
      ...result,
      routines: scheduler.listRoutines(),
    });
  });

  app.patch('/api/routines/:id', (req, res) => {
    const updated = scheduler.toggleRoutine(req.params.id, Boolean(req.body?.enabled));
    if (!updated) {
      res.status(404).json({ error: 'Routine tidak ditemukan.' });
      return;
    }
    res.json({ routine: updated, routines: scheduler.listRoutines() });
  });

  app.delete('/api/routines/:id', (req, res) => {
    const deleted = scheduler.deleteRoutine(req.params.id);
    res.json({ deleted, routines: scheduler.listRoutines(), runs: scheduler.listRuns() });
  });

  app.post('/api/routines/:id/run', (req, res) => {
    const ctx = typeof req.body?.context === 'string' ? req.body.context : 'manual_trigger';
    const result = scheduler.executeRoutine(req.params.id, ctx);
    res.status(result.ok ? 200 : 400).json({
      ...result,
      routines: scheduler.listRoutines(),
      runs: scheduler.listRuns(),
      stats: storage.getStats(),
    });
  });

  app.post('/api/routines/:id/webhook', (req, res) => {
    const secret = String(req.body?.secret ?? '');
    const payload = String(req.body?.payload ?? '{}');
    const providedSig = String(req.body?.signature ?? '');
    const computedSig = secret ? computeWebhookHmac(secret, payload) : '';
    const verified = verifyWebhookHmac(secret, payload, providedSig || computedSig);
    if (!verified) {
      res.status(401).json({
        ok: false,
        verified: false,
        error: 'Signature HMAC-SHA256 tidak valid.',
      });
      return;
    }
    const execRes = scheduler.executeRoutine(
      req.params.id,
      `webhook_hmac_verified (${computedSig.slice(0, 18)}...)`
    );
    res.json({
      ...execRes,
      verified: true,
      signature: providedSig || computedSig,
      routines: scheduler.listRoutines(),
      runs: scheduler.listRuns(),
    });
  });

  // =========================================================================
  // Phase 5: Ecosystem (Skill Installer + Lockfile + Tinkabot + BotMRR)
  // =========================================================================
  app.get('/api/ecosystem/state', (_req, res) => {
    res.json({
      lockfile: ecosystem.readLockfile(),
      lock_history: ecosystem.listLockHistory(),
      catalog: ecosystem.listCatalog(),
      skills_count: skills.listSkills().length,
    });
  });

  app.post('/api/ecosystem/skills/install', (req, res) => {
    const { source_type, source_ref, slug, name, version, description, skill_md, keywords } =
      req.body ?? {};
    const validSources: SkillInstallSourceType[] = ['github', 'zip', 'catalog', 'tinkabot'];
    const srcType: SkillInstallSourceType = validSources.includes(source_type)
      ? source_type
      : 'catalog';
    const result = ecosystem.installSkillPackage({
      source_type: srcType,
      source_ref: String(source_ref ?? ''),
      slug: slug ? String(slug) : undefined,
      name: name ? String(name) : undefined,
      version: version ? String(version) : undefined,
      description: description ? String(description) : undefined,
      skill_md: skill_md ? String(skill_md) : undefined,
      keywords: Array.isArray(keywords) ? keywords.map(String) : undefined,
    });
    res.status(result.installed ? 201 : result.requires_trust_review ? 202 : 400).json({
      ...result,
      lockfile: ecosystem.readLockfile(),
      lock_history: ecosystem.listLockHistory(),
      skills: skills.listSkills(),
      action_queue: storage.listActionQueue(),
    });
  });

  app.post('/api/ecosystem/skills/rollback', (req, res) => {
    const historyId = typeof req.body?.history_id === 'string' ? req.body.history_id : undefined;
    const result = ecosystem.rollbackLockfile(historyId);
    res.status(result.rolled_back ? 200 : 400).json({
      ...result,
      lock_history: ecosystem.listLockHistory(),
      skills: skills.listSkills(),
    });
  });

  app.post('/api/ecosystem/tinkabot', (req, res) => {
    const { service_name, base_url, auth_header, vault_secret_name, endpoints, install } =
      req.body ?? {};
    const result = ecosystem.synthesizeTinkabotSkill({
      service_name: String(service_name ?? ''),
      base_url: String(base_url ?? ''),
      auth_header: auth_header ? String(auth_header) : undefined,
      vault_secret_name: String(vault_secret_name ?? ''),
      endpoints: Array.isArray(endpoints) ? endpoints : [],
      install: Boolean(install),
    });
    res.status(result.ok ? 200 : 400).json({
      ...result,
      lockfile: ecosystem.readLockfile(),
      lock_history: ecosystem.listLockHistory(),
      skills: skills.listSkills(),
    });
  });

  app.post('/api/ecosystem/botmrr/export', (req, res) => {
    const { package_name, author, description } = req.body ?? {};
    const pkg = ecosystem.exportTeamPackage({
      package_name: String(package_name ?? 'QyroBot Team Bundle'),
      author: author ? String(author) : undefined,
      description: description ? String(description) : undefined,
    });
    res.json({ package: pkg });
  });

  app.post('/api/ecosystem/botmrr/import', (req, res) => {
    const pkg = req.body?.package ?? req.body;
    const result = ecosystem.importTeamPackage(pkg);
    res.status(result.ok ? 200 : 400).json({
      ...result,
      bots: storage.listBots(),
      lockfile: ecosystem.readLockfile(),
      skills: skills.listSkills(),
    });
  });

  // =========================================================================
  // Phase 5: Ops (Live Team RBAC + Cloud R2/S3 + Cross-Arch + Auto-Updater)
  // =========================================================================
  app.get('/api/ops/state', (_req, res) => {
    res.json({
      rbac: ops.getRbacState(),
      cloud_backup: ops.getCloudBackupConfig(),
      portability: ops.checkCrossArchPortability('linux/amd64', 'linux/arm64'),
      updater: ops.getUpdaterStatus(),
    });
  });

  app.patch('/api/ops/rbac/mode', (req, res) => {
    const mode: RbacMode = req.body?.mode === 'team_rbac' ? 'team_rbac' : 'single_owner';
    const activeUserId =
      typeof req.body?.active_user_id === 'string' ? req.body.active_user_id : undefined;
    res.json({ rbac: ops.setRbacMode(mode, activeUserId) });
  });

  app.post('/api/ops/rbac/members', (req, res) => {
    const { email, display_name, role } = req.body ?? {};
    const memberRole: TeamRole = role === 'owner' ? 'owner' : 'member';
    const result = ops.addTeamMember({
      email: String(email ?? ''),
      display_name: String(display_name ?? ''),
      role: memberRole,
    });
    res.status(result.ok ? 201 : 400).json(result);
  });

  app.delete('/api/ops/rbac/members/:id', (req, res) => {
    const result = ops.removeTeamMember(req.params.id);
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/ops/rbac/evaluate', (req, res) => {
    const { actor_user_id, resource_owner_id, resource_kind } = req.body ?? {};
    const result = ops.evaluateResourceAccess({
      actor_user_id: String(actor_user_id ?? ''),
      resource_owner_id: String(resource_owner_id ?? 'user-owner'),
      resource_kind: (resource_kind ?? 'personal_vault') as ProtectedResourceKind,
    });
    res.json(result);
  });

  app.patch('/api/ops/cloud-backup', (req, res) => {
    const result = ops.updateCloudBackupConfig(req.body ?? {});
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/ops/updater/verify-demo', (req, res) => {
    const version = String(req.body?.version ?? '1.7.1');
    const arch = req.body?.arch === 'linux/amd64' ? 'linux/amd64' : 'linux/arm64';
    const tamper = Boolean(req.body?.tamper);
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const manifest = `qyrobot-v${version}-${arch} release-channel=stable`;
    const sig = crypto.sign(null, Buffer.from(manifest, 'utf8'), privateKey).toString('base64');
    const result = ops.verifySignedReleaseManifest({
      version,
      arch,
      payload_text: tamper ? `${manifest} [TAMPERED_BYTE]` : manifest,
      signature_base64: sig,
      public_key_pem: pubPem,
    });
    res.status(result.verified ? 200 : 400).json(result);
  });

  // Mount Vite dev middleware or static dist/
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QyroBot server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start QyroBot server:', err);
  process.exit(1);
});
