/**
 * qyro-router/engine — Native OmniRoute Cloud Router Engine (PRD v1.7.0 §8)
 *
 * Implements:
 * - Declarative Cloud Provider Registry (378 supported, 154 free-tier metadata + active providers)
 * - Hard Anti-Local-Model Guard on every candidate endpoint (incl. VoxCPM2 Remote TTS)
 * - Free-Tier-Only Mode (default true): strictly filters to free / oauth_sub, transparent reset_at error
 * - Virtual combos (auto/fast, auto/coding, auto/reasoning, auto/vision, auto/image, auto/video, auto/tts, auto/stt)
 * - Persisted user combos
 * - All 20 OmniRoute Routing Strategies
 */

import fs from 'node:fs';
import path from 'node:path';
import type { QyroStorage } from '../storage';
import {
  ROUTING_STRATEGIES,
  UNSET_SENTINEL,
  type CloudProviderSpec,
  type Modality,
  type RoutingStrategy,
} from '../types';
import { validateCloudEndpoint } from './endpointGuard';

export interface ProviderCatalogFile {
  schema_version: string;
  policy: string;
  catalog_totals: {
    supported_cloud_providers: number;
    free_tier_cloud_providers: number;
    supported_models: number;
  };
  providers: CloudProviderSpec[];
}

export interface RouteRequest {
  target: string; // e.g. 'auto/coding', 'auto/tts', 'groq-cloud/llama-3.3-70b-versatile', or persisted combo name
  strategy?: RoutingStrategy;
  requiredContextTokens?: number;
  freeOnlyOverride?: boolean;
  simulateFreeExhausted?: boolean;
  voxcpmRemoteEndpoint?: string;
}

export interface RouteCandidateScore {
  provider_id: string;
  name: string;
  tier: string;
  score: number;
  reason: string;
}

export interface RouteDecision {
  ok: boolean;
  resolved_modality: Modality;
  strategy_used: RoutingStrategy;
  free_only_mode: boolean;
  selected_provider: CloudProviderSpec | null;
  fallback_chain: string[];
  fusion_or_pipeline_steps?: string[];
  scores: RouteCandidateScore[];
  error_code?:
    | 'LOCAL_ENDPOINT_BLOCKED'
    | 'VOXCPM2_ENDPOINT_UNSET'
    | 'FREE_QUOTA_EXHAUSTED'
    | 'NO_ELIGIBLE_PROVIDER';
  error_message?: string;
  earliest_reset_at?: string | null;
}

const VIRTUAL_COMBO_MODALITY: Record<string, { modality: Modality; defaultStrategy: RoutingStrategy }> = {
  'auto/fast': { modality: 'text', defaultStrategy: 'auto' },
  'auto/coding': { modality: 'code', defaultStrategy: 'cache-optimized' },
  'auto/reasoning': { modality: 'text', defaultStrategy: 'context-optimized' },
  'auto/vision': { modality: 'vision', defaultStrategy: 'priority' },
  'auto/image': { modality: 'image', defaultStrategy: 'quota-weighted' },
  'auto/video': { modality: 'video', defaultStrategy: 'headroom' },
  'auto/tts': { modality: 'tts', defaultStrategy: 'priority' },
  'auto/stt': { modality: 'stt', defaultStrategy: 'least-used' },
};

export class OmniRouteEngine {
  private readonly storage: QyroStorage;
  private readonly catalog: ProviderCatalogFile;
  private readonly providers: Map<string, CloudProviderSpec>;
  private roundRobinCursor = 0;
  private lastKnownGoodByModality = new Map<Modality, string>();

  constructor(storage: QyroStorage, catalogPath?: string) {
    this.storage = storage;
    const resolvedPath =
      catalogPath ?? path.resolve(process.cwd(), 'configs/providers/cloud-providers.json');
    this.catalog = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as ProviderCatalogFile;
    this.providers = new Map();

    for (const p of this.catalog.providers) {
      // Compile-time & load-time guard: never allow any non-UNSET local endpoint in catalog
      if (p.endpoint !== UNSET_SENTINEL) {
        const check = validateCloudEndpoint(p.endpoint, p.id);
        if (!check.allowed) {
          throw new Error(
            `Catalog policy violation for provider "${p.id}": ${check.reason}`
          );
        }
      }

      const futureReset = new Date(Date.now() + (15 + p.priority) * 60_000).toISOString();
      this.providers.set(p.id, {
        ...p,
        remaining_quota: p.remaining_quota ?? Math.floor(p.quota_limit * 0.85),
        reset_at: p.reset_at ?? futureReset,
        healthy: p.healthy ?? true,
        usage_count: p.usage_count ?? 0,
      });
    }
  }

