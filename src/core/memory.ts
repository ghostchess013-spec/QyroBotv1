/**
 * qyro-memory — Native Observer Memory Engine (claude-mem architecture)
 * - Strips <private>...</private> blocks BEFORE persistence and FTS5 indexing
 * - 3-step Progressive Disclosure mem-search: index -> timeline -> details
 */

import crypto from 'node:crypto';
import type { QyroStorage } from './storage';

export type ObservationKind = 'observation' | 'decision' | 'preference' | 'artifact' | 'tool_run';

export interface PrivateFilterResult {
  sanitized: string;
  redactedCount: number;
}

export function stripPrivateTags(text: string): PrivateFilterResult {
  let redactedCount = 0;
  const sanitized = text.replace(/<private\b[^>]*>[\s\S]*?<\/private>/gi, () => {
    redactedCount += 1;
    return '[private-redacted]';
  });
  return { sanitized, redactedCount };
}

export interface MemoryObservation {
  id: string;
  session_id: string;
  bot_id: string | null;
  kind: ObservationKind;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  private_blocks_redacted: number;
  pinned: boolean;
  created_at: string;
}

export interface MemSearchIndexRow {
  id: string;
  session_id: string;
  kind: ObservationKind;
  title: string;
  summary: string;
  tags: string[];
  estimated_tokens: number;
  created_at: string;
}

export class QyroMemory {
  private readonly storage: QyroStorage;

  constructor(storage: QyroStorage) {
    this.storage = storage;
    this.ensureDefaultSession();
  }

  private ensureDefaultSession(): void {
    const existing = this.storage.db
      .prepare(`SELECT id FROM memory_sessions LIMIT 1`)
      .get() as { id: string } | undefined;

    if (!existing) {
      const sessionId = 'mem-sess-phase1-init';
      this.storage.db
        .prepare(
          `INSERT INTO memory_sessions (id, bot_id, title) VALUES (?, ?, ?)`
        )
        .run(
          sessionId,
          'bot-chief-of-staff',
          'Inisialisasi Inti QyroBot Fase 1'
        );

      this.recordObservation({
        session_id: sessionId,
        bot_id: 'bot-chief-of-staff',
        kind: 'decision',
        title: 'Kebijakan Free-Tier-Only & Blokir Model Lokal',
        summary: 'Semua routing AI wajib melewati OmniRoute Cloud dengan Free-Tier-Only aktif default.',
        body: 'Keputusan arsitektur Fase 1: endpoint localhost, 127.0.0.1, ::1, dan port inferensi lokal ditolak keras oleh Anti-Local-Model Guard. VoxCPM2 hanya berjalan melalui server remote vLLM-Omni HTTPS.',
        tags: ['architecture', 'omniroute', 'free-tier', 'security'],
      });

      this.recordObservation({
        session_id: sessionId,
        bot_id: 'bot-systems-engineer',
        kind: 'observation',
        title: 'Kompresi RTK + Caveman Bahasa Indonesia',
        summary: 'Caveman Language Guard mempertahankan bahasa Indonesia dan seluruh kata negasi.',
        body: 'Saat memampatkan konteks berbahasa Indonesia, Caveman tidak menerjemahkan teks ke bahasa Inggris serta mengunci kata tidak, jangan, bukan, belum, kecuali, hanya, wajib, dan dilarang.',
        tags: ['compression', 'rtk', 'caveman', 'id-ID'],
      });
    }
  }

  createSession(title: string, botId: string | null = 'bot-chief-of-staff'): {
    id: string;
    title: string;
    bot_id: string | null;
    started_at: string;
  } {
    const id = `mem-sess-${crypto.randomUUID().slice(0, 8)}`;
    const startedAt = new Date().toISOString();
    this.storage.db
      .prepare(
        `INSERT INTO memory_sessions (id, bot_id, title, started_at) VALUES (?, ?, ?, ?)`
      )
      .run(id, botId, title.trim() || 'Untitled Session', startedAt);
    return { id, title, bot_id: botId, started_at: startedAt };
  }

