/**
 * qyro-scheduler — Cron (>= 5 min) + Natural Language Schedule Parser (id-ID / en-US, WIB/WITA/WIT)
 * + HMAC-SHA256 Event Triggers (PRD v1.7.0 §6 & §9.3)
 */

import crypto from 'node:crypto';
import type { QyroStorage } from './storage';
import { resolveTimezone } from './i18n';

export type RoutineTriggerType =
  | 'cron'
  | 'webhook_hmac'
  | 'slack'
  | 'github'
  | 'linear'
  | 'sentry'
  | 'pagerduty'
  | 'email'
  | 'x';

export interface ParsedNaturalSchedule {
  ok: boolean;
  cron_expr: string | null;
  timezone: 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';
  tz_label: 'WIB' | 'WITA' | 'WIT';
  min_interval_minutes: number | null;
  human_summary: string;
  error?: string;
}

export interface RoutineRecord {
  id: string;
  bot_id: string;
  name: string;
  trigger_type: RoutineTriggerType;
  schedule_expr: string;
  timezone: string;
  prompt: string;
  enabled: boolean;
  max_runs_per_hour: number;
  last_run_at: string | null;
  created_at: string;
}

export interface RoutineRunRecord {
  id: string;
  routine_id: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  output_summary: string;
  started_at: string;
  finished_at: string | null;
}

export const ROUTINE_LIMITS = {
  MAX_ROUTINES_PER_BOT: 50,
  MAX_RUN_HISTORY_PER_ROUTINE: 20,
  MAX_GLOBAL_RUNS_PER_HOUR: 300,
  MAX_ROUTINE_RUNS_PER_HOUR: 200,
  MIN_CRON_CADENCE_MINUTES: 5,
} as const;

const DAY_MAP: Record<string, { num: number; id: string; en: string }> = {
  minggu: { num: 0, id: 'Minggu', en: 'Sunday' },
  sunday: { num: 0, id: 'Minggu', en: 'Sunday' },
  sun: { num: 0, id: 'Minggu', en: 'Sunday' },
  senin: { num: 1, id: 'Senin', en: 'Monday' },
  monday: { num: 1, id: 'Senin', en: 'Monday' },
  mon: { num: 1, id: 'Senin', en: 'Monday' },
  selasa: { num: 2, id: 'Selasa', en: 'Tuesday' },
  tuesday: { num: 2, id: 'Selasa', en: 'Tuesday' },
  tue: { num: 2, id: 'Selasa', en: 'Tuesday' },
  rabu: { num: 3, id: 'Rabu', en: 'Wednesday' },
  wednesday: { num: 3, id: 'Rabu', en: 'Wednesday' },
  wed: { num: 3, id: 'Rabu', en: 'Wednesday' },
  kamis: { num: 4, id: 'Kamis', en: 'Thursday' },
  thursday: { num: 4, id: 'Kamis', en: 'Thursday' },
  thu: { num: 4, id: 'Kamis', en: 'Thursday' },
  jumat: { num: 5, id: 'Jumat', en: 'Friday' },
  "jum'at": { num: 5, id: 'Jumat', en: 'Friday' },
  friday: { num: 5, id: 'Jumat', en: 'Friday' },
  fri: { num: 5, id: 'Jumat', en: 'Friday' },
  sabtu: { num: 6, id: 'Sabtu', en: 'Saturday' },
  saturday: { num: 6, id: 'Sabtu', en: 'Saturday' },
  sat: { num: 6, id: 'Sabtu', en: 'Saturday' },
};

function detectTimezone(input: string): {
  iana: 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';
  label: 'WIB' | 'WITA' | 'WIT';
} {
  if (/\bWITA\b|Asia\/Makassar/i.test(input)) {
    return { iana: 'Asia/Makassar', label: 'WITA' };
  }
  if (/\bWIT\b|Asia\/Jayapura/i.test(input)) {
    return { iana: 'Asia/Jayapura', label: 'WIT' };
  }
  const resolved = resolveTimezone('WIB');
  return {
    iana: (resolved as 'Asia/Jakarta') ?? 'Asia/Jakarta',
    label: 'WIB',
  };
}

