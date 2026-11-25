import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  FileCode2,
  Hand,
  Lock,
  MessageCircle,
  Radio,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { UiLocale } from '../core/types';
import type { BrowserEngineChoice } from '../core/computer';
import type {
  XActiveTimezone,
  XBridgeSnapshot,
  XDisplayMode,
  XTriggerKind,
} from '../core/x-bridge';
import { api } from '../lib/api';

interface XBridgePanelProps {
  activeBotId: string;
  locale: UiLocale;
  onRefreshBootstrap: () => Promise<void>;
  onNavigateComputer: () => void;
}

const SAMPLE_X_BUNDLE_CHUNK = `// Sample live x.com webpack chunk fragment (for testing Dynamic Bundle Extractor)
e.exports={queryId:"k9LmNpQrStUvWx0123",operationName:"CreateTweet",operationType:"mutation"};
e.exports={operationName:"Bookmarks",queryId:"AbCdEfGhIjKlMn4567",operationType:"query"};
e.exports={queryId:"ZyXwVuTsRqPoNm8901",operationName:"HomeTimeline",operationType:"query"};
const switches={"responsive_web_graphql_exclude_directive_enabled":true,"tweetypie_unmention_optimization_enabled":true,"longform_notetweets_consumption_enabled":true};`;

export const XBridgePanel: React.FC<XBridgePanelProps> = ({
  activeBotId,
  locale,
  onRefreshBootstrap,
  onNavigateComputer,
}) => {
  const isId = locale === 'id-ID';
  const [snapshot, setSnapshot] = useState<XBridgeSnapshot | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Self-Auth Form
  const [handleInput, setHandleInput] = useState('@qyro_builder');
  const [pinnedIpInput, setPinnedIpInput] = useState('203.0.113.42');
  const [engineChoice, setEngineChoice] = useState<BrowserEngineChoice>('chromium');

  // Dynamic Bundle Extractor
  const [bundleInput, setBundleInput] = useState('');

  // 3 Free Global Triggers
  const [triggerKind, setTriggerKind] = useState<XTriggerKind>('bookmark');
  const [triggerHandle, setTriggerHandle] = useState('@rustlang');
  const [triggerFolder, setTriggerFolder] = useState('Riset AI & Rust');
  const [triggerText, setTriggerText] = useState(
    'Ringkasan arsitektur memory-safe async runtime terbaru untuk server VPS ARM64.'
  );
  const [allowlistInput, setAllowlistInput] = useState('@trusted_alt, @qyro_builder');

  // Inline Draft editor overrides
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});

  const loadState = useCallback(async () => {
    const res = await api.getXBridgeState();
    setSnapshot(res.snapshot);
    if (res.snapshot.profile.handle) {
      setHandleInput(res.snapshot.profile.handle);
    }
    if (res.snapshot.profile.pinned_ip) {
      setPinnedIpInput(res.snapshot.profile.pinned_ip);
    }
    setEngineChoice(res.snapshot.profile.browser_engine);
    if (res.snapshot.profile.alt_allowlist.length > 0) {
      setAllowlistInput(res.snapshot.profile.alt_allowlist.join(', '));
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  if (!snapshot) {
    return (
      <div className="p-6 text-xs text-[var(--text-secondary)]">
        {isId ? 'Memuat qyro-x-bridge & X Shield...' : 'Loading qyro-x-bridge & X Shield...'}
      </div>
    );
  }

  const { profile, manifest, warmup_quota, layers } = snapshot;
  const isPaused = profile.status === 'paused_needs_human';
  const queryIdEntries =
    manifest.query_ids === 'UNSET' ? [] : Object.entries(manifest.query_ids);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1060px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              {isId ? 'X Bridge (Self-Auth Gratis) & 6-Layer Anti-Ban Shield' : 'Free Self-Auth X Bridge & 6-Layer Anti-Ban Shield'}
            </h1>
            <p className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
              Status: {profile.status} · Handle: {profile.handle ?? 'UNSET'} · Manifest:{' '}
              {manifest.status} · Warm-Up Day {profile.warmup_day}/7 ({profile.writes_today}/
              {warmup_quota.max_writes_per_day} writes)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                const res = await api.startXSelfAuthTakeover(activeBotId);
                setSnapshot(res.snapshot);
                await onRefreshBootstrap();
                onNavigateComputer();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <Hand className="w-3.5 h-3.5" />
              {isId ? 'Ambil alih Login X' : 'Take Over X Login'}
            </button>

            {isPaused ? (
              <button
                type="button"
                onClick={async () => {
                  const res = await api.resumeXCircuitBreaker();
                  setSnapshot(res.snapshot);
                  setFeedback({
                    kind: 'ok',
                    text: isId
                      ? 'Verifikasi manusia selesai. Akun dibuka kembali dari PAUSED_NEEDS_HUMAN.'
                      : 'Human check completed. Account resumed from PAUSED_NEEDS_HUMAN.',
                  });
                  await onRefreshBootstrap();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--status-success)] text-[#0a0a0c] text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isId ? 'Pulihkan Pasca Verifikasi' : 'Resume After Check'}
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const res = await api.tripXCircuitBreaker({
                    bot_id: activeBotId,
                    http_status: 429,
                    body_snippet: 'Arkose challenge_required',
                  });
                  setSnapshot(res.snapshot);
                  setFeedback({ kind: 'err', text: res.reason });
                  await onRefreshBootstrap();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-xs font-medium text-[var(--status-danger)] whitespace-nowrap shrink-0"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                {isId ? 'Uji Circuit Breaker (429)' : 'Test Circuit Breaker (429)'}
              </button>
            )}
          </div>
        </div>

        {/* Honest Technical Boundary Banner (PRD §11) */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)] leading-relaxed flex items-start gap-2">
          <Lock className="w-4 h-4 text-[var(--text-secondary)] shrink-0 mt-0.5" />
          <span>{isId ? snapshot.disclaimer_id : snapshot.disclaimer_en}</span>
        </div>

        {/* Critical Circuit Breaker Alert */}
        {isPaused && (
          <div className="rounded-xl border border-[var(--status-danger)]/50 bg-[var(--bg-sidebar)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[var(--status-danger)] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-[var(--status-danger)]">
                  PAUSED_NEEDS_HUMAN — Circuit Breaker Aktif (Nol Auto-Retry)
                </p>
                <p className="text-xs text-[var(--text-primary)]">{profile.pause_reason}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                const res = await api.resumeXCircuitBreaker();
                setSnapshot(res.snapshot);
                setFeedback({
                  kind: 'ok',
                  text: isId
                    ? 'Verifikasi manusia selesai. Akun dibuka kembali dari PAUSED_NEEDS_HUMAN.'
                    : 'Human check completed. Account resumed from PAUSED_NEEDS_HUMAN.',
                });
                await onRefreshBootstrap();
              }}
              className="px-3 py-1.5 rounded-lg bg-[var(--status-success)] text-[#0a0a0c] text-xs font-semibold whitespace-nowrap shrink-0"
            >
              {isId ? 'Selesai Verifikasi Manusia' : 'Mark Human Check Done'}
            </button>
          </div>
        )}

        {feedback && (
          <div
            className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs ${
              feedback.kind === 'ok' ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Row 1: Persistent Self-Auth + Dynamic Bundle Extractor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Self-Auth Profile & IP Pinning */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--status-success)] shrink-0" />
                {isId ? 'Dual-Layer Self-Auth & IP Pinning' : 'Dual-Layer Self-Auth & IP Pinning'}
              </h2>
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                {profile.session_cookie_fp ?? 'no-session-cookie'}
              </span>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await api.completeXSelfAuth({
                    handle: handleInput,
                    pinned_ip: pinnedIpInput,
                    browser_engine: engineChoice,
                    warmup_day: profile.warmup_day,
                  });
                  setSnapshot(res.snapshot);
                  setFeedback({
                    kind: 'ok',
                    text: isId
                      ? `Self-Auth selesai untuk ${res.snapshot.profile.handle} (IP terkunci: ${res.snapshot.profile.pinned_ip}).`
                      : `Self-Auth locked for ${res.snapshot.profile.handle} (Pinned IP: ${res.snapshot.profile.pinned_ip}).`,
                  });
                  await onRefreshBootstrap();
                } catch (err) {
                  setFeedback({
                    kind: 'err',
                    text: err instanceof Error ? err.message : 'Gagal menyimpan Self-Auth',
                  });
                }
              }}
              className="space-y-2.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="x-handle" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    Handle X
                  </label>
                  <input
                    id="x-handle"
                    type="text"
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    placeholder="@username"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="x-pinned-ip" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    Pinned IP (Layer 3)
                  </label>
                  <input
                    id="x-pinned-ip"
                    type="text"
                    value={pinnedIpInput}
                    onChange={(e) => setPinnedIpInput(e.target.value)}
                    placeholder="203.0.113.42"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="x-browser" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    Browser Profile
                  </label>
                  <select
                    id="x-browser"
                    value={engineChoice}
                    onChange={(e) => setEngineChoice(e.target.value as BrowserEngineChoice)}
                    className="w-full px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    <option value="chromium">Chromium CDP</option>
                    <option value="camoufox">Camoufox</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="x-display" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    Zero-Leak Display (Layer 4)
                  </label>
                  <select
                    id="x-display"
                    value={profile.display_mode}
                    onChange={async (e) =>
                      setSnapshot(
                        (await api.updateXShieldConfig({ display_mode: e.target.value as XDisplayMode }))
                          .snapshot
                      )
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    <option value="cage_wayland">Cage Wayland</option>
                    <option value="xvfb">Xvfb Non-Headless</option>
                    <option value="headless_forbidden">Headless (Blocked)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full px-3 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-semibold"
              >
                {isId ? 'Konfirmasi Sesi Self-Auth & Kunci IP' : 'Confirm Self-Auth Session & Pin IP'}
              </button>
            </form>
          </section>

          {/* Dynamic Bundle Extractor (configs/x-manifest.json) */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <FileCode2 className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                Dynamic Bundle Extractor (configs/x-manifest.json)
              </h2>
              <span
                className={`text-[11px] font-mono ${
                  manifest.status === 'EXTRACTED'
                    ? 'text-[var(--status-success)]'
                    : 'text-[var(--status-warning)]'
                }`}
              >
                {manifest.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBundleInput(SAMPLE_X_BUNDLE_CHUNK)}
                className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-[11px] font-mono whitespace-nowrap shrink-0"
              >
                {isId ? 'Muat Contoh Chunk JS' : 'Load Sample JS Chunk'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await api.resetXManifest();
                  setSnapshot(res.snapshot);
                  setFeedback({
                    kind: 'ok',
                    text: isId
                      ? 'Manifest dikembalikan ke status UNSET.'
                      : 'Manifest reset to UNSET.',
                  });
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-[11px] whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                Reset UNSET
              </button>
            </div>

            <textarea
              rows={3}
              aria-label="X Client JS Bundle Chunk"
              value={bundleInput}
              onChange={(e) => setBundleInput(e.target.value)}
              placeholder={
                isId
                  ? 'Tempel potongan bundle JS x.com berisi queryId & operationName (nol hardcoded queryId)...'
                  : 'Paste x.com client JS chunk containing queryId & operationName (zero hardcoded queryIds)...'
              }
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-mono text-[var(--text-primary)]"
            />

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                hash: {manifest.bundle_hash === 'UNSET' ? 'UNSET' : manifest.bundle_hash.slice(0, 26) + '...'}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (!bundleInput.trim()) return;
                  const res = await api.extractXManifest(bundleInput, 'live-x-web-chunk.js');
                  setSnapshot(res.data.snapshot);
                  setFeedback({
                    kind: res.data.ok ? 'ok' : 'err',
                    text: res.data.ok
                      ? isId
                        ? `Ekstraksi berhasil: ${res.data.extracted_query_count} queryId & ${res.data.extracted_switch_count} feature switches tersimpan ke configs/x-manifest.json.`
                        : `Extracted ${res.data.extracted_query_count} queryIds & ${res.data.extracted_switch_count} switches to configs/x-manifest.json.`
                      : res.data.error ?? 'Extraction failed',
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-semibold whitespace-nowrap shrink-0"
              >
                {isId ? 'Ekstrak queryId' : 'Extract queryIds'}
              </button>
            </div>

            {queryIdEntries.length > 0 && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 space-y-1 text-[11px] font-mono">
                {queryIdEntries.map(([op, qid]) => (
                  <div key={op} className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-primary)] truncate">{op}</span>
                    <span className="text-[var(--status-success)] shrink-0">{qid}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Row 2: 6-Layer X Shield Matrix + Progressive Warm-Up & Active Hours */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
              {isId ? '6 Lapisan X Shield, Active Hours (WIB/WITA/WIT) & Warm-Up Hari 1–7' : '6-Layer X Shield, Active Hours (WIB/WITA/WIT) & Warm-Up Days 1–7'}
            </h2>
            <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
              Next Log-Normal Jitter: {(snapshot.next_jitter_preview_ms / 1000).toFixed(1)}s
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {layers.map((layer) => (
              <div
                key={layer.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                    L{layer.layer_number} · {layer.name}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase shrink-0 ${
                      layer.status === 'active'
                        ? 'text-[var(--status-success)]'
                        : layer.status === 'warning'
                          ? 'text-[var(--status-warning)]'
                          : 'text-[var(--status-danger)]'
                    }`}
                  >
                    {layer.status}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {layer.detail}
                </p>
              </div>
            ))}
          </div>

          {/* Warm-Up Day & Active Hours Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label htmlFor="x-warmup-day" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                Warm-Up Guard (Hari 1–7)
              </label>
              <select
                id="x-warmup-day"
                value={profile.warmup_day}
                onChange={async (e) =>
                  setSnapshot(
                    (await api.updateXShieldConfig({ warmup_day: Number(e.target.value) })).snapshot
                  )
                }
                className="w-full px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                {snapshot.warmup_schedule.map((w) => (
                  <option key={w.day} value={w.day}>
                    {w.stage_label} ({w.max_writes_per_day} write/hari)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="x-tz" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                Active Hours Timezone
              </label>
              <select
                id="x-tz"
                value={profile.active_tz}
                onChange={async (e) =>
                  setSnapshot(
                    (await api.updateXShieldConfig({ active_tz: e.target.value as XActiveTimezone }))
                      .snapshot
                  )
                }
                className="w-full px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
                <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
                <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
              </select>
            </div>

            <div>
              <label htmlFor="x-start-h" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                Mulai Jam (0–23)
              </label>
              <input
                id="x-start-h"
                type="number"
                min={0}
                max={23}
                value={profile.active_start_hour}
                onChange={async (e) =>
                  setSnapshot(
                    (await api.updateXShieldConfig({ active_start_hour: Number(e.target.value) }))
                      .snapshot
                  )
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="x-end-h" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                Selesai Jam (0–23)
              </label>
              <input
                id="x-end-h"
                type="number"
                min={0}
                max={23}
                value={profile.active_end_hour}
                onChange={async (e) =>
                  setSnapshot(
                    (await api.updateXShieldConfig({ active_end_hour: Number(e.target.value) }))
                      .snapshot
                  )
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums"
              />
            </div>
          </div>
        </section>

        {/* Row 3: 3 Free Global Triggers + Interactive Inline Draft Cards (Layer 1 Ask + Humanizer) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 3 Free Global Triggers */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
              {isId ? '3 Trigger Gratis Global (Nol X API Berbayar)' : '3 Free Global Triggers (Zero Paid X API)'}
            </h2>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'bookmark', label: 'Bookmark', icon: Bookmark },
                  { id: 'self_dm', label: 'Self-DM', icon: MessageCircle },
                  { id: 'mention_alt', label: 'Mention/Alt', icon: Radio },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTriggerKind(t.id)}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-medium whitespace-nowrap ${
                      triggerKind === t.id
                        ? 'border-[var(--text-primary)] bg-[var(--bg-canvas)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                aria-label="Trigger source handle"
                value={triggerHandle}
                onChange={(e) => setTriggerHandle(e.target.value)}
                placeholder="@source_handle"
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
              />
              <input
                type="text"
                aria-label="Bookmark folder or thread"
                value={triggerFolder}
                onChange={(e) => setTriggerFolder(e.target.value)}
                placeholder="Folder / Thread"
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              />
            </div>

            <textarea
              rows={2}
              aria-label="Trigger source text"
              value={triggerText}
              onChange={(e) => setTriggerText(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            />

            {triggerKind === 'mention_alt' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Trusted Mention/Alt allowlist"
                  value={allowlistInput}
                  onChange={(e) => setAllowlistInput(e.target.value)}
                  placeholder="@trusted_alt, @owner"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const list = allowlistInput
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    setSnapshot((await api.updateXShieldConfig({ alt_allowlist: list })).snapshot);
                    setFeedback({ kind: 'ok', text: `Allowlist diperbarui (${list.length} handle).` });
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs whitespace-nowrap shrink-0"
                >
                  Simpan Allowlist
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={async () => {
                const res = await api.ingestXTrigger({
                  trigger_kind: triggerKind,
                  bot_id: activeBotId,
                  source_handle: triggerHandle,
                  source_text: triggerText,
                  folder_or_thread: triggerFolder,
                });
                setSnapshot(res.data.snapshot);
                setFeedback({
                  kind: res.data.accepted ? 'ok' : 'err',
                  text: res.data.accepted
                    ? isId
                      ? `Trigger ${triggerKind} diterima -> Inline Draft Card + Humanizer siap disetujui.`
                      : `Trigger ${triggerKind} accepted -> Humanized Inline Draft Card ready for review.`
                    : res.data.error ?? 'Trigger ditolak',
                });
                await onRefreshBootstrap();
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isId ? 'Jalankan Trigger -> Buat Draft Humanizer' : 'Run Trigger -> Create Humanized Draft'}
            </button>
          </section>

          {/* Interactive Inline Draft Cards (Strict Write Gate + Humanizer) */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Send className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
              {isId ? `Inline Draft Cards & Antrean Serial (${snapshot.drafts.length})` : `Inline Draft Cards & Serial Queue (${snapshot.drafts.length})`}
            </h2>

            {snapshot.drafts.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">
                {isId
                  ? 'Belum ada draft X. Jalankan salah satu Trigger Gratis di sebelah kiri untuk membuat kartu draft yang sudah melewati Humanizer.'
                  : 'No X drafts yet. Run one of the 3 Free Triggers on the left to generate a Humanized Inline Draft Card.'}
              </p>
            ) : (
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {snapshot.drafts.map((draft) => {
                  const editedVal = draftEdits[draft.id] ?? draft.humanized_text;
                  const canApprove =
                    draft.status === 'awaiting_approval' || draft.status === 'blocked_by_shield';
                  return (
                    <div
                      key={draft.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="text-[var(--text-primary)] font-semibold">
                          {draft.action_kind} · {draft.target_ref ?? 'timeline'}
                        </span>
                        <span
                          className={
                            draft.status === 'dispatched'
                              ? 'text-[var(--status-success)]'
                              : draft.status === 'blocked_by_shield'
                                ? 'text-[var(--status-danger)]'
                                : 'text-[var(--status-warning)]'
                          }
                        >
                          {draft.status}
                        </span>
                      </div>

                      <textarea
                        rows={2}
                        aria-label={`Edit X draft ${draft.id}`}
                        value={editedVal}
                        disabled={!canApprove}
                        onChange={(e) =>
                          setDraftEdits((prev) => ({ ...prev, [draft.id]: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                        <span>
                          Humanizer: {draft.patterns_cleaned.length} pola dibersihkan
                        </span>
                        {canApprove && (
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await api.approveXDraft(draft.id, {
                                edited_text: editedVal,
                                outbound_ip: pinnedIpInput,
                              });
                              setSnapshot(res.data.snapshot);
                              setFeedback({
                                kind: res.data.ok ? 'ok' : 'err',
                                text: res.data.evaluation.reason,
                              });
                              await onRefreshBootstrap();
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[var(--status-success)] text-[#0a0a0c] text-xs font-semibold whitespace-nowrap shrink-0"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {isId ? 'Setujui & Kirim Serial' : 'Approve & Serial Send'}
                          </button>
                        )}
                      </div>

                      {draft.shield_note && (
                        <p className="text-[11px] font-mono text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-1.5">
                          {draft.shield_note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
