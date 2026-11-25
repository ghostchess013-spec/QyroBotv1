/**
 * qyro-router/compression — Stacked Compression (RTK -> Caveman) + Caveman Language Guard
 * + verify-rtk Gate (PRD v1.7.0 §6 & §8.2)
 *
 * Guarantees:
 * 1. Stage 1 RTK strips deterministic machine noise (cargo/git/npm/debug logs)
 * 2. Stage 2 Caveman compresses prose at 3 intensities (light/medium/aggressive)
 * 3. Caveman Language Guard NEVER translates Indonesian (id-ID) to English and locks all negations
 * 4. Strict bypass for system_prompt, active_skill_md, and reviewer_rules blocks
 * 5. Secret redaction pass ensures credentials never survive compressed telemetry
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { CavemanIntensity } from '../types';

export interface RtkFilterSpec {
  id: string;
  name: string;
  strip_line_patterns: string[];
  keep_line_patterns: string[];
  tests: Array<{
    name: string;
    input: string;
    must_contain: string[];
    must_not_contain: string[];
  }>;
}

export interface RtkFilterRegistry {
  schema_version: string;
  filters: RtkFilterSpec[];
}

export type ProtectedBlockRole = 'user_prose' | 'tool_output' | 'system_prompt' | 'active_skill_md' | 'reviewer_rules';

export interface CompressionInput {
  text: string;
  role?: ProtectedBlockRole;
  enableRtk?: boolean;
  cavemanIntensity?: CavemanIntensity | 'off';
  redactSecretsFn?: (s: string) => { redacted: string; matches_removed: number };
}

export interface CompressionResult {
  output: string;
  detected_language: 'id-ID' | 'en-US' | 'mixed';
  bypassed: boolean;
  bypass_reason: string | null;
  rtk_lines_removed: number;
  caveman_intensity: CavemanIntensity | 'off';
  original_chars: number;
  compressed_chars: number;
  original_tokens_est: number;
  compressed_tokens_est: number;
  savings_pct: number;
  preserved_negations: string[];
  secrets_redacted: number;
}

const INDONESIAN_MARKERS = [
  'yang', 'dan', 'untuk', 'dengan', 'tidak', 'jangan', 'bukan', 'belum', 'kecuali',
  'hanya', 'wajib', 'dilarang', 'adalah', 'dalam', 'pada', 'dari', 'akan', 'tetapi',
  'karena', 'bahwa', 'semua', 'segera', 'mohon', 'tolong', 'silakan', 'perlu', 'harus',
];

export const LOCKED_NEGATIONS_ID = [
  'tidak',
  'jangan',
  'bukan',
  'belum',
  'kecuali',
  'hanya',
  'wajib',
  'dilarang',
  'tanpa',
  'harus',
] as const;

export const LOCKED_NEGATIONS_EN = [
  'not',
  'never',
  'no',
  'must',
  'only',
  'except',
  'without',
  'forbidden',
  'cannot',
  "don't",
  "do not",
] as const;

// Filler words safe to prune in Indonesian prose WITHOUT altering negations or translating to English
const ID_LIGHT_FILLERS = /\b(sebenarnya|pada dasarnya|sebagai informasi|mohon dicatat bahwa|perlu diketahui bahwa|secara umum)\b/gi;
const ID_MEDIUM_FILLERS = /\b(sebenarnya|pada dasarnya|sebagai informasi|mohon dicatat bahwa|perlu diketahui bahwa|secara umum|yakni|yaitu|tersebut|hal ini|oleh karena itu|dengan demikian|sehubungan dengan hal tersebut|mohon bantuan untuk|tolong bantu saya untuk|saya ingin meminta Anda untuk)\b/gi;
const ID_AGGRESSIVE_FILLERS = /\b(sebenarnya|pada dasarnya|sebagai informasi|mohon dicatat bahwa|perlu diketahui bahwa|secara umum|yakni|yaitu|tersebut|hal ini|oleh karena itu|dengan demikian|sehubungan dengan hal tersebut|mohon bantuan untuk|tolong bantu saya untuk|saya ingin meminta Anda untuk|silakan|mohon|tolong|sangat|cukup|agak|memang|tentu saja|seperti yang kita ketahui|dalam rangka)\b/gi;

// Filler words safe to prune in English prose without touching negations
const EN_LIGHT_FILLERS = /\b(basically|actually|please note that|as you can see|in order to|for your information)\b/gi;
const EN_MEDIUM_FILLERS = /\b(basically|actually|please note that|as you can see|in order to|for your information|furthermore|moreover|additionally|it is important to note that|I would like you to|could you please)\b/gi;
const EN_AGGRESSIVE_FILLERS = /\b(basically|actually|please note that|as you can see|in order to|for your information|furthermore|moreover|additionally|it is important to note that|I would like you to|could you please|kindly|really|very|quite|simply|just|literally|of course)\b/gi;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function detectLanguage(text: string): 'id-ID' | 'en-US' | 'mixed' {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0) return 'en-US';
  let idHits = 0;
  for (const w of words) {
    if (INDONESIAN_MARKERS.includes(w)) idHits += 1;
  }
  const ratio = idHits / words.length;
  if (ratio >= 0.12 || idHits >= 3) {
    const enCommon = words.filter((w) => ['the', 'and', 'with', 'should', 'please', 'this'].includes(w)).length;
    if (enCommon >= 3 && idHits >= 3) return 'mixed';
    return 'id-ID';
  }
  return 'en-US';
}

export function extractPresentNegations(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const word of [...LOCKED_NEGATIONS_ID, ...LOCKED_NEGATIONS_EN]) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) {
      found.push(word);
    }
  }
  return found;
}

export function loadRtkFilters(filterPath?: string): {
  registry: RtkFilterRegistry;
  sha256: string;
} {
  const filePath =
    filterPath ?? path.resolve(process.cwd(), 'configs/rtk-filters/default-filters.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const sha256 = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  return {
    registry: JSON.parse(raw) as RtkFilterRegistry,
    sha256,
  };
}

export function applyRtkStage(
  text: string,
  filters: RtkFilterSpec[]
): { output: string; linesRemoved: number } {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let removed = 0;

  const compiled = filters.map((f) => ({
    strip: f.strip_line_patterns.map((p) => new RegExp(p)),
    keep: f.keep_line_patterns.map((p) => new RegExp(p)),
  }));

  let lastLine = '';
  let repeatCount = 0;

  for (const line of lines) {
    let forceKeep = false;
    let shouldStrip = false;

    for (const f of compiled) {
      if (f.keep.some((re) => re.test(line))) {
        forceKeep = true;
        break;
      }
      if (f.strip.some((re) => re.test(line))) {
        shouldStrip = true;
      }
    }

    if (!forceKeep && shouldStrip) {
      removed += 1;
      continue;
    }

    // Collapse identical consecutive lines (e.g. repetitive stack/log frames)
    const trimmed = line.trimEnd();
    if (trimmed.length > 0 && trimmed === lastLine) {
      repeatCount += 1;
      removed += 1;
      continue;
    } else {
      if (repeatCount > 0) {
        kept.push(`[... repeated ${repeatCount}x ...]`);
        repeatCount = 0;
      }
      lastLine = trimmed;
      kept.push(trimmed);
    }
  }

  if (repeatCount > 0) {
    kept.push(`[... repeated ${repeatCount}x ...]`);
  }

  return {
    output: kept.join('\n').trim(),
    linesRemoved: removed,
  };
}

export function applyCavemanStage(
  text: string,
  intensity: CavemanIntensity,
  lang: 'id-ID' | 'en-US' | 'mixed'
): string {
  // Never alter code blocks inside triple backticks
  const segments = text.split(/(```[\s\S]*?```)/g);
  const processed = segments.map((seg) => {
    if (seg.startsWith('```') && seg.endsWith('```')) {
      return seg;
    }

    let out = seg;
    if (lang === 'id-ID' || lang === 'mixed') {
      const pattern =
        intensity === 'light'
          ? ID_LIGHT_FILLERS
          : intensity === 'medium'
            ? ID_MEDIUM_FILLERS
            : ID_AGGRESSIVE_FILLERS;
      out = out.replace(pattern, ' ');
    }
    if (lang === 'en-US' || lang === 'mixed') {
      const pattern =
        intensity === 'light'
          ? EN_LIGHT_FILLERS
          : intensity === 'medium'
            ? EN_MEDIUM_FILLERS
            : EN_AGGRESSIVE_FILLERS;
      out = out.replace(pattern, ' ');
    }

    if (intensity === 'aggressive') {
      // Remove redundant politeness tails while never touching negations
      out = out.replace(/\b(terima kasih banyak sebelumnya|thank you very much in advance)\b/gi, '');
    }

    // Normalize extra horizontal whitespace while preserving line breaks
    out = out
      .split('\n')
      .map((l) => l.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim())
      .filter((l, idx, arr) => l.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
      .join('\n');

    return out.trim();
  });

  return processed.join('\n').trim();
}

export function compressContext(
  input: CompressionInput,
  filters?: RtkFilterSpec[]
): CompressionResult {
  const role: ProtectedBlockRole = input.role ?? 'user_prose';
  const originalChars = input.text.length;
  const originalTokens = estimateTokens(input.text);
  const detectedLang = detectLanguage(input.text);
  const originalNegations = extractPresentNegations(input.text);

  // Strict PRD bypass for System Prompt, Active SKILL.md, and Reviewer Rules
  if (
    role === 'system_prompt' ||
    role === 'active_skill_md' ||
    role === 'reviewer_rules'
  ) {
    return {
      output: input.text,
      detected_language: detectedLang,
      bypassed: true,
      bypass_reason: `Protected block "${role}" is exempt from RTK/Caveman compression.`,
      rtk_lines_removed: 0,
      caveman_intensity: input.cavemanIntensity ?? 'off',
      original_chars: originalChars,
      compressed_chars: originalChars,
      original_tokens_est: originalTokens,
      compressed_tokens_est: originalTokens,
      savings_pct: 0,
      preserved_negations: originalNegations,
      secrets_redacted: 0,
    };
  }

  let current = input.text;
  let secretsRedacted = 0;

  if (input.redactSecretsFn) {
    const red = input.redactSecretsFn(current);
    current = red.redacted;
    secretsRedacted = red.matches_removed;
  }

  // Stage 1: RTK deterministic filter
  let rtkLinesRemoved = 0;
  if (input.enableRtk !== false) {
    const activeFilters = filters ?? loadRtkFilters().registry.filters;
    const rtkRes = applyRtkStage(current, activeFilters);
    current = rtkRes.output;
    rtkLinesRemoved = rtkRes.linesRemoved;
  }

  // Stage 2: Caveman prose compression with Language Guard
  const intensity = input.cavemanIntensity ?? 'medium';
  if (intensity !== 'off') {
    const candidate = applyCavemanStage(current, intensity, detectedLang);
    // Safety verification: every locked negation word present before Caveman MUST remain present
    const negationsBefore = extractPresentNegations(current);
    const negationsAfter = extractPresentNegations(candidate);
    const allPreserved = negationsBefore.every((neg) => negationsAfter.includes(neg));
    if (allPreserved) {
      current = candidate;
    }
  }

  const compressedChars = current.length;
  const compressedTokens = estimateTokens(current);
  const savingsPct =
    originalChars > 0
      ? Math.max(0, Number((((originalChars - compressedChars) / originalChars) * 100).toFixed(1)))
      : 0;

  return {
    output: current,
    detected_language: detectedLang,
    bypassed: false,
    bypass_reason: null,
    rtk_lines_removed: rtkLinesRemoved,
    caveman_intensity: intensity,
    original_chars: originalChars,
    compressed_chars: compressedChars,
    original_tokens_est: originalTokens,
    compressed_tokens_est: compressedTokens,
    savings_pct: savingsPct,
    preserved_negations: extractPresentNegations(current),
    secrets_redacted: secretsRedacted,
  };
}

export interface VerifyRtkCheckResult {
  name: string;
  passed: boolean;
  details: string;
}

export interface VerifyRtkReport {
  passed: boolean;
  filter_registry_sha256: string;
  total_checks: number;
  passed_checks: number;
  checks: VerifyRtkCheckResult[];
}

/**
 * Automated verify-rtk gate (PRD v1.7.0 §8.2):
 * Tests all declarative RTK filter test cases, all 3 Caveman intensities,
 * Indonesian negation preservation, System/SKILL.md bypass, and secret redaction.
 */