  getCatalogSummary() {
    return {
      schema_version: this.catalog.schema_version,
      policy: this.catalog.policy,
      totals: this.catalog.catalog_totals,
      strategies: [...ROUTING_STRATEGIES],
      virtual_combos: Object.keys(VIRTUAL_COMBO_MODALITY),
      providers: Array.from(this.providers.values()),
    };
  }

  /**
   * Configure VoxCPM2 Remote Cloud endpoint with strict Anti-Local-Model Guard enforcement.
   */
  configureVoxCpm2Endpoint(remoteUrl: string): {
    ok: boolean;
    message: string;
    endpoint: string;
  } {
    const check = validateCloudEndpoint(remoteUrl, 'voxcpm2-cloud');
    if (!check.allowed) {
      return {
        ok: false,
        message: check.reason,
        endpoint: UNSET_SENTINEL,
      };
    }
    const vox = this.providers.get('voxcpm2-cloud');
    if (vox) {
      vox.endpoint = check.normalizedUrl!;
    }
    return {
      ok: true,
      message: `VoxCPM2 Remote Cloud configured at ${check.normalizedUrl}`,
      endpoint: check.normalizedUrl!,
    };
  }

  private resolveTarget(target: string): {
    modality: Modality;
    explicitProviderId: string | null;
    defaultStrategy: RoutingStrategy;
  } {
    const clean = target.trim().toLowerCase();
    if (VIRTUAL_COMBO_MODALITY[clean]) {
      return {
        modality: VIRTUAL_COMBO_MODALITY[clean].modality,
        explicitProviderId: null,
        defaultStrategy: VIRTUAL_COMBO_MODALITY[clean].defaultStrategy,
      };
    }

    // Check persisted user combo in SQLite
    const persisted = this.storage.db
      .prepare(`SELECT strategy, modality FROM combos WHERE lower(name) = ?`)
      .get(clean) as { strategy: RoutingStrategy; modality: Modality } | undefined;

    if (persisted) {
      return {
        modality: persisted.modality,
        explicitProviderId: null,
        defaultStrategy: persisted.strategy,
      };
    }

    // Direct provider/model target
    const [providerPart] = clean.split('/');
    if (this.providers.has(providerPart)) {
      const p = this.providers.get(providerPart)!;
      return {
        modality: p.modalities[0] ?? 'text',
        explicitProviderId: p.id,
        defaultStrategy: 'priority',
      };
    }

    return {
      modality: 'text',
      explicitProviderId: null,
      defaultStrategy: 'auto',
    };
  }

  private computeAuto16FactorScore(p: CloudProviderSpec, requiredContext: number): number {
    const remaining = p.remaining_quota ?? 0;
    const headroomRatio = p.quota_limit > 0 ? remaining / p.quota_limit : 0;
    const latencyScore = Math.max(0, 1 - p.avg_latency_ms / 1500);
    const contextFit = p.context_window >= requiredContext ? 1 : 0.2;
    const costScore = p.cost_per_1m_usd === 0 ? 1 : Math.max(0.1, 1 - p.cost_per_1m_usd / 10);
    const priorityScore = Math.max(0, 1 - p.priority / 100);
    const healthScore = p.healthy ? 1 : 0;
    const freeBonus = p.tier === 'free' || p.tier === 'oauth_sub' ? 0.15 : 0;
    const cacheScore = p.cache_hit_rate;
    const usageBalance = 1 / (1 + (p.usage_count ?? 0) * 0.05);

    const raw =
      headroomRatio * 0.18 +
      latencyScore * 0.18 +
      contextFit * 0.14 +
      costScore * 0.14 +
      priorityScore * 0.10 +
      healthScore * 0.10 +
      cacheScore * 0.08 +
      usageBalance * 0.08 +
      freeBonus;

    return Number((raw * 100).toFixed(2));
  }

