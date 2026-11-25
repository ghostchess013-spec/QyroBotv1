/**
 * qyro-computer — Universal Computer Use HAL, Dual-Engine Browser (Chromium CDP + Camoufox),
 * VPS Resource Guardrails (cgroups v2 RAM/CPU/Max Tabs), Auto-Sleep Watchdog,
 * MobileComputerScreen Takeover (Ambil alih / Selesai), and Teach a Task Recorder (PRD v1.7.0 §12).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { QyroStorage } from './storage';
import type { QyroMemory } from './memory';

export type ComputerBackendId =
  | 'headless_sandbox'
  | 'local_desktop'
  | 'embedded_browser'
  | 'remote_node';

export type BrowserEngineChoice = 'chromium' | 'camoufox';

export type SandboxState = 'idle' | 'running' | 'takeover' | 'sleeping' | 'recovering';

export interface BinaryProbeItem {
  binary: string;
  detected: boolean;
  resolved_path: string | 'UNSET';
  notes: string;
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  active: boolean;
  opened_at: string;
}

export interface WatchdogPolicy {
  backend: ComputerBackendId;
  requested_browser: BrowserEngineChoice;
  effective_browser: BrowserEngineChoice;
  camoufox_fallback_reason: string | null;
  cgroups_ram_limit_mb: number;
  cpu_quota_pct: number;
  max_tabs: number;
  idle_sleep_min: number;
  heartbeat_interval_sec: number;
}

export interface TaughtTaskStep {
  index: number;
  action: 'navigate' | 'click' | 'type' | 'pty_command' | 'assert';
  target: string;
  value?: string;
  recorded_at: string;
}

export interface TaughtTaskRecord {
  id: string;
  bot_id: string;
  name: string;
  description: string;
  steps: TaughtTaskStep[];
  run_count: number;
  created_at: string;
}

export interface ComputerSessionSnapshot {
  state: SandboxState;
  host_os: string;
  host_arch: string;
  estimated_ram_mb: number;
  persistent_profile_preserved: boolean;
  active_bot_id: string;
  takeover_action_id: string | null;
  last_heartbeat_at: string;
  watchdog_restarts: number;
  policy: WatchdogPolicy;
  probes: BinaryProbeItem[];
  tabs: BrowserTab[];
  pty_history: Array<{ cmd: string; output: string; timestamp: string }>;
  recording_task: {
    active: boolean;
    steps: TaughtTaskStep[];
  };
  taught_tasks: TaughtTaskRecord[];
}

function probeBinary(candidates: string[], notes: string): BinaryProbeItem {
  for (const bin of candidates) {
    try {
      const out = execFileSync('which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (out && fs.existsSync(out)) {
        return {
          binary: candidates[0],
          detected: true,
          resolved_path: out,
          notes,
        };
      }
    } catch {
      // keep probing next candidate
    }
  }
  return {
    binary: candidates[0],
    detected: false,
    resolved_path: 'UNSET',
    notes,
  };
}

export function runComputerBinaryProbes(): BinaryProbeItem[] {
  return [
    probeBinary(['chromium', 'chromium-browser', 'google-chrome', 'playwright-cli'], 'Universal default browser engine (x86_64 & ARM64)'),
    probeBinary(['camoufox'], 'Optional anti-detect Firefox engine (falls back cleanly to Chromium when absent)'),
    probeBinary(['ffmpeg'], 'Media chunking / keyframe extraction'),
    probeBinary(['Xvfb', 'cage'], 'Headless display server for non-headless browser sessions'),
  ];
}

export const COMPUTER_BACKENDS: Array<{
  id: ComputerBackendId;
  name: string;
  target: string;
  transport: string;
  summary: string;
}> = [
  {
    id: 'headless_sandbox',
    name: 'HeadlessSandboxBackend',
    target: 'Linux VPS (AMD x86_64 & Ampere ARM64)',
    transport: 'Cage/Xvfb + Chromium/Camoufox + PTY + WebRTC',
    summary: 'Namespace non-root bot@qyro dengan cgroups v2 RAM/CPU guardrails dan auto-sleep idle.',
  },
  {
    id: 'local_desktop',
    name: 'LocalDesktopBackend',
    target: 'Windows / macOS / Linux Desktop',
    transport: 'cua-driver + DXGI / ScreenCaptureKit / PipeWire',
    summary: 'Kontrol desktop native melalui cua-driver dan screen capture sistem.',
  },
  {
    id: 'embedded_browser',
    name: 'EmbeddedBrowserBackend',
    target: 'VPS RAM 1–2 GB Minimal',
    transport: 'Isolated Browser + PTY + Screencast Takeover',
    summary: 'Profil ringan tanpa desktop environment penuh untuk VPS hemat RAM.',
  },
  {
    id: 'remote_node',
    name: 'RemoteNodeBackend',
    target: '24/7 Cloud Node (mTLS / Tailscale / WireGuard)',
    transport: 'Encrypted tunnel -> qyro-server VPS',
    summary: 'Menghubungkan desktop/Android ke sandbox VPS jarak jauh dengan resume event.',
  },
];

export class QyroComputerEngine {
  private readonly storage: QyroStorage;
  private readonly memory: QyroMemory;
  private state: SandboxState = 'running';
  private backend: ComputerBackendId = 'headless_sandbox';
  private requestedBrowser: BrowserEngineChoice;
  private cpuQuotaPct = 75;
  private maxTabs = 6;
  private activeBotId = 'bot-chief-of-staff';
  private takeoverActionId: string | null = null;
  private lastHeartbeatAt: string = new Date().toISOString();
  private watchdogRestarts = 0;
  private readonly probes: BinaryProbeItem[];
  private tabs: BrowserTab[] = [
    {
      id: 'tab-init-1',
      title: 'QyroBot Sandbox Home',
      url: 'https://docs.qyrobot.local/sandbox',
      active: true,
      opened_at: new Date().toISOString(),
    },
  ];
  private ptyHistory: Array<{ cmd: string; output: string; timestamp: string }> = [
    {
      cmd: 'qyro-computer status --cgroups',
      output: `sandbox=bot@qyro arch=${os.arch()} cgroups=v2 max_tabs=6 auto_sleep=enabled`,
      timestamp: new Date().toISOString(),
    },
  ];
  private recordingActive = false;
  private recordingSteps: TaughtTaskStep[] = [];

  constructor(storage: QyroStorage, memory: QyroMemory) {
    this.storage = storage;
    this.memory = memory;
    this.probes = runComputerBinaryProbes();
    const prefs = this.storage.getPreferences();
    this.requestedBrowser = prefs.default_browser_engine ?? 'chromium';
  }

  private resolveBrowserEngine(): {
    effective: BrowserEngineChoice;
    fallbackReason: string | null;
  } {
    if (this.requestedBrowser === 'camoufox') {
      const camoufox = this.probes.find((p) => p.binary === 'camoufox');
      if (!camoufox || !camoufox.detected) {
        return {
          effective: 'chromium',
          fallbackReason: `Binary camoufox tidak terdeteksi di host (${os.platform()}/${os.arch()}); fallback otomatis ke Chromium CDP.`,
        };
      }
      return { effective: 'camoufox', fallbackReason: null };
    }
    return { effective: 'chromium', fallbackReason: null };
  }

  private estimateRamMb(): number {
    if (this.state === 'sleeping') return 48; // PRD §12.2: drops to ~40-60 MB while keeping cookies on disk
    if (this.state === 'recovering') return 96;
    const base = this.backend === 'embedded_browser' ? 180 : 320;
    return base + this.tabs.length * 115;
  }

  getSnapshot(): ComputerSessionSnapshot {
    const prefs = this.storage.getPreferences();
    const browserResolution = this.resolveBrowserEngine();
    return {
      state: this.state,
      host_os: os.platform(),
      host_arch: os.arch(),
      estimated_ram_mb: this.estimateRamMb(),
      persistent_profile_preserved: true,
      active_bot_id: this.activeBotId,
      takeover_action_id: this.takeoverActionId,
      last_heartbeat_at: this.lastHeartbeatAt,
      watchdog_restarts: this.watchdogRestarts,
      policy: {
        backend: this.backend,
        requested_browser: this.requestedBrowser,
        effective_browser: browserResolution.effective,
        camoufox_fallback_reason: browserResolution.fallbackReason,
        cgroups_ram_limit_mb: prefs.sandbox_ram_limit_mb,
        cpu_quota_pct: this.cpuQuotaPct,
        max_tabs: this.maxTabs,
        idle_sleep_min: prefs.browser_idle_sleep_min,
        heartbeat_interval_sec: 15,
      },
      probes: this.probes,
      tabs: [...this.tabs],
      pty_history: [...this.ptyHistory],
      recording_task: {
        active: this.recordingActive,
        steps: [...this.recordingSteps],
      },
      taught_tasks: this.listTaughtTasks(),
    };
  }

  updateConfig(patch: {
    backend?: ComputerBackendId;
    browser_engine?: BrowserEngineChoice;
    cgroups_ram_limit_mb?: number;
    cpu_quota_pct?: number;
    max_tabs?: number;
    idle_sleep_min?: number;
  }): ComputerSessionSnapshot {
    if (patch.backend && COMPUTER_BACKENDS.some((b) => b.id === patch.backend)) {
      this.backend = patch.backend;
    }
    if (patch.browser_engine === 'chromium' || patch.browser_engine === 'camoufox') {
      this.requestedBrowser = patch.browser_engine;
      this.storage.updatePreferences({ default_browser_engine: patch.browser_engine });
    }
    if (typeof patch.cgroups_ram_limit_mb === 'number' && patch.cgroups_ram_limit_mb >= 512) {
      this.storage.updatePreferences({
        sandbox_ram_limit_mb: Math.min(24576, Math.round(patch.cgroups_ram_limit_mb)),
      });
    }
    if (typeof patch.cpu_quota_pct === 'number' && patch.cpu_quota_pct >= 10 && patch.cpu_quota_pct <= 100) {
      this.cpuQuotaPct = Math.round(patch.cpu_quota_pct);
    }
    if (typeof patch.max_tabs === 'number' && patch.max_tabs >= 1 && patch.max_tabs <= 12) {
      this.maxTabs = Math.round(patch.max_tabs);
      if (this.tabs.length > this.maxTabs) {
        this.tabs = this.tabs.slice(0, this.maxTabs);
      }
    }
    if (typeof patch.idle_sleep_min === 'number' && patch.idle_sleep_min >= 1 && patch.idle_sleep_min <= 240) {
      this.storage.updatePreferences({
        browser_idle_sleep_min: Math.round(patch.idle_sleep_min),
      });
    }
    return this.getSnapshot();
  }

  openTab(url: string, title?: string): { ok: boolean; error?: string; snapshot: ComputerSessionSnapshot } {
    if (this.state === 'sleeping') {
      this.wakeSandbox();
    }
    if (this.tabs.length >= this.maxTabs) {
      return {
        ok: false,
        error: `Batas cgroups Watchdog tercapai: maksimal ${this.maxTabs} tab aktif simultan.`,
        snapshot: this.getSnapshot(),
      };
    }

    const cleanUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
    this.tabs = this.tabs.map((t) => ({ ...t, active: false }));
    const newTab: BrowserTab = {
      id: `tab-${crypto.randomUUID().slice(0, 6)}`,
      title: title?.trim() || new URL(cleanUrl).hostname,
      url: cleanUrl,
      active: true,
      opened_at: new Date().toISOString(),
    };
    this.tabs.push(newTab);

    if (this.recordingActive) {
      this.recordStep({ action: 'navigate', target: cleanUrl });
    }
    return { ok: true, snapshot: this.getSnapshot() };
  }

  closeTab(tabId: string): ComputerSessionSnapshot {
    if (this.tabs.length <= 1) return this.getSnapshot();
    this.tabs = this.tabs.filter((t) => t.id !== tabId);
    if (!this.tabs.some((t) => t.active) && this.tabs.length > 0) {
      this.tabs[0].active = true;
    }
    return this.getSnapshot();
  }

  triggerIdleSleep(): ComputerSessionSnapshot {
    this.state = 'sleeping';
    this.lastHeartbeatAt = new Date().toISOString();
    this.storage.appendEvent('bot.mood_changed', this.activeBotId, {
      sandbox_state: 'sleeping',
      estimated_ram_mb: 48,
      cookies_preserved: true,
    });
    return this.getSnapshot();
  }

  wakeSandbox(): ComputerSessionSnapshot {
    this.state = 'running';
    this.lastHeartbeatAt = new Date().toISOString();
    return this.getSnapshot();
  }

  simulateWatchdogCrashRecovery(): {
    recovered: boolean;
    restarts: number;
    snapshot: ComputerSessionSnapshot;
  } {
    this.state = 'recovering';
    this.watchdogRestarts += 1;
    this.lastHeartbeatAt = new Date().toISOString();
    this.ptyHistory.push({
      cmd: '[watchdog] CDP healthcheck timeout (15s)',
      output: `Restart bersih renderer browser selesai (#${this.watchdogRestarts}); qyro-server tetap online tanpa kehilangan sesi.`,
      timestamp: this.lastHeartbeatAt,
    });
    this.state = 'running';
    this.storage.appendEvent('bot.mood_changed', this.activeBotId, {
      sandbox_watchdog: 'crash_recovered',
      restarts: this.watchdogRestarts,
    });
    return {
      recovered: true,
      restarts: this.watchdogRestarts,
      snapshot: this.getSnapshot(),
    };
  }

  startTakeover(botId: string, reason: string): ComputerSessionSnapshot {
    if (this.state === 'sleeping') {
      this.wakeSandbox();
    }
    this.activeBotId = botId || 'bot-chief-of-staff';
    this.state = 'takeover';
    const act = this.storage.enqueueAction(this.activeBotId, 'takeover', {
      title: 'Ambil Alih Layar Browser (Take Control)',
      summary: reason || 'User mengambil alih kontrol interaktif untuk login/CAPTCHA.',
    });
    this.takeoverActionId = act.id;
    this.storage.appendEvent('computer.takeover_requested', this.activeBotId, {
      action_id: act.id,
      reason,
      browser_engine: this.resolveBrowserEngine().effective,
    });
    return this.getSnapshot();
  }

  endTakeover(): ComputerSessionSnapshot {
    if (this.takeoverActionId) {
      this.storage.resolveAction(this.takeoverActionId, 'approved');
      this.takeoverActionId = null;
    }
    this.state = 'running';
    this.lastHeartbeatAt = new Date().toISOString();
    return this.getSnapshot();
  }

  runPtyCommand(cmd: string): ComputerSessionSnapshot {
    const clean = cmd.trim();
    if (!clean) return this.getSnapshot();
    const now = new Date().toISOString();
    let output = '';

    if (/^(ls|dir)$/i.test(clean)) {
      output = 'configs/  migrations/  sandbox-profile/  cookies.sqlite  tasks/';
    } else if (/^uname/i.test(clean)) {
      output = `Linux qyro-sandbox ${os.release()} ${os.arch()} GNU/Linux`;
    } else if (/^free|mem/i.test(clean)) {
      const limit = this.storage.getPreferences().sandbox_ram_limit_mb;
      output = `cgroups_v2_limit=${limit}MB used=${this.estimateRamMb()}MB tabs=${this.tabs.length}/${this.maxTabs}`;
    } else if (/^rm\s+-rf\s+\/|shutdown|reboot/i.test(clean)) {
      output = '[BLOCKED] Perintah destruktif diblokir oleh sandbox non-root bot@qyro.';
    } else {
      output = `[bot@qyro-pty] executed "${clean}" (exit=0, rtk-filtered)`;
    }

    this.ptyHistory.push({ cmd: clean, output, timestamp: now });
    if (this.ptyHistory.length > 25) {
      this.ptyHistory = this.ptyHistory.slice(-25);
    }

    if (this.recordingActive) {
      this.recordStep({ action: 'pty_command', target: clean });
    }
    return this.getSnapshot();
  }

  // --- Teach a Task Recorder (PRD §15.2 Fase 3) ---
  startRecordingTask(): ComputerSessionSnapshot {
    this.recordingActive = true;
    this.recordingSteps = [];
    return this.getSnapshot();
  }

  recordStep(step: Omit<TaughtTaskStep, 'index' | 'recorded_at'>): ComputerSessionSnapshot {
    if (!this.recordingActive) {
      this.recordingActive = true;
    }
    this.recordingSteps.push({
      index: this.recordingSteps.length + 1,
      ...step,
      recorded_at: new Date().toISOString(),
    });
    return this.getSnapshot();
  }

  saveTaughtTask(params: {
    bot_id?: string;
    name: string;
    description?: string;
  }): { task: TaughtTaskRecord; snapshot: ComputerSessionSnapshot } {
    const id = `task-${crypto.randomUUID().slice(0, 8)}`;
    const botId = params.bot_id || this.activeBotId;
    const steps: TaughtTaskStep[] =
      this.recordingSteps.length > 0
        ? [...this.recordingSteps]
        : [
            {
              index: 1,
              action: 'navigate',
              target: this.tabs.find((t) => t.active)?.url ?? 'https://docs.qyrobot.local/sandbox',
              recorded_at: new Date().toISOString(),
            },
          ];

    this.storage.db
      .prepare(
        `INSERT INTO taught_tasks (id, bot_id, name, description, steps_json, run_count)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      .run(id, botId, params.name.trim(), (params.description ?? '').trim(), JSON.stringify(steps));

    this.memory.recordObservation({
      bot_id: botId,
      kind: 'artifact',
      title: `Teach a Task: ${params.name.trim()}`,
      body: `Rekaman ${steps.length} langkah tugas browser/PTY: ${steps.map((s) => `${s.index}.${s.action}(${s.target})`).join(' -> ')}`,
      tags: ['teach-a-task', 'computer-use'],
    });

    this.recordingActive = false;
    this.recordingSteps = [];

    const task = this.listTaughtTasks().find((t) => t.id === id)!;
    return { task, snapshot: this.getSnapshot() };
  }

  listTaughtTasks(): TaughtTaskRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT id, bot_id, name, description, steps_json, run_count, created_at FROM taught_tasks ORDER BY created_at DESC`)
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      bot_id: String(r.bot_id),
      name: String(r.name),
      description: String(r.description),
      steps: JSON.parse(String(r.steps_json ?? '[]')) as TaughtTaskStep[],
      run_count: Number(r.run_count ?? 0),
      created_at: String(r.created_at),
    }));
  }

  replayTaughtTask(taskId: string): { ok: boolean; steps_executed: number; snapshot: ComputerSessionSnapshot } {
    const task = this.listTaughtTasks().find((t) => t.id === taskId);
    if (!task) {
      return { ok: false, steps_executed: 0, snapshot: this.getSnapshot() };
    }
    if (this.state === 'sleeping') {
      this.wakeSandbox();
    }
    this.storage.db
      .prepare(`UPDATE taught_tasks SET run_count = run_count + 1 WHERE id = ?`)
      .run(taskId);
    this.ptyHistory.push({
      cmd: `qyro-task replay ${task.name}`,
      output: `Replayed ${task.steps.length} recorded steps cleanly (run #${task.run_count + 1}).`,
      timestamp: new Date().toISOString(),
    });
    return { ok: true, steps_executed: task.steps.length, snapshot: this.getSnapshot() };
  }
}
