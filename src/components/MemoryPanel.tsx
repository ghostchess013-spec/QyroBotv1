import { useEffect, useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import { api, type BootstrapResponse } from '../lib/api';
import type { MemSearchIndexRow, MemoryObservation } from '../core/memory';

interface MemoryPanelProps {
  data: BootstrapResponse;
  t: (key: string) => string;
  onRefresh: () => Promise<void>;
}

export function MemoryPanel({ data, t, onRefresh }: MemoryPanelProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('phase1, observer');
  const [recordFeedback, setRecordFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 3-Step Progressive Disclosure mem-search state
  const [query, setQuery] = useState('');
  const [indexResults, setIndexResults] = useState<MemSearchIndexRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timelineRows, setTimelineRows] = useState<MemSearchIndexRow[]>([]);
  const [detailRows, setDetailRows] = useState<MemoryObservation[]>([]);

  async function runIndexSearch(q: string) {
    const res = await api.searchMemoryIndex(q);
    setIndexResults(res.results);
  }

  useEffect(() => {
    void runIndexSearch('');
  }, []);

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const res = await api.recordObservation({
        title: title.trim(),
        body: body.trim(),
        tags,
        kind: 'observation',
      });
      setRecordFeedback(
        `Tersimpan (${res.observation.id}) · blok <private> teredaksi: ${res.observation.private_blocks_redacted}`
      );
      setTitle('');
      setBody('');
      await onRefresh();
      await runIndexSearch(query);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectForTimelineAndDetails(id: string) {
    setSelectedId(id);
    const [tl, det] = await Promise.all([
      api.searchMemoryTimeline(id),
      api.searchMemoryDetails([id]),
    ]);
    setTimelineRows(tl.timeline);
    setDetailRows(det.observations);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('memory-title')}</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">{t('memory-subtitle')}</p>
      </div>

      {/* Record Observation with <private> filter */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Rekam Observasi Baru (Filter Mutlak &lt;private&gt;)
          </h3>
          <span className="text-xs font-mono text-[var(--text-secondary)]">
            {data.memory_sessions.length} sesi aktif
          </span>
        </div>

        <form onSubmit={handleRecord} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="obs-title" className="block text-xs text-[var(--text-secondary)] mb-1">
                Judul Observasi
              </label>
              <input
                id="obs-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Audit Deployment VPS Ampere"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label htmlFor="obs-tags" className="block text-xs text-[var(--text-secondary)] mb-1">
                Tag (pisah koma)
              </label>
              <input
                id="obs-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="obs-body" className="block text-xs text-[var(--text-secondary)] mb-1">
              Isi Observasi (bungkus data sensitif dengan &lt;private&gt;...&lt;/private&gt;)
            </label>
            <textarea
              id="obs-body"
              rows={3}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Contoh: Server Ampere berjalan stabil <private>pin-rahasia-9999</private> dengan penggunaan RAM 42MB."
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs text-[var(--text-primary)]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {recordFeedback ? (
              <span data-testid="memory-record-feedback" className="text-xs font-mono text-[var(--status-success)]">
                {recordFeedback}
              </span>
            ) : (
              <span className="text-xs text-[var(--text-secondary)]">
                Isi di dalam &lt;private&gt; tidak pernah masuk database maupun FTS5.
              </span>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Simpan Observasi
            </button>
          </div>
        </form>
      </section>

      {/* 3-Step Progressive Disclosure mem-search */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              3-Step Progressive Disclosure mem-search (SQLite FTS5)
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              1. Index Ringkas -&gt; 2. Timeline Kronologis -&gt; 3. Detail Penuh sesuai ID terpilih
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runIndexSearch(query);
            }}
            className="flex gap-2"
          >
            <label htmlFor="mem-search-input" className="sr-only">
              Search observer memory
            </label>
            <input
              id="mem-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari memori FTS5..."
              className="w-56 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 whitespace-nowrap cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              Cari Index
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Step 1: Compact Index */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
              <span>Step 1 · Index ({indexResults.length})</span>
              <span className="font-mono">FTS5 BM25</span>
            </div>
            <div data-testid="memory-index-results" className="divide-y divide-[var(--border-subtle)]">
              {indexResults.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] py-6 text-center">
                  0 hasil ditemukan.
                </p>
              ) : (
                indexResults.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleSelectForTimelineAndDetails(row.id)}
                    className={`w-full text-left py-2.5 px-2 rounded-lg transition-colors cursor-pointer ${
                      selectedId === row.id
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                        : 'hover:bg-[var(--bg-surface)]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-[var(--text-primary)] truncate">
                        {row.title}
                      </span>
                      <span className="font-mono text-[var(--text-secondary)] shrink-0 tabular-nums">
                        ~{row.estimated_tokens}t
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                      {row.summary}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Step 2: Timeline */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
              <span>Step 2 · Timeline Sesi</span>
              <span className="font-mono tabular-nums">{timelineRows.length} item</span>
            </div>
            {timelineRows.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-6 text-center">
                Pilih satu observasi dari Step 1 untuk memuat konteks timeline.
              </p>
            ) : (
              <div className="space-y-2">
                {timelineRows.map((row) => (
                  <div
                    key={row.id}
                    className={`p-2 rounded-lg border text-xs ${
                      row.id === selectedId
                        ? 'border-[var(--status-attention)] bg-[var(--bg-surface)]'
                        : 'border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className="font-mono text-[var(--text-secondary)]">{row.id}</div>
                    <div className="font-medium text-[var(--text-primary)] mt-0.5">{row.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 3: Details */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
              <span>Step 3 · Detail Penuh</span>
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            {detailRows.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-6 text-center">
                Isi lengkap hanya diunduh setelah ID dipilih untuk menghemat token.
              </p>
            ) : (
              detailRows.map((obs) => (
                <div key={obs.id} data-testid="memory-detail-body" className="space-y-2 text-xs">
                  <div className="font-semibold text-[var(--text-primary)]">{obs.title}</div>
                  <p className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                    {obs.body}
                  </p>
                  <div className="pt-2 border-t border-[var(--border-subtle)] font-mono text-[var(--text-secondary)] space-y-0.5">
                    <div>tags: {obs.tags.join(', ') || '-'}</div>
                    <div>private_redacted: {obs.private_blocks_redacted}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