  private selectByStrategy(
    candidates: CloudProviderSpec[],
    strategy: RoutingStrategy,
    modality: Modality,
    requiredContext: number
  ): {
    ordered: CloudProviderSpec[];
    scores: RouteCandidateScore[];
    fusionOrPipeline?: string[];
  } {
    const list = [...candidates];
    let ordered: CloudProviderSpec[] = list;
    let fusionOrPipeline: string[] | undefined;

    switch (strategy) {
      case 'priority':
        ordered = list.sort((a, b) => a.priority - b.priority);
        break;
      case 'weighted':
        ordered = list.sort((a, b) => b.weight - a.weight || a.priority - b.priority);
        break;
      case 'round-robin': {
        const sorted = list.sort((a, b) => a.id.localeCompare(b.id));
        const idx = this.roundRobinCursor % sorted.length;
        this.roundRobinCursor += 1;
        ordered = [...sorted.slice(idx), ...sorted.slice(0, idx)];
        break;
      }
      case 'context-relay':
        ordered = list.sort(
          (a, b) =>
            Math.abs(a.context_window - requiredContext) -
            Math.abs(b.context_window - requiredContext)
        );
        break;
      case 'fill-first':
        ordered = list.sort(
          (a, b) => (a.remaining_quota ?? 0) - (b.remaining_quota ?? 0) || a.priority - b.priority
        );
        break;
      case 'p2c': {
        // Power of Two Choices: pick best latency/headroom between first two highest-priority choices
        const sorted = list.sort((a, b) => a.priority - b.priority);
        if (sorted.length >= 2) {
          const [first, second, ...rest] = sorted;
          const firstScore = (first.remaining_quota ?? 0) / Math.max(1, first.avg_latency_ms);
          const secondScore = (second.remaining_quota ?? 0) / Math.max(1, second.avg_latency_ms);
          ordered = secondScore > firstScore ? [second, first, ...rest] : [first, second, ...rest];
        } else {
          ordered = sorted;
        }
        break;
      }
      case 'random':
      case 'strict-random': {
        const copy = [...list];
        for (let i = copy.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        ordered = copy;
        break;
      }
      case 'least-used':
        ordered = list.sort(
          (a, b) => (a.usage_count ?? 0) - (b.usage_count ?? 0) || a.avg_latency_ms - b.avg_latency_ms
        );
        break;
      case 'cost-optimized':
        ordered = list.sort(
          (a, b) => a.cost_per_1m_usd - b.cost_per_1m_usd || a.avg_latency_ms - b.avg_latency_ms
        );
        break;
      case 'reset-aware':
      case 'reset-window':
        ordered = list.sort((a, b) => {
          const ta = a.reset_at ? Date.parse(a.reset_at) : Number.MAX_SAFE_INTEGER;
          const tb = b.reset_at ? Date.parse(b.reset_at) : Number.MAX_SAFE_INTEGER;
          return ta - tb;
        });
        break;
      case 'headroom':
        ordered = list.sort(
          (a, b) =>
            (b.remaining_quota ?? 0) / Math.max(1, b.quota_limit) -
            (a.remaining_quota ?? 0) / Math.max(1, a.quota_limit)
        );
        break;
      case 'quota-weighted':
        ordered = list.sort(
          (a, b) =>
            (b.remaining_quota ?? 0) * b.weight - (a.remaining_quota ?? 0) * a.weight
        );
        break;
      case 'lkgp': {
        const lkg = this.lastKnownGoodByModality.get(modality);
        ordered = list.sort((a, b) => {
          if (a.id === lkg) return -1;
          if (b.id === lkg) return 1;
          return a.priority - b.priority;
        });
        break;
      }
      case 'context-optimized':
        ordered = list.sort((a, b) => b.context_window - a.context_window);
        break;
      case 'cache-optimized':
        ordered = list.sort((a, b) => b.cache_hit_rate - a.cache_hit_rate);
        break;
      case 'fusion':
        ordered = list.sort(
          (a, b) =>
            this.computeAuto16FactorScore(b, requiredContext) -
            this.computeAuto16FactorScore(a, requiredContext)
        );
        fusionOrPipeline = ordered.slice(0, Math.min(3, ordered.length)).map((p) => p.id);
        break;
      case 'pipeline':
        ordered = list.sort((a, b) => a.avg_latency_ms - b.avg_latency_ms);
        fusionOrPipeline = ordered.slice(0, Math.min(2, ordered.length)).map((p) => p.id);
        break;
      case 'auto':
      default:
        ordered = list.sort(
          (a, b) =>
            this.computeAuto16FactorScore(b, requiredContext) -
            this.computeAuto16FactorScore(a, requiredContext)
        );
        break;
    }

    const scores: RouteCandidateScore[] = ordered.map((p, idx) => ({
      provider_id: p.id,
      name: p.name,
      tier: p.tier,
      score: this.computeAuto16FactorScore(p, requiredContext),
      reason:
        idx === 0
          ? `Selected by "${strategy}" (latency ${p.avg_latency_ms}ms, headroom ${p.remaining_quota}/${p.quota_limit}, cache ${Math.round(p.cache_hit_rate * 100)}%)`
          : `Fallback #${idx} (${p.tier}, ${p.avg_latency_ms}ms)`,
    }));

    return { ordered, scores, fusionOrPipeline };
  }

  route(req: RouteRequest): RouteDecision {
    const prefs = this.storage.getPreferences();
    const freeOnly = req.freeOnlyOverride ?? prefs.free_only_mode;
    const requiredContext = req.requiredContextTokens ?? 8192;
    const { modality, explicitProviderId, defaultStrategy } = this.resolveTarget(req.target);
    const strategy: RoutingStrategy = req.strategy ?? defaultStrategy;

    // Explicit VoxCPM2 remote endpoint override validation
    if (explicitProviderId === 'voxcpm2-cloud') {
      const targetEndpoint = req.voxcpmRemoteEndpoint ?? this.providers.get('voxcpm2-cloud')?.endpoint;
      const check = validateCloudEndpoint(targetEndpoint, 'voxcpm2-cloud');
      if (!check.allowed) {
        return {
          ok: false,
          resolved_modality: 'tts',
          strategy_used: strategy,
          free_only_mode: freeOnly,
          selected_provider: null,
          fallback_chain: [],
          scores: [],
          error_code: check.code === 'UNSET_ENDPOINT' ? 'VOXCPM2_ENDPOINT_UNSET' : 'LOCAL_ENDPOINT_BLOCKED',
          error_message: check.reason,
        };
      }
    }

    let pool = Array.from(this.providers.values()).filter((p) => {
      if (explicitProviderId && p.id !== explicitProviderId) return false;
      if (!p.modalities.includes(modality)) return false;
      if (!p.healthy) return false;
      // Validate endpoint (skip UNSET providers in automatic combos)
      const check = validateCloudEndpoint(p.endpoint, p.id);
      if (!check.allowed) return false;
      return true;
    });

    // Enforce Free-Tier-Only Mode strictly
    if (freeOnly) {
      pool = pool.filter((p) => p.tier === 'free' || p.tier === 'oauth_sub');
    }

    // Check quota availability (or simulated exhaustion test)
    const withQuota = req.simulateFreeExhausted
      ? pool.filter((p) => p.tier === 'paid' && (p.remaining_quota ?? 0) > 0)
      : pool.filter((p) => (p.remaining_quota ?? 0) > 0);

    if (withQuota.length === 0) {
      const resets = pool
        .map((p) => p.reset_at)
        .filter((r): r is string => Boolean(r))
        .sort();
      const earliestReset = resets[0] ?? new Date(Date.now() + 900_000).toISOString();

      return {
        ok: false,
        resolved_modality: modality,
        strategy_used: strategy,
        free_only_mode: freeOnly,
        selected_provider: null,
        fallback_chain: [],
        scores: [],
        error_code: freeOnly ? 'FREE_QUOTA_EXHAUSTED' : 'NO_ELIGIBLE_PROVIDER',
        earliest_reset_at: earliestReset,
        error_message: freeOnly
          ? `Free-tier quota exhausted for modality "${modality}". Earliest reset at ${earliestReset}. Free-Tier-Only Mode prevented silent paid fallback.`
          : `No eligible cloud provider found for target "${req.target}".`,
      };
    }

    const { ordered, scores, fusionOrPipeline } = this.selectByStrategy(
      withQuota,
      strategy,
      modality,
      requiredContext
    );

    const winner = ordered[0];
    winner.usage_count = (winner.usage_count ?? 0) + 1;
    this.lastKnownGoodByModality.set(modality, winner.id);

    this.storage.appendEvent('router.decision', null, {
      target: req.target,
      modality,
      strategy,
      free_only_mode: freeOnly,
      selected_provider: winner.id,
      model: winner.default_model,
      tier: winner.tier,
    });

    return {
      ok: true,
      resolved_modality: modality,
      strategy_used: strategy,
      free_only_mode: freeOnly,
      selected_provider: winner,
      fallback_chain: ordered.slice(1, 4).map((p) => p.id),
      fusion_or_pipeline_steps: fusionOrPipeline,
      scores,
    };
  }
}