export function runVerifyRtkGate(
  redactSecretsFn?: (s: string) => { redacted: string; matches_removed: number }
): VerifyRtkReport {
  const { registry, sha256 } = loadRtkFilters();
  const checks: VerifyRtkCheckResult[] = [];

  // 1. Declarative RTK filter unit cases
  for (const filter of registry.filters) {
    for (const tc of filter.tests) {
      const res = applyRtkStage(tc.input, [filter]);
      const missingRequired = tc.must_contain.filter((m) => !res.output.includes(m));
      const leakedForbidden = tc.must_not_contain.filter((m) => res.output.includes(m));
      const passed = missingRequired.length === 0 && leakedForbidden.length === 0;
      checks.push({
        name: `rtk:${filter.id}:${tc.name}`,
        passed,
        details: passed
          ? `Removed ${res.linesRemoved} noisy lines while keeping all critical lines.`
          : `Missing: [${missingRequired.join(', ')}], Leaked: [${leakedForbidden.join(', ')}]`,
      });
    }
  }

  // 2. Indonesian Caveman Language Guard across all 3 intensities
  const idSample =
    'Mohon dicatat bahwa sebenarnya sistem ini tidak boleh menjalankan model lokal, jangan pernah kirim kunci API, bukan untuk produksi tanpa izin, belum terverifikasi, kecuali endpoint HTTPS, hanya free tier, wajib aktif, dan dilarang bocor.';
  const requiredIdNegations = ['tidak', 'jangan', 'bukan', 'belum', 'kecuali', 'hanya', 'wajib', 'dilarang'];

  for (const intensity of ['light', 'medium', 'aggressive'] as const) {
    const res = compressContext(
      { text: idSample, role: 'user_prose', cavemanIntensity: intensity },
      registry.filters
    );
    const missing = requiredIdNegations.filter((w) => !res.output.toLowerCase().includes(w));
    const stayedIndonesian = res.detected_language === 'id-ID';
    const shrank = res.compressed_chars < res.original_chars;
    const passed = missing.length === 0 && stayedIndonesian && shrank;
    checks.push({
      name: `caveman:id-ID:${intensity}`,
      passed,
      details: passed
        ? `Saved ${res.savings_pct}% while preserving all ${requiredIdNegations.length} Indonesian negation/constraint tokens.`
        : `Failed (missing=${missing.join(',')}, lang=${res.detected_language}, shrank=${shrank})`,
    });
  }

  // 3. Bypass guard for system_prompt & active_skill_md
  const skillSample = 'Sebenarnya pada dasarnya instruksi SKILL.md tidak boleh dipotong oleh Caveman.';
  for (const role of ['system_prompt', 'active_skill_md', 'reviewer_rules'] as const) {
    const res = compressContext(
      { text: skillSample, role, cavemanIntensity: 'aggressive' },
      registry.filters
    );
    const passed = res.bypassed && res.output === skillSample;
    checks.push({
      name: `bypass:${role}`,
      passed,
      details: passed
        ? `Byte-identical preservation enforced for ${role}.`
        : `Protected block ${role} was unexpectedly altered!`,
    });
  }

  // 4. Secret redaction gate
  const secretInput = 'ERROR request failed with token sk-live-secret1234567890abcdef in header';
  const defaultRedactor =
    redactSecretsFn ??
    ((s: string) => ({
      redacted: s.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED:API_KEY]'),
      matches_removed: s.includes('sk-') ? 1 : 0,
    }));
  const redRes = compressContext(
    {
      text: secretInput,
      role: 'tool_output',
      cavemanIntensity: 'light',
      redactSecretsFn: defaultRedactor,
    },
    registry.filters
  );
  const secretPassed =
    !redRes.output.includes('sk-live-secret1234567890abcdef') && redRes.secrets_redacted >= 1;
  checks.push({
    name: 'security:secret_redaction',
    passed: secretPassed,
    details: secretPassed
      ? `Redacted ${redRes.secrets_redacted} credential token(s) before output.`
      : 'Credential token leaked through compression pipeline!',
  });

  const passedCount = checks.filter((c) => c.passed).length;
  return {
    passed: passedCount === checks.length,
    filter_registry_sha256: sha256,
    total_checks: checks.length,
    passed_checks: passedCount,
    checks,
  };
}
