import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Play } from 'lucide-react';
import { api, type BootstrapResponse } from '../lib/api';
import type { RoutingStrategy } from '../core/types';
import type { RouteDecision } from '../core/router/engine';
import type { EndpointValidationResult } from '../core/router/endpointGuard';

interface RouterPanelProps {
  data: BootstrapResponse;
  t: (key: string) => string;
  onToggleFreeOnly: (enabled: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const ENDPOINT_PRESETS = [
  { label: 'Ollama localhost:11434', url: 'http://localhost:11434/v1' },
  { label: 'LM Studio 127.0.0.1:1234', url: 'http://127.0.0.1:1234/v1' },
  { label: 'VoxCPM2 UNSET', url: 'UNSET' },
  { label: 'Remote HTTPS Cloud', url: 'https://voxcpm2.cloud.example.com/v1' },
];

export function RouterPanel({ data, t, onToggleFreeOnly, onRefresh }: RouterPanelProps) {
  const [endpointInput, setEndpointInput] = useState('http://127.0.0.1:11434/v1');
  const [endpointResult, setEndpointResult] = useState<EndpointValidationResult | null>(null);
  const [target, setTarget] = useState('auto/coding');
  const [strategy, setStrategy] = useState<RoutingStrategy>('auto');
  const [simulateExhausted, setSimulateExhausted] = useState(false);
  const [decision, setDecision] = useState<RouteDecision | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleValidateEndpoint(urlOverride?: string) {
    const candidate = urlOverride ?? endpointInput;
    if (urlOverride !== undefined) setEndpointInput(urlOverride);
    const res = await api.validateEndpoint(candidate, 'voxcpm2-cloud');
    setEndpointResult(res);
  }

  async function handleRoute() {
    setBusy(true);
    try {
      const res = await api.routeRequest({
        target,
        strategy,
        free_only_override: data.preferences.free_only_mode,
        simulate_free_exhausted: simulateExhausted,
      });
      setDecision(res.decision);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('router-title')}</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">{t('router-subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => onToggleFreeOnly(!data.preferences.free_only_mode)}
          aria-pressed={data.preferences.free_only_mode}
          className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            data.preferences.free_only_mode
              ? 'border-[var(--status-success)] text-[var(--status-success)] bg-[var(--bg-surface)]'
              : 'border-[var(--status-warning)] text-[var(--status-warning)] bg-[var(--bg-surface)]'
          }`}
        >
          {data.preferences.free_only_mode ? t('status-free-only-on') : t('status-free-only-off')}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Anti-Local-Model Guard Tester */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Anti-Local-Model Guard & VoxCPM2 Remote Validator
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Menolak keras <code className="font-mono">localhost</code>,{' '}
              <code className="font-mono">127.0.0.0/8</code>, <code className="font-mono">::1</code>,
              port inferensi lokal RFC1918, dan status <code className="font-mono">UNSET</code>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {ENDPOINT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleValidateEndpoint(preset.url)}
                className="px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <label htmlFor="endpoint-guard-input" className="sr-only">
              Endpoint URL to validate
            </label>
            <input
              id="endpoint-guard-input"
              type="text"
              value={endpointInput}
              onChange={(e) => setEndpointInput(e.target.value)}
              className="flex-1 min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={() => handleValidateEndpoint()}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Validasi Endpoint
            </button>
          </div>

          {endpointResult && (
            <div
              data-testid="endpoint-guard-result"
              className={`rounded-xl border p-3.5 text-xs space-y-1 ${
                endpointResult.allowed
                  ? 'border-[var(--status-success)]/40 bg-[var(--bg-canvas)]'
                  : 'border-[var(--status-danger)]/40 bg-[var(--bg-canvas)]'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {endpointResult.allowed ? (
                  <ShieldCheck className="w-4 h-4 text-[var(--status-success)] shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-[var(--status-danger)] shrink-0" />
                )}
                <span
                  className={
                    endpointResult.allowed
                      ? 'text-[var(--status-success)]'
                      : 'text-[var(--status-danger)]'
                  }
                >
                  {endpointResult.allowed ? 'ALLOWED (Remote HTTPS)' : `BLOCKED · ${endpointResult.code}`}
                </span>
              </div>
              <p className="text-[var(--text-secondary)]">{endpointResult.reason}</p>
            </div>
          )}
        </section>

        {/* 20-Strategy Routing Simulator */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Simulasi 20 Strategi Routing & Virtual Combos
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Uji pemilihan provider multimodal serta penjaga kuota habis pada Free-Tier-Only Mode.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="route-target" className="block text-xs text-[var(--text-secondary)] mb-1">
                Virtual Combo / Provider
              </label>
              <select
                id="route-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
              >
                {data.catalog.virtual_combos.map((combo) => (
                  <option key={combo} value={combo}>
                    {combo}
                  </option>
                ))}
                <option value="voxcpm2-cloud">voxcpm2-cloud (Remote TTS)</option>
              </select>
            </div>

            <div>
              <label htmlFor="route-strategy" className="block text-xs text-[var(--text-secondary)] mb-1">
                Strategi OmniRoute (20)
              </label>
              <select
                id="route-strategy"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as RoutingStrategy)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
              >
                {data.catalog.strategies.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={simulateExhausted}
                onChange={(e) => setSimulateExhausted(e.target.checked)}
                className="rounded border-[var(--border-subtle)]"
              />
              Simulasikan kuota Free Tier habis
            </label>

            <button
              type="button"
              onClick={handleRoute}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Jalankan Routing
            </button>
          </div>

          {decision && (
            <div
              data-testid="route-decision-result"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 space-y-2 text-xs"
            >
              {decision.ok && decision.selected_provider ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--status-success)]">
                      Selected: {decision.selected_provider.name}
                    </span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {decision.selected_provider.tier.toUpperCase()} · ${decision.selected_provider.cost_per_1m_usd.toFixed(2)}/1M
                    </span>
                  </div>
                  <p className="font-mono text-[var(--text-secondary)]">
                    model={decision.selected_provider.default_model} · strategy={decision.strategy_used} · modality={decision.resolved_modality}
                  </p>
                  {decision.fallback_chain.length > 0 && (
                    <p className="text-[var(--text-secondary)]">
                      Fallback: <span className="font-mono">{decision.fallback_chain.join(' -> ')}</span>
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--status-danger)]">
                    {decision.error_code}
                  </p>
                  <p className="text-[var(--text-secondary)]">{decision.error_message}</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Declarative Cloud Provider Registry Table */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Active Cloud Provider Registry ({data.catalog.providers.length} profil aktif · {data.catalog.totals.supported_cloud_providers} katalog global)
          </h3>
          <span className="text-xs font-mono text-[var(--text-secondary)]">
            {data.catalog.policy}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="py-2.5 px-5 font-medium">Provider</th>
                <th className="py-2.5 px-3 font-medium">Tier</th>
                <th className="py-2.5 px-3 font-medium">Modalities</th>
                <th className="py-2.5 px-3 font-medium">Endpoint</th>
                <th className="py-2.5 px-3 font-medium text-right">Latency</th>
                <th className="py-2.5 px-5 font-medium text-right">Cost / 1M</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.catalog.providers.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--bg-surface-hover)]/60">
                  <td className="py-2.5 px-5">
                    <div className="font-medium text-[var(--text-primary)]">{p.name}</div>
                    <div className="font-mono text-[var(--text-secondary)]">{p.default_model}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    <span
                      className={
                        p.tier === 'paid'
                          ? 'text-[var(--status-warning)]'
                          : 'text-[var(--status-success)]'
                      }
                    >
                      {p.tier}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-[var(--text-secondary)] font-mono">
                    {p.modalities.join(', ')}
                  </td>
                  <td className="py-2.5 px-3 font-mono max-w-[240px] truncate">
                    {p.endpoint === 'UNSET' ? (
                      <span className="text-[var(--status-warning)] font-semibold">UNSET</span>
                    ) : (
                      <span className="text-[var(--text-secondary)]">{p.endpoint}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                    {p.avg_latency_ms} ms
                  </td>
                  <td className="py-2.5 px-5 text-right font-mono tabular-nums text-[var(--text-primary)]">
                    ${p.cost_per_1m_usd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
