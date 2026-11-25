import { useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { api, type BootstrapResponse } from '../lib/api';
import type { EventEnvelope } from '../core/types';

interface OverviewPanelProps {
  data: BootstrapResponse;
  t: (key: string) => string;
  onRefresh: () => Promise<void>;
}

export function OverviewPanel({ data, t, onRefresh }: OverviewPanelProps) {
  const [resumeCursor, setResumeCursor] = useState<string>('0');
  const [resumedEvents, setResumedEvents] = useState<EventEnvelope[]>(data.events);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (resumeCursor === '0') {
      setResumedEvents(data.events);
    }
  }, [data.events, resumeCursor]);

  const pendingActions = data.action_queue.filter((a) => a.status === 'pending');

  async function handleResumeEvents() {
    setResumeBusy(true);
    try {
      const parsed = Number(resumeCursor);
      const res = await api.resumeEvents(Number.isFinite(parsed) ? parsed : 0);
      setResumedEvents(res.events);
    } finally {
      setResumeBusy(false);
    }
  }

  async function handleResolve(id: string, decision: 'approved' | 'denied') {
    setActionBusy(true);
    try {
      await api.resolveAction(id, decision);
      await onRefresh();
    } finally {
      setActionBusy(false);
    }
  }

  async function handleEnqueueAction(e: React.FormEvent) {
    e.preventDefault();
    if (!newActionTitle.trim()) return;
    setActionBusy(true);
    try {
      await api.enqueueAction(
        newActionTitle.trim(),
        'Permintaan uji antrean aksi Fase 1 melalui SQLite action_queue.'
      );
      setNewActionTitle('');
      await onRefresh();
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Summary KPI Row — Single elevation hairline border, tabular-nums */}
      <section aria-label="Storage and runtime metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">SQLite Schema</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {data.stats.table_count}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)] font-mono">
            {data.stats.journal_mode.toUpperCase()} · {data.stats.schema_version}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Latest Event ID</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">
            #{data.stats.latest_event_id}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Monotonic resume cursor
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Cloud Catalog</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {data.catalog.totals.free_tier_cloud_providers} / {data.catalog.totals.supported_cloud_providers}
          </p>
          <p className="mt-1 text-xs text-[var(--status-success)]">
            Free tier · 0 local models
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Vault & Memory</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {data.stats.vault_secret_count} / {data.stats.memory_observation_count}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Secrets · FTS5 observations
          </p>
        </div>
      </section>

      {/* Action Queue & Event Log Split */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Action Queue */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {t('action-queue-title')}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                {pendingActions.length} pending · {data.action_queue.length} total
              </p>
            </div>
          </div>

          <form onSubmit={handleEnqueueAction} className="flex gap-2">
            <label htmlFor="new-action-input" className="sr-only">
              Enqueue sample approval action
            </label>
            <input
              id="new-action-input"
              type="text"
              value={newActionTitle}
              onChange={(e) => setNewActionTitle(e.target.value)}
              placeholder="Tambah permintaan approval baru..."
              className="flex-1 min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--status-attention)]"
            />
            <button
              type="submit"
              disabled={actionBusy || !newActionTitle.trim()}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              Tambah
            </button>
          </form>

          {data.action_queue.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] py-6 text-center">
              {t('action-queue-empty')}
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {data.action_queue.slice(0, 6).map((item) => (
                <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className="font-mono">{item.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.bot_name ?? item.bot_id}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          item.status === 'pending'
                            ? 'text-[var(--status-warning)] font-medium'
                            : 'text-[var(--status-success)]'
                        }
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                      {String(item.payload.title ?? item.kind)}
                    </p>
                    {item.payload.summary ? (
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {String(item.payload.summary)}
                      </p>
                    ) : null}
                  </div>
                  {item.status === 'pending' ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleResolve(item.id, 'approved')}
                        disabled={actionBusy}
                        aria-label={`Approve ${String(item.payload.title ?? item.id)}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--status-success)] text-white hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {t('action-approve')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolve(item.id, 'denied')}
                        disabled={actionBusy}
                        aria-label={`Deny ${String(item.payload.title ?? item.id)}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        {t('action-deny')}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-mono text-[var(--text-secondary)] shrink-0">
                      {String(item.payload.decision ?? 'resolved')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Event Log with last_event_id gapless resume */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {t('event-log-title')}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Query gapless replay via <code className="font-mono">resume_from=last_event_id</code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="resume-cursor" className="text-xs text-[var(--text-secondary)]">
                last_event_id
              </label>
              <input
                id="resume-cursor"
                type="number"
                min={0}
                value={resumeCursor}
                onChange={(e) => setResumeCursor(e.target.value)}
                className="w-20 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] tabular-nums"
              />
              <button
                type="button"
                onClick={handleResumeEvents}
                disabled={resumeBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resumeBusy ? 'animate-spin' : ''}`} />
                Replay
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {resumedEvents.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-6 text-center">
                Tidak ada event baru setelah event_id #{resumeCursor}.
              </p>
            ) : (
              [...resumedEvents].reverse().slice(0, 20).map((ev) => (
                <div key={ev.event_id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-[var(--status-attention)] font-medium">#{ev.event_id}</span>
                      <span className="text-[var(--text-primary)] font-medium">{ev.kind}</span>
                    </div>
                    <p className="mt-0.5 text-[var(--text-secondary)] font-mono truncate">
                      {JSON.stringify(ev.payload)}
                    </p>
                  </div>
                  <span className="text-[var(--text-secondary)] font-mono shrink-0 tabular-nums">
                    {ev.timestamp.slice(11, 19)}Z
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* SQLite Tables Matrix */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Migrasi Tabel SQLite PRD §14.1 ({data.stats.table_count} tabel aktif)
        </h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-2 text-xs">
          {data.stats.tables.map((tbl) => (
            <div
              key={tbl.name}
              className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)]"
            >
              <span className="font-mono text-[var(--text-primary)] truncate">{tbl.name}</span>
              <span className="font-mono tabular-nums text-[var(--text-secondary)] ml-2">
                {tbl.rows}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
