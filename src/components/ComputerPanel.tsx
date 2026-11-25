import React, { useCallback, useEffect, useState } from 'react';
import {
  Cpu,
  Globe,
  Hand,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Square,
  Sun,
  Terminal,
  Video,
  X,
} from 'lucide-react';
import type { UiLocale } from '../core/types';
import type {
  BrowserEngineChoice,
  ComputerBackendId,
  ComputerSessionSnapshot,
} from '../core/computer';
import { api } from '../lib/api';

interface ComputerPanelProps {
  activeBotId: string;
  locale: UiLocale;
  onRefreshBootstrap: () => Promise<void>;
}

export const ComputerPanel: React.FC<ComputerPanelProps> = ({
  activeBotId,
  locale,
  onRefreshBootstrap,
}) => {
  const isId = locale === 'id-ID';
  const [snapshot, setSnapshot] = useState<ComputerSessionSnapshot | null>(null);
  const [backends, setBackends] = useState<
    Array<{ id: ComputerBackendId; name: string; target: string; transport: string; summary: string }>
  >([]);
  const [urlInput, setUrlInput] = useState('https://docs.qyrobot.dev/computer-use');
  const [tabError, setTabError] = useState<string | null>(null);
  const [ptyInput, setPtyInput] = useState('free -m');
  const [taskName, setTaskName] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [stepAction, setStepAction] = useState<'click' | 'type' | 'navigate' | 'assert'>('click');
  const [stepTarget, setStepTarget] = useState('#submit-btn');
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const res = await api.getComputerState();
    setSnapshot(res.snapshot);
    setBackends(res.backends);
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  if (!snapshot) {
    return (
      <div className="p-6 text-xs text-[var(--text-secondary)]">
        {isId ? 'Memuat sandbox qyro-computer...' : 'Loading qyro-computer sandbox...'}
      </div>
    );
  }

  const isTakeover = snapshot.state === 'takeover';
  const isSleeping = snapshot.state === 'sleeping';
  const activeTab = snapshot.tabs.find((t) => t.active) ?? snapshot.tabs[0];

  const handleOpenTab = async (e: React.FormEvent) => {
    e.preventDefault();
    setTabError(null);
    const res = await api.openComputerTab(urlInput);
    setSnapshot(res.data.snapshot);
    if (!res.data.ok) {
      setTabError(res.data.error ?? 'Gagal membuka tab baru.');
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;
    const res = await api.saveTeachTask(taskName.trim(), taskDesc.trim(), activeBotId);
    setSnapshot(res.snapshot);
    setTaskName('');
    setTaskDesc('');
    setFeedback(
      isId
        ? `Tugas "${res.task.name}" (${res.task.steps.length} langkah) tersimpan ke SQLite & qyro-memory.`
        : `Task "${res.task.name}" (${res.task.steps.length} steps) saved to SQLite & qyro-memory.`
    );
    await onRefreshBootstrap();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1060px] mx-auto space-y-6">
        {/* Header & Primary Takeover Action (MobileComputerScreen parity) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              {isId ? 'Computer Use & Dual-Engine Sandbox' : 'Computer Use & Dual-Engine Sandbox'}
            </h1>
            <p className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
              {snapshot.host_os}/{snapshot.host_arch} · {snapshot.policy.effective_browser.toUpperCase()} ·{' '}
              RAM {snapshot.estimated_ram_mb}/{snapshot.policy.cgroups_ram_limit_mb} MB ·{' '}
              Tabs {snapshot.tabs.length}/{snapshot.policy.max_tabs} · State: {snapshot.state}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isTakeover ? (
              <button
                type="button"
                onClick={async () => {
                  const res = await api.endComputerTakeover();
                  setSnapshot(res.snapshot);
                  await onRefreshBootstrap();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--status-success)] text-[#0a0a0c] text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5" />
                {isId ? 'Selesai' : 'Done'}
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const res = await api.startComputerTakeover(
                    activeBotId,
                    isId ? 'Kontrol interaktif layar browser & CAPTCHA' : 'Interactive browser & CAPTCHA takeover'
                  );
                  setSnapshot(res.snapshot);
                  await onRefreshBootstrap();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Hand className="w-3.5 h-3.5" />
                {isId ? 'Ambil alih' : 'Take Control'}
              </button>
            )}

            {isSleeping ? (
              <button
                type="button"
                onClick={async () => setSnapshot((await api.wakeComputer()).snapshot)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                <Sun className="w-3.5 h-3.5" />
                {isId ? 'Bangunkan (<2d)' : 'Wake (<2s)'}
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => setSnapshot((await api.sleepComputer()).snapshot)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                <Moon className="w-3.5 h-3.5" />
                {isId ? 'Auto-Sleep' : 'Auto-Sleep'}
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                const res = await api.recoverComputerWatchdog();
                setSnapshot(res.snapshot);
                setFeedback(
                  isId
                    ? `Watchdog memulihkan crash renderer (#${res.restarts}); qyro-server tetap hidup.`
                    : `Watchdog recovered renderer crash (#${res.restarts}); qyro-server stayed online.`
                );
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {isId ? 'Uji Watchdog' : 'Test Watchdog'}
            </button>
          </div>
        </div>

        {snapshot.policy.camoufox_fallback_reason && (
          <div className="rounded-xl border border-[var(--status-warning)]/40 bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-primary)] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
            <span>{snapshot.policy.camoufox_fallback_reason}</span>
          </div>
        )}

        {feedback && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs text-[var(--status-success)]">
            {feedback}
          </div>
        )}

        {/* Row 1: Browser Sandbox Viewport + Live PTY */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Interactive Browser Viewport */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-[var(--text-secondary)]" />
                {isId ? 'Layar Browser Sandbox (WebRTC / CDP)' : 'Sandbox Browser Screen (WebRTC / CDP)'}
              </h2>
              <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                {isTakeover
                  ? isId
                    ? 'KONTROL USER AKTIF'
                    : 'USER CONTROL ACTIVE'
                  : isSleeping
                    ? isId
                      ? 'TIDUR · COOKIE AMAN'
                      : 'SLEEPING · COOKIES SAVED'
                    : 'LIVE'}
              </span>
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {snapshot.tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] max-w-[180px] shrink-0 ${
                    tab.active
                      ? 'border-[var(--text-primary)] bg-[var(--bg-canvas)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  <span className="truncate">{tab.title}</span>
                  {snapshot.tabs.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Close tab ${tab.title}`}
                      onClick={async () => setSnapshot((await api.closeComputerTab(tab.id)).snapshot)}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* URL Bar */}
            <form onSubmit={handleOpenTab} className="flex gap-2">
              <input
                type="text"
                aria-label="Sandbox URL"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                {isId ? 'Buka Tab' : 'Open Tab'}
              </button>
            </form>
            {tabError && <p className="text-xs text-[var(--status-danger)]">{tabError}</p>}

            {/* Live Viewport Canvas */}
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 min-h-[168px] flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                  {activeTab?.url}
                </p>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {isSleeping
                    ? isId
                      ? 'Proses renderer browser ditidurkan untuk menghemat RAM (~48 MB). Cookie & sesi login tetap tersimpan di disk.'
                      : 'Browser renderer is asleep (~48 MB RAM). Cookies and login sessions remain persisted on disk.'
                    : isTakeover
                      ? isId
                        ? 'Mode Ambil Alih aktif — masukan sentuh/keyboard kamu langsung diteruskan ke profil browser persisten.'
                        : 'Take Control active — your keyboard/touch input streams directly to the persistent browser profile.'
                      : isId
                        ? `Sesi ${snapshot.policy.effective_browser} berjalan di namespace non-root bot@qyro dengan watchdog heartbeat tiap ${snapshot.policy.heartbeat_interval_sec} detik.`
                        : `${snapshot.policy.effective_browser} session running in non-root bot@qyro namespace with ${snapshot.policy.heartbeat_interval_sec}s watchdog heartbeat.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-2">
                <span>Backend: {snapshot.policy.backend}</span>
                <span>Watchdog restarts: {snapshot.watchdog_restarts}</span>
              </div>
            </div>
          </section>

          {/* Sandbox PTY Terminal */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-[var(--text-secondary)]" />
              {isId ? 'Terminal PTY Sandbox (RTK-Filtered)' : 'Sandbox PTY Terminal (RTK-Filtered)'}
            </h2>

            <div className="flex-1 min-h-[180px] max-h-[240px] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 font-mono text-[11px] space-y-2">
              {snapshot.pty_history.map((entry, idx) => (
                <div key={idx} className="space-y-0.5">
                  <p className="text-[var(--status-attention)]">$ {entry.cmd}</p>
                  <p className="text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                    {entry.output}
                  </p>
                </div>
              ))}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!ptyInput.trim()) return;
                const res = await api.runComputerPty(ptyInput);
                setSnapshot(res.snapshot);
                setPtyInput('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                aria-label="Sandbox PTY command"
                value={ptyInput}
                onChange={(e) => setPtyInput(e.target.value)}
                placeholder="ls, uname, free -m..."
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                {isId ? 'Jalankan' : 'Run'}
              </button>
            </form>
          </section>
        </div>

        {/* Row 2: Teach a Task Recorder & Guardrails Config */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Teach a Task */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Video className="w-4 h-4 text-[var(--text-secondary)]" />
                Teach a Task ({snapshot.taught_tasks.length})
              </h2>
              {!snapshot.recording_task.active ? (
                <button
                  type="button"
                  onClick={async () => setSnapshot((await api.startTeachTask()).snapshot)}
                  className="px-2.5 py-1 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-[11px] font-medium whitespace-nowrap shrink-0"
                >
                  {isId ? 'Mulai Rekam' : 'Start Recording'}
                </button>
              ) : (
                <span className="text-[11px] font-mono text-[var(--status-danger)]">
                  REC · {snapshot.recording_task.steps.length} steps
                </span>
              )}
            </div>

            {snapshot.recording_task.active && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-2.5">
                <div className="flex gap-1.5">
                  <select
                    aria-label="Step action"
                    value={stepAction}
                    onChange={(e) => setStepAction(e.target.value as 'click' | 'type' | 'navigate' | 'assert')}
                    className="px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                  >
                    <option value="click">click</option>
                    <option value="type">type</option>
                    <option value="navigate">navigate</option>
                    <option value="assert">assert</option>
                  </select>
                  <input
                    type="text"
                    aria-label="Step target"
                    value={stepTarget}
                    onChange={(e) => setStepTarget(e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={async () =>
                      setSnapshot((await api.addTeachStep(stepAction, stepTarget)).snapshot)
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    + Step
                  </button>
                </div>

                {snapshot.recording_task.steps.length > 0 && (
                  <ol className="text-[11px] font-mono text-[var(--text-secondary)] space-y-1 max-h-24 overflow-y-auto">
                    {snapshot.recording_task.steps.map((s) => (
                      <li key={s.index}>
                        {s.index}. {s.action}({s.target})
                      </li>
                    ))}
                  </ol>
                )}

                <form onSubmit={handleSaveTask} className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
                  <input
                    type="text"
                    required
                    aria-label="Taught task name"
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    placeholder={isId ? 'Nama tugas (mis. Cek Dashboard Harian)' : 'Task name (e.g. Daily Dashboard Check)'}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                  />
                  <input
                    type="text"
                    aria-label="Taught task description"
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    placeholder={isId ? 'Catatan singkat (opsional)' : 'Short note (optional)'}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                  />
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isId ? 'Simpan Tugas ke qyro-memory' : 'Save Task to qyro-memory'}
                  </button>
                </form>
              </div>
            )}

            <div className="space-y-2">
              {snapshot.taught_tasks.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  {isId
                    ? 'Belum ada rekaman tugas. Klik Mulai Rekam lalu lakukan navigasi/perintah PTY.'
                    : 'No recorded tasks yet. Click Start Recording and perform browser/PTY actions.'}
                </p>
              ) : (
                snapshot.taught_tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {task.name}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                        {task.steps.length} steps · runs: {task.run_count}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await api.replayTeachTask(task.id);
                        setSnapshot(res.snapshot);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      Replay
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* 4 Backends, Dual-Engine Browser & cgroups Guardrails */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-4">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-[var(--text-secondary)]" />
              {isId ? '4 Backend Computer Use & cgroups v2 Guardrails' : '4 Computer Use Backends & cgroups v2 Guardrails'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {backends.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={async () =>
                    setSnapshot((await api.updateComputerConfig({ backend: b.id })).snapshot)
                  }
                  className={`text-left p-2.5 rounded-xl border transition-colors ${
                    snapshot.policy.backend === b.id
                      ? 'border-[var(--text-primary)] bg-[var(--bg-canvas)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{b.name}</p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">{b.target}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="cg-browser" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Browser
                </label>
                <select
                  id="cg-browser"
                  value={snapshot.policy.requested_browser}
                  onChange={async (e) =>
                    setSnapshot(
                      (await api.updateComputerConfig({ browser_engine: e.target.value as BrowserEngineChoice }))
                        .snapshot
                    )
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                >
                  <option value="chromium">Chromium CDP</option>
                  <option value="camoufox">Camoufox</option>
                </select>
              </div>
              <div>
                <label htmlFor="cg-ram" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  RAM (MB)
                </label>
                <input
                  id="cg-ram"
                  type="number"
                  min={512}
                  max={24576}
                  step={512}
                  value={snapshot.policy.cgroups_ram_limit_mb}
                  onChange={async (e) =>
                    setSnapshot(
                      (await api.updateComputerConfig({ cgroups_ram_limit_mb: Number(e.target.value) })).snapshot
                    )
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="cg-tabs" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Max Tabs
                </label>
                <input
                  id="cg-tabs"
                  type="number"
                  min={1}
                  max={12}
                  value={snapshot.policy.max_tabs}
                  onChange={async (e) =>
                    setSnapshot(
                      (await api.updateComputerConfig({ max_tabs: Number(e.target.value) })).snapshot
                    )
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="cg-sleep" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Idle (min)
                </label>
                <input
                  id="cg-sleep"
                  type="number"
                  min={1}
                  max={240}
                  value={snapshot.policy.idle_sleep_min}
                  onChange={async (e) =>
                    setSnapshot(
                      (await api.updateComputerConfig({ idle_sleep_min: Number(e.target.value) })).snapshot
                    )
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Host Binary Probes */}
            <div className="border-t border-[var(--border-subtle)] pt-3 space-y-1.5">
              <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                {isId ? 'Runtime Binary Probe (Host Nyata)' : 'Runtime Binary Probe (Real Host)'}
              </p>
              <div className="space-y-1">
                {snapshot.probes.map((p) => (
                  <div
                    key={p.binary}
                    className="flex items-center justify-between gap-2 text-[11px] font-mono"
                  >
                    <span className="text-[var(--text-primary)]">{p.binary}</span>
                    <span
                      className={`truncate ${
                        p.detected ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]'
                      }`}
                    >
                      {p.detected ? p.resolved_path : 'UNSET'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
