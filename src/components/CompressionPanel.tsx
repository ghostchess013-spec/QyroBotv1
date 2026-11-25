import { useState } from 'react';
import { CheckCircle2, Play, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import type { CompressionResult, VerifyRtkReport } from '../core/router/compression';

interface CompressionPanelProps {
  t: (key: string) => string;
}

const SAMPLE_PRESETS = [
  {
    label: 'Prosa id-ID + Negasi',
    role: 'user_prose',
    text: 'Mohon dicatat bahwa sebenarnya pada dasarnya sistem ini tidak boleh menjalankan model AI lokal, jangan pernah mengirim kunci API ke log, bukan untuk dipakai tanpa izin, belum terverifikasi kecuali endpoint HTTPS, hanya memakai free tier, wajib aktif, dan dilarang bocor. Terima kasih banyak sebelumnya.',
  },
  {
    label: 'Cargo Build + Error',
    role: 'tool_output',
    text: '   Compiling serde v1.0.210\n   Compiling tokio v1.41.0\n   Compiling qyro-router v0.1.0\n   Compiling qyro-vault v0.1.0\nerror[E0425]: cannot find value `endpoint` in this scope\ntest result: FAILED. 14 passed; 1 failed',
  },
  {
    label: 'SKILL.md (Bypass)',
    role: 'active_skill_md',
    text: 'Sebenarnya pada dasarnya seluruh instruksi di dalam SKILL.md aktif wajib dipertahankan byte-for-byte tanpa dipotong oleh Caveman.',
  },
];

export function CompressionPanel({ t }: CompressionPanelProps) {
  const [text, setText] = useState(SAMPLE_PRESETS[0].text);
  const [role, setRole] = useState(SAMPLE_PRESETS[0].role);
  const [intensity, setIntensity] = useState<'light' | 'medium' | 'aggressive' | 'off'>('aggressive');
  const [enableRtk, setEnableRtk] = useState(true);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [verifyReport, setVerifyReport] = useState<VerifyRtkReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCompress() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await api.runCompression({
        text,
        role,
        enable_rtk: enableRtk,
        caveman_intensity: intensity,
      });
      setResult(res);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyRtk() {
    setBusy(true);
    try {
      const report = await api.verifyRtk();
      setVerifyReport(report);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('compression-title')}</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">{t('compression-subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={handleVerifyRtk}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
          Jalankan verify-rtk Gate
        </button>
      </div>

      {/* Live Compressor Workbench */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {SAMPLE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setText(preset.text);
                  setRole(preset.role);
                }}
                className="px-3 py-1.5 rounded-lg text-xs border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Block role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)]"
            >
              <option value="user_prose">user_prose</option>
              <option value="tool_output">tool_output</option>
              <option value="system_prompt">system_prompt (bypass)</option>
              <option value="active_skill_md">active_skill_md (bypass)</option>
              <option value="reviewer_rules">reviewer_rules (bypass)</option>
            </select>

            <select
              aria-label="Caveman intensity"
              value={intensity}
              onChange={(e) => setIntensity(e.target.value as 'light' | 'medium' | 'aggressive' | 'off')}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)]"
            >
              <option value="light">Caveman: light</option>
              <option value="medium">Caveman: medium</option>
              <option value="aggressive">Caveman: aggressive</option>
              <option value="off">Caveman: off</option>
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={enableRtk}
                onChange={(e) => setEnableRtk(e.target.checked)}
              />
              RTK Stage
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="compression-input" className="text-xs font-medium text-[var(--text-secondary)]">
              Input Teks / Log Mentah
            </label>
            <textarea
              id="compression-input"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--status-attention)]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text-secondary)]">Hasil Kompresi</span>
              {result && (
                <span className="font-mono tabular-nums text-[var(--status-success)]">
                  -{result.savings_pct}% ({result.original_tokens_est} -&gt; {result.compressed_tokens_est} tok)
                </span>
              )}
            </div>
            <pre
              data-testid="compression-output"
              className="min-h-[144px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap break-words"
            >
              {result ? result.output : 'Klik "Kompres Sekarang" untuk melihat hasil pipeline RTK -> Caveman.'}
            </pre>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          {result ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)] font-mono">
              <span>lang={result.detected_language}</span>
              <span aria-hidden="true">·</span>
              <span>rtk_removed={result.rtk_lines_removed}</span>
              <span aria-hidden="true">·</span>
              <span>bypassed={String(result.bypassed)}</span>
              {result.preserved_negations.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--status-success)]">
                    negations_locked=[{result.preserved_negations.join(', ')}]
                  </span>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-[var(--text-secondary)]">
              Negasi Bahasa Indonesia dikunci otomatis oleh Language Guard.
            </span>
          )}

          <button
            type="button"
            onClick={handleCompress}
            disabled={busy || !text.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            Kompres Sekarang
          </button>
        </div>
      </section>

      {/* verify-rtk Gate Report */}
      {verifyReport && (
        <section
          data-testid="verify-rtk-report"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Hasil Gate verify-rtk: {verifyReport.passed_checks}/{verifyReport.total_checks} Lulus
              </h3>
              <p className="text-xs font-mono text-[var(--text-secondary)] mt-0.5">
                SHA-256 Registry: {verifyReport.filter_registry_sha256.slice(0, 24)}...
              </p>
            </div>
            <span
              className={`text-xs font-semibold font-mono ${
                verifyReport.passed ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'
              }`}
            >
              {verifyReport.passed ? 'VERIFIED PASS' : 'FAILED'}
            </span>
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {verifyReport.checks.map((c) => (
              <div key={c.name} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                <div className="flex items-start gap-2 min-w-0">
                  {c.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[var(--status-danger)] shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono font-medium text-[var(--text-primary)]">{c.name}</div>
                    <div className="text-[var(--text-secondary)]">{c.details}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