/**
 * Pure cron cadence validator: rejects schedules firing more frequently than every 5 minutes (PRD §9.3).
 */
export function estimateCronMinIntervalMinutes(cronExpr: string): number | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour] = parts;

  if (minute === '*') return 1;
  const stepMin = /^\*\/(\d+)$/.exec(minute);
  if (stepMin) {
    const n = Number(stepMin[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (/^\d+(,\d+)+$/.test(minute)) {
    const mins = minute
      .split(',')
      .map(Number)
      .sort((a, b) => a - b);
    let minGap = 60;
    for (let i = 1; i < mins.length; i++) {
      minGap = Math.min(minGap, mins[i] - mins[i - 1]);
    }
    return minGap;
  }
  if (/^\d+$/.test(minute)) {
    if (hour === '*') return 60;
    const stepHour = /^\*\/(\d+)$/.exec(hour);
    if (stepHour) return Number(stepHour[1]) * 60;
    return 1440;
  }
  return 60;
}

/**
 * Deterministic Natural-Language Schedule Parser (id-ID & en-US, WIB/WITA/WIT) -> 5-field Cron.
 */
export function parseNaturalSchedule(input: string): ParsedNaturalSchedule {
  const raw = input.trim();
  const tz = detectTimezone(raw);

  if (!raw) {
    return {
      ok: false,
      cron_expr: null,
      timezone: tz.iana,
      tz_label: tz.label,
      min_interval_minutes: null,
      human_summary: '',
      error: 'Jadwal tidak boleh kosong.',
    };
  }

  // Raw 5-field cron passthrough with >= 5 min guardrail
  if (/^[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+$/.test(raw)) {
    const minCadence = estimateCronMinIntervalMinutes(raw);
    if (minCadence === null || minCadence < ROUTINE_LIMITS.MIN_CRON_CADENCE_MINUTES) {
      return {
        ok: false,
        cron_expr: null,
        timezone: tz.iana,
        tz_label: tz.label,
        min_interval_minutes: minCadence,
        human_summary: '',
        error: `Cron ditolak (PRD §9.3): interval minimum routine adalah ${ROUTINE_LIMITS.MIN_CRON_CADENCE_MINUTES} menit.`,
      };
    }
    return {
      ok: true,
      cron_expr: raw,
      timezone: tz.iana,
      tz_label: tz.label,
      min_interval_minutes: minCadence,
      human_summary: `Cron ${raw} (${tz.label} / ${tz.iana})`,
    };
  }

  // Pattern 1: "setiap N menit" / "every N minutes"
  const everyMin = /(?:setiap|tiap|every)\s+(\d+)\s*(?:menit|mnt|minutes?|mins?)\b/i.exec(raw);
  if (everyMin) {
    const n = Number(everyMin[1]);
    if (n < ROUTINE_LIMITS.MIN_CRON_CADENCE_MINUTES || n > 59) {
      return {
        ok: false,
        cron_expr: null,
        timezone: tz.iana,
        tz_label: tz.label,
        min_interval_minutes: n,
        human_summary: '',
        error: `Interval ${n} menit ditolak. Batas PRD §9.3 adalah minimal 5 menit (maks 59 menit untuk format menit).`,
      };
    }
    return {
      ok: true,
      cron_expr: `*/${n} * * * *`,
      timezone: tz.iana,
      tz_label: tz.label,
      min_interval_minutes: n,
      human_summary: `Setiap ${n} menit (${tz.label})`,
    };
  }

  // Pattern 2: "setiap N jam" / "every N hours"
  const everyHour = /(?:setiap|tiap|every)\s+(\d+)?\s*(?:jam|hours?|hrs?)\b/i.exec(raw);
  if (everyHour && !/\b(?:jam|pukul|at)\s*\d{1,2}[:.]\d{2}/i.test(raw)) {
    const n = Math.max(1, Math.min(23, Number(everyHour[1] ?? 1)));
    const cron = n === 1 ? '0 * * * *' : `0 */${n} * * *`;
    return {
      ok: true,
      cron_expr: cron,
      timezone: tz.iana,
      tz_label: tz.label,
      min_interval_minutes: n * 60,
      human_summary: `Setiap ${n} jam (${tz.label})`,
    };
  }

  // Extract time HH:MM or HH.MM or "jam 8" / "at 9"
  let hour = 8;
  let minute = 0;
  const hhmm = /(?:jam|pukul|at)?\s*(\d{1,2})[:.](\d{2})/i.exec(raw);
  if (hhmm) {
    hour = Number(hhmm[1]);
    minute = Number(hhmm[2]);
  } else {
    const hOnly = /(?:jam|pukul|at)\s*(\d{1,2})\b/i.exec(raw);
    if (hOnly) {
      hour = Number(hOnly[1]);
      minute = 0;
    }
  }
  if (/\b(?:sore|malam|pm)\b/i.test(raw) && hour >= 1 && hour <= 11) {
    hour += 12;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return {
      ok: false,
      cron_expr: null,
      timezone: tz.iana,
      tz_label: tz.label,
      min_interval_minutes: null,
      human_summary: '',
      error: `Format jam tidak valid (${hour}:${minute}).`,
    };
  }

  const hhStr = String(hour).padStart(2, '0');
  const mmStr = String(minute).padStart(2, '0');

  // Pattern 3: Weekdays ("hari kerja" / "weekdays")
  if (/hari\s+kerja|weekdays?|senin\s*[-–]\s*jumat/i.test(raw)) {
    return {
      ok: true,
      cron_expr: `${minute} ${hour} * * 1-5`,
      timezone: tz.iana,
      tz_label: tz.label,
      min_interval_minutes: 1440,
      human_summary: `Hari kerja (Senin–Jumat) pukul ${hhStr}:${mmStr} ${tz.label}`,
    };
  }

  // Pattern 4: Specific weekday ("Tiap Senin jam 09:30 WITA", "Every Friday at 17:00 WIB")
  for (const [token, meta] of Object.entries(DAY_MAP)) {
    const re = new RegExp(`\\b${token}\\b`, 'i');
    if (re.test(raw)) {
      return {
        ok: true,
        cron_expr: `${minute} ${hour} * * ${meta.num}`,
        timezone: tz.iana,
        tz_label: tz.label,
        min_interval_minutes: 10080,
        human_summary: `Setiap ${meta.id} pukul ${hhStr}:${mmStr} ${tz.label}`,
      };
    }
  }

  // Pattern 5: Daily ("setiap hari", "tiap pagi", "daily", "every day")
  if (/(?:setiap|tiap|every)\s*(?:hari|pagi|siang|sore|malam|day)|daily|harian/i.test(raw) || hhmm) {
    return {
      ok: true,
      cron_expr: `${minute} ${hour} * * *`,
      timezone: tz.iana,
      tz_label: tz.label,
      min_interval_minutes: 1440,
      human_summary: `Setiap hari pukul ${hhStr}:${mmStr} ${tz.label}`,
    };
  }

  return {
    ok: false,
    cron_expr: null,
    timezone: tz.iana,
    tz_label: tz.label,
    min_interval_minutes: null,
    human_summary: '',
    error:
      'Tidak mengenali pola jadwal. Contoh valid: "Setiap hari jam 08:00 WIB", "Tiap Senin 09:30 WITA", "Setiap 15 menit", atau "Every weekday at 07:30 WIT".',
  };
}

/**
 * Pure HMAC-SHA256 webhook signature verifier (constant-time comparison).
 */
export function computeWebhookHmac(secret: string, payload: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export function verifyWebhookHmac(secret: string, payload: string, signatureHeader: string): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = computeWebhookHmac(secret, payload);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export class QyroSchedulerEngine {
  private readonly storage: QyroStorage;

  constructor(storage: QyroStorage) {
    this.storage = storage;
    this.ensureDefaultRoutines();
  }

  private ensureDefaultRoutines(): void {
    const count = Number(
      (this.storage.db.prepare(`SELECT COUNT(*) AS c FROM routines`).get() as { c: number }).c
    );
    if (count === 0) {
      this.storage.db
        .prepare(
          `INSERT INTO routines (
            id, bot_id, name, trigger_type, schedule_expr, timezone, prompt, enabled, max_runs_per_hour
          ) VALUES (?, ?, ?, 'cron', ?, ?, ?, 1, 200)`
        )
        .run(
          'rtn-morning-briefing',
          'bot-chief-of-staff',
          'Briefing Pagi Chief of Staff',
          '0 8 * * 1-5',
          'Asia/Jakarta',
          'Ringkas prioritas hari ini, antrean persetujuan pending, dan status kuota free-tier (WIB).'
        );
    }
  }

  listRoutines(): RoutineRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT * FROM routines ORDER BY created_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      bot_id: String(r.bot_id),
      name: String(r.name),
      trigger_type: r.trigger_type as RoutineTriggerType,
      schedule_expr: String(r.schedule_expr),
      timezone: String(r.timezone),
      prompt: String(r.prompt),
      enabled: Number(r.enabled) === 1,
      max_runs_per_hour: Number(r.max_runs_per_hour ?? 200),
      last_run_at: r.last_run_at ? String(r.last_run_at) : null,
      created_at: String(r.created_at),
    }));
  }

  listRuns(routineId?: string): RoutineRunRecord[] {
    const rows = routineId
      ? (this.storage.db
          .prepare(`SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC LIMIT 20`)
          .all(routineId) as Array<Record<string, unknown>>)
      : (this.storage.db
          .prepare(`SELECT * FROM routine_runs ORDER BY started_at DESC LIMIT 25`)
          .all() as Array<Record<string, unknown>>);

    return rows.map((r) => ({
      id: String(r.id),
      routine_id: String(r.routine_id),
      status: r.status as RoutineRunRecord['status'],
      output_summary: String(r.output_summary ?? ''),
      started_at: String(r.started_at),
      finished_at: r.finished_at ? String(r.finished_at) : null,
    }));
  }

  createRoutine(params: {
    bot_id: string;
    name: string;
    trigger_type: RoutineTriggerType;
    schedule_input: string;
    prompt: string;
  }): { ok: boolean; error?: string; routine?: RoutineRecord; parsed?: ParsedNaturalSchedule } {
    const botCount = Number(
      (
        this.storage.db
          .prepare(`SELECT COUNT(*) AS c FROM routines WHERE bot_id = ?`)
          .get(params.bot_id) as { c: number }
      ).c
    );
    if (botCount >= ROUTINE_LIMITS.MAX_ROUTINES_PER_BOT) {
      return {
        ok: false,
        error: `Batas maksimum ${ROUTINE_LIMITS.MAX_ROUTINES_PER_BOT} routine per bot tercapai (PRD §9.3).`,
      };
    }

    let scheduleExpr = params.schedule_input.trim();
    let timezone = 'Asia/Jakarta';
    let parsed: ParsedNaturalSchedule | undefined;

    if (params.trigger_type === 'cron') {
      parsed = parseNaturalSchedule(params.schedule_input);
      if (!parsed.ok || !parsed.cron_expr) {
        return { ok: false, error: parsed.error ?? 'Gagal mem-parsing jadwal.', parsed };
      }
      scheduleExpr = parsed.cron_expr;
      timezone = parsed.timezone;
    } else {
      scheduleExpr = scheduleExpr || `event:${params.trigger_type}`;
    }

    const id = `rtn-${crypto.randomUUID().slice(0, 8)}`;
    this.storage.db
      .prepare(
        `INSERT INTO routines (
          id, bot_id, name, trigger_type, schedule_expr, timezone, prompt, enabled, max_runs_per_hour
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        id,
        params.bot_id,
        params.name.trim(),
        params.trigger_type,
        scheduleExpr,
        timezone,
        params.prompt.trim(),
        ROUTINE_LIMITS.MAX_ROUTINE_RUNS_PER_HOUR
      );

    return {
      ok: true,
      routine: this.listRoutines().find((r) => r.id === id),
      parsed,
    };
  }

  toggleRoutine(routineId: string, enabled: boolean): RoutineRecord | null {
    this.storage.db
      .prepare(`UPDATE routines SET enabled = ? WHERE id = ?`)
      .run(enabled ? 1 : 0, routineId);
    return this.listRoutines().find((r) => r.id === routineId) ?? null;
  }

  deleteRoutine(routineId: string): boolean {
    const res = this.storage.db.prepare(`DELETE FROM routines WHERE id = ?`).run(routineId);
    this.storage.db.prepare(`DELETE FROM routine_runs WHERE routine_id = ?`).run(routineId);
    return Number(res.changes) > 0;
  }

  executeRoutine(routineId: string, triggerContext?: string): {
    ok: boolean;
    error?: string;
    run?: RoutineRunRecord;
  } {
    const routine = this.listRoutines().find((r) => r.id === routineId);
    if (!routine) return { ok: false, error: 'Routine tidak ditemukan.' };

    // Rate limits: 300/hr global, 200/hr per routine (PRD §9.3)
    const globalHourCount = Number(
      (
        this.storage.db
          .prepare(
            `SELECT COUNT(*) AS c FROM routine_runs
             WHERE started_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`
          )
          .get() as { c: number }
      ).c
    );
    if (globalHourCount >= ROUTINE_LIMITS.MAX_GLOBAL_RUNS_PER_HOUR) {
      return { ok: false, error: 'Batas global 300 eksekusi routine/jam tercapai.' };
    }

    const routineHourCount = Number(
      (
        this.storage.db
          .prepare(
            `SELECT COUNT(*) AS c FROM routine_runs
             WHERE routine_id = ? AND started_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`
          )
          .get(routineId) as { c: number }
      ).c
    );
    if (routineHourCount >= routine.max_runs_per_hour) {
      return { ok: false, error: `Batas ${routine.max_runs_per_hour} eksekusi/jam untuk routine ini tercapai.` };
    }

    const runId = `run-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const summary = `[${routine.trigger_type}] "${routine.name}" dijalankan untuk ${routine.bot_id} (${routine.timezone})${
      triggerContext ? ` · ${triggerContext}` : ''
    }.`;

    this.storage.db
      .prepare(
        `INSERT INTO routine_runs (id, routine_id, status, output_summary, started_at, finished_at)
         VALUES (?, ?, 'succeeded', ?, ?, ?)`
      )
      .run(runId, routineId, summary, now, now);

    this.storage.db
      .prepare(`UPDATE routines SET last_run_at = ? WHERE id = ?`)
      .run(now, routineId);

    // Trim run history to 20 per routine (PRD §9.3)
    this.storage.db
      .prepare(
        `DELETE FROM routine_runs
         WHERE routine_id = ? AND id NOT IN (
           SELECT id FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC LIMIT ?
         )`
      )
      .run(routineId, routineId, ROUTINE_LIMITS.MAX_RUN_HISTORY_PER_ROUTINE);

    this.storage.appendEvent('router.decision', routine.bot_id, {
      kind: 'routine.executed',
      routine_id: routineId,
      run_id: runId,
      trigger_type: routine.trigger_type,
    });

    return {
      ok: true,
      run: this.listRuns(routineId).find((r) => r.id === runId),
    };
  }
}