  recordObservation(params: {
    session_id?: string;
    bot_id?: string | null;
    kind?: ObservationKind;
    title: string;
    summary?: string;
    body: string;
    tags?: string[];
    pinned?: boolean;
  }): MemoryObservation {
    let sessionId = params.session_id;
    if (!sessionId) {
      const latest = this.storage.db
        .prepare(`SELECT id FROM memory_sessions ORDER BY started_at DESC LIMIT 1`)
        .get() as { id: string } | undefined;
      sessionId = latest?.id ?? this.createSession('Sesi Observasi Umum', params.bot_id ?? null).id;
    }

    const titleClean = stripPrivateTags(params.title);
    const bodyClean = stripPrivateTags(params.body);
    const rawSummary =
      params.summary?.trim() ||
      bodyClean.sanitized.replace(/\s+/g, ' ').slice(0, 140);
    const summaryClean = stripPrivateTags(rawSummary);

    const totalRedacted =
      titleClean.redactedCount + bodyClean.redactedCount + summaryClean.redactedCount;

    const id = `obs-${crypto.randomUUID().slice(0, 8)}`;
    const kind: ObservationKind = params.kind ?? 'observation';
    const tags = (params.tags ?? []).map((t) => stripPrivateTags(t.trim()).sanitized).filter(Boolean);
    const createdAt = new Date().toISOString();

    this.storage.db
      .prepare(
        `INSERT INTO memory_observations (
          id, session_id, bot_id, kind, title, summary, body, tags_json, private_blocks_redacted, pinned, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        sessionId,
        params.bot_id ?? 'bot-chief-of-staff',
        kind,
        titleClean.sanitized,
        summaryClean.sanitized,
        bodyClean.sanitized,
        JSON.stringify(tags),
        totalRedacted,
        params.pinned ? 1 : 0,
        createdAt
      );

    this.storage.appendEvent('memory.observation_recorded', params.bot_id ?? null, {
      observation_id: id,
      session_id: sessionId,
      title: titleClean.sanitized,
      private_blocks_redacted: totalRedacted,
    });

    return {
      id,
      session_id: sessionId,
      bot_id: params.bot_id ?? 'bot-chief-of-staff',
      kind,
      title: titleClean.sanitized,
      summary: summaryClean.sanitized,
      body: bodyClean.sanitized,
      tags,
      private_blocks_redacted: totalRedacted,
      pinned: Boolean(params.pinned),
      created_at: createdAt,
    };
  }

  /**
   * Step 1 of 3-step Progressive Disclosure mem-search: Compact FTS5 index
   */
  memSearchIndex(query: string, limit = 10): MemSearchIndexRow[] {
    const cleanQuery = query
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"*`)
      .join(' OR ');

    const safeLimit = Math.min(Math.max(1, limit), 50);

    let rows: Array<Record<string, unknown>>;
    if (!cleanQuery) {
      rows = this.storage.db
        .prepare(
          `SELECT id, session_id, kind, title, summary, body, tags_json, created_at
           FROM memory_observations
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(safeLimit) as Array<Record<string, unknown>>;
    } else {
      rows = this.storage.db
        .prepare(
          `SELECT o.id, o.session_id, o.kind, o.title, o.summary, o.body, o.tags_json, o.created_at
           FROM memory_observations_fts f
           JOIN memory_observations o ON o.id = f.observation_id
           WHERE memory_observations_fts MATCH ?
           ORDER BY bm25(memory_observations_fts) ASC
           LIMIT ?`
        )
        .all(cleanQuery, safeLimit) as Array<Record<string, unknown>>;
    }

    return rows.map((row) => ({
      id: String(row.id),
      session_id: String(row.session_id),
      kind: row.kind as ObservationKind,
      title: String(row.title),
      summary: String(row.summary),
      tags: JSON.parse(String(row.tags_json)) as string[],
      estimated_tokens: Math.max(12, Math.ceil(String(row.body).length / 4)),
      created_at: String(row.created_at),
    }));
  }

  /**
   * Step 2 of 3-step Progressive Disclosure: Chronological timeline around an observation
   */
  memSearchTimeline(observationId: string, windowSize = 3): MemSearchIndexRow[] {
    const anchor = this.storage.db
      .prepare(`SELECT session_id, created_at FROM memory_observations WHERE id = ?`)
      .get(observationId) as { session_id: string; created_at: string } | undefined;

    if (!anchor) return [];

    const before = this.storage.db
      .prepare(
        `SELECT id, session_id, kind, title, summary, body, tags_json, created_at
         FROM memory_observations
         WHERE session_id = ? AND created_at <= ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(anchor.session_id, anchor.created_at, windowSize + 1) as Array<Record<string, unknown>>;

    const after = this.storage.db
      .prepare(
        `SELECT id, session_id, kind, title, summary, body, tags_json, created_at
         FROM memory_observations
         WHERE session_id = ? AND created_at > ?
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .all(anchor.session_id, anchor.created_at, windowSize) as Array<Record<string, unknown>>;

    const combined = [...before.reverse(), ...after];
    return combined.map((row) => ({
      id: String(row.id),
      session_id: String(row.session_id),
      kind: row.kind as ObservationKind,
      title: String(row.title),
      summary: String(row.summary),
      tags: JSON.parse(String(row.tags_json)) as string[],
      estimated_tokens: Math.max(12, Math.ceil(String(row.body).length / 4)),
      created_at: String(row.created_at),
    }));
  }

  /**
   * Step 3 of 3-step Progressive Disclosure: Fetch full body only for selected IDs
   */
  memSearchDetails(ids: string[]): MemoryObservation[] {
    if (ids.length === 0) return [];
    const safeIds = ids.slice(0, 25);
    const placeholders = safeIds.map(() => '?').join(', ');
    const rows = this.storage.db
      .prepare(
        `SELECT * FROM memory_observations WHERE id IN (${placeholders}) ORDER BY created_at ASC`
      )
      .all(...safeIds) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      session_id: String(row.session_id),
      bot_id: row.bot_id ? String(row.bot_id) : null,
      kind: row.kind as ObservationKind,
      title: String(row.title),
      summary: String(row.summary),
      body: String(row.body),
      tags: JSON.parse(String(row.tags_json)) as string[],
      private_blocks_redacted: Number(row.private_blocks_redacted),
      pinned: Number(row.pinned) === 1,
      created_at: String(row.created_at),
    }));
  }

  listSessions(): Array<{ id: string; title: string; observation_count: number; started_at: string }> {
    const rows = this.storage.db
      .prepare(
        `SELECT s.id, s.title, s.started_at, COUNT(o.id) AS observation_count
         FROM memory_sessions s
         LEFT JOIN memory_observations o ON o.session_id = s.id
         GROUP BY s.id
         ORDER BY s.started_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      observation_count: Number(r.observation_count),
      started_at: String(r.started_at),
    }));
  }
}
