/**
 * qyro-agent — 2-Layer Reviewer Agent + Interactive Draft Card Engine + Phase 2 Agent Loop (PRD §9.1, §9.3, §4.3)
 */

import crypto from 'node:crypto';
import type { QyroStorage } from './storage';
import type { QyroMemory } from './memory';
import type { QyroSkillsManager } from './skills';
import type { OmniRouteEngine } from './router/engine';
import { compressContext } from './router/compression';
import {
  generateDesignSystemBm25,
  runHumanizerPass,
  runImpeccable62Audit,
} from './tools';

export type ReviewerDecision = 'allow' | 'deny' | 'ask';

export interface ReviewerVerdict {
  decision: ReviewerDecision;
  layer: 'deterministic_0ms' | 'contextual_policy';
  risk: 'low' | 'medium' | 'high';
  reason: string;
}

export interface DraftCardPayload {
  id: string;
  channel: 'email' | 'x_post' | 'slack';
  status: 'draft' | 'approved_sent' | 'saved' | 'discarded';
  to?: string;
  subject?: string;
  body: string;
  max_chars?: number;
  humanizer_applied: boolean;
  edited_by_user: boolean;
}

export interface ChatMessageRecord {
  id: string;
  channel_id: string;
  bot_id: string | null;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  active_skills: string[];
  draft_card: DraftCardPayload | null;
  created_at: string;
}

/**
 * 2-Layer Reviewer Agent (PRD §9.3):
 * Layer 1: Deterministic 0ms security boundary check
 * Layer 2: Contextual external-write / privilege check -> { Allow | Deny | Ask }
 */
export function evaluateReviewerAgent(
  storage: QyroStorage,
  action: { tool: string; target: string; summary: string }
): ReviewerVerdict {
  const combined = `${action.tool} ${action.target} ${action.summary}`.toLowerCase();

  // Check custom approval_rules in SQLite first
  const customRules = storage.db
    .prepare(`SELECT pattern, decision FROM approval_rules`)
    .all() as Array<{ pattern: string; decision: ReviewerDecision }>;

  for (const r of customRules) {
    if (combined.includes(r.pattern.toLowerCase())) {
      return {
        decision: r.decision,
        layer: 'deterministic_0ms',
        risk: r.decision === 'deny' ? 'high' : r.decision === 'ask' ? 'medium' : 'low',
        reason: `Matched explicit approval rule "${r.pattern}" -> ${r.decision.toUpperCase()}.`,
      };
    }
  }

  // Layer 1 Hard Deny (0ms)
  if (
    /(rm\s+-rf\s+\/|exfiltrate|dump\s+vault|localhost:11434|127\.0\.0\.1:1234|drop\s+table\s+vault_secrets|disable\s+anti-local)/i.test(
      combined
    )
  ) {
    return {
      decision: 'deny',
      layer: 'deterministic_0ms',
      risk: 'high',
      reason: 'Blocked at Layer 1 (0 ms): violates hard security or Anti-Local-Model boundary.',
    };
  }

  // Layer 1 Safe Read-Only Tools (0ms)
  if (
    /^(mem_search|load_skill|impeccable_audit|ui_ux_bm25|humanizer_pass|read_file|web_search|route_preview)$/.test(
      action.tool
    )
  ) {
    return {
      decision: 'allow',
      layer: 'deterministic_0ms',
      risk: 'low',
      reason: 'Read-only deterministic tool automatically allowed at Layer 1 (0 ms).',
    };
  }

  // Layer 2 External Write / State-Mutating Actions -> Ask Human
  if (
    /(send_email|post_x|publish|deploy|delete|shell_exec|install_untrusted_skill|vault_use|slack_post)/i.test(
      combined
    )
  ) {
    return {
      decision: 'ask',
      layer: 'contextual_policy',
      risk: 'medium',
      reason: 'External write or privileged action requires human approval via Action Queue.',
    };
  }

  return {
    decision: 'allow',
    layer: 'contextual_policy',
    risk: 'low',
    reason: 'Internal workspace action passed Reviewer Agent checks.',
  };
}

export class QyroAgentEngine {
  private readonly storage: QyroStorage;
  private readonly memory: QyroMemory;
  private readonly skills: QyroSkillsManager;
  private readonly router: OmniRouteEngine;

  constructor(
    storage: QyroStorage,
    memory: QyroMemory,
    skills: QyroSkillsManager,
    router: OmniRouteEngine
  ) {
    this.storage = storage;
    this.memory = memory;
    this.skills = skills;
    this.router = router;
    this.ensureDefaultDirectChannels();
  }

  private ensureDefaultDirectChannels(): void {
    const bots = this.storage.listBots();
    for (const bot of bots) {
      const chId = `dm-${bot.id}`;
      const existing = this.storage.db
        .prepare(`SELECT id FROM channels WHERE id = ?`)
        .get(chId) as { id: string } | undefined;

      if (!existing) {
        this.storage.db
          .prepare(`INSERT INTO channels (id, name, kind, routing_mode) VALUES (?, ?, 'direct', 'direct')`)
          .run(chId, bot.name);
        this.storage.db
          .prepare(`INSERT OR IGNORE INTO channel_members (channel_id, bot_id, turn_order) VALUES (?, ?, 0)`)
          .run(chId, bot.id);

        const greeting = bot.is_chief_of_staff
          ? 'Halo! Saya Chief of Staff QyroBot. Seluruh 23 skill bawaan, kompresi RTK+Caveman, dan mode Free-Tier-Only sudah siap. Pilih Starter Card di bawah atau ketik perintah seperti `/draft-x`, `/draft-email`, `/impeccable`, atau `/ui-ux`.'
          : `Halo! Saya ${bot.name}. Siap membantu audit UI 62-rule Impeccable, generator design system BM25, dan arsitektur kode minimalis Ponytail.`;

        this.storage.db
          .prepare(
            `INSERT INTO messages (id, channel_id, bot_id, role, content, active_skills_json)
             VALUES (?, ?, ?, 'assistant', ?, ?)`
          )
          .run(
            `msg-init-${bot.id}`,
            chId,
            bot.id,
            greeting,
            JSON.stringify(['ponytail', 'qyro-memory'])
          );
      }
    }
  }

  ensureBotDirectChannel(botId: string, botName: string): string {
    const chId = `dm-${botId}`;
    this.storage.db
      .prepare(`INSERT OR IGNORE INTO channels (id, name, kind, routing_mode) VALUES (?, ?, 'direct', 'direct')`)
      .run(chId, botName);
    this.storage.db
      .prepare(`INSERT OR IGNORE INTO channel_members (channel_id, bot_id, turn_order) VALUES (?, ?, 0)`)
      .run(chId, botId);
    return chId;
  }

  listMessagesForBot(botId: string): ChatMessageRecord[] {
    const chId = `dm-${botId}`;
    const rows = this.storage.db
      .prepare(
        `SELECT id, channel_id, bot_id, role, content, active_skills_json, draft_card_json, created_at
         FROM messages WHERE channel_id = ? ORDER BY created_at ASC, rowid ASC`
      )
      .all(chId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      channel_id: String(r.channel_id),
      bot_id: r.bot_id ? String(r.bot_id) : null,
      role: r.role as ChatMessageRecord['role'],
      content: String(r.content),
      active_skills: JSON.parse(String(r.active_skills_json ?? '[]')) as string[],
      draft_card: r.draft_card_json
        ? (JSON.parse(String(r.draft_card_json)) as DraftCardPayload)
        : null,
      created_at: String(r.created_at),
    }));
  }

  sendMessage(params: {
    bot_id: string;
    text: string;
  }): {
    user_message: ChatMessageRecord;
    assistant_message: ChatMessageRecord;
    telemetry: {
      provider_id: string;
      model: string;
      tier: string;
      savings_pct: number;
      cost_usd: number;
      active_skills: string[];
      reviewer_verdict: ReviewerVerdict;
    };
  } {
    const bots = this.storage.listBots();
    const bot = bots.find((b) => b.id === params.bot_id) ?? bots[0];
    const chId = this.ensureBotDirectChannel(bot.id, bot.name);
    const now = new Date().toISOString();

    // 1. Persist user message
    const userMsgId = `msg-${crypto.randomUUID().slice(0, 8)}`;
    this.storage.db
      .prepare(
        `INSERT INTO messages (id, channel_id, bot_id, role, content, active_skills_json, created_at)
         VALUES (?, ?, ?, 'user', ?, '[]', ?)`
      )
      .run(userMsgId, chId, bot.id, params.text.trim(), now);

    // 2. Progressive Disclosure Skill Auto-Activation + SHA-256 verification
    const match = this.skills.matchSkillsForPrompt(params.text);
    const verifiedSkills: string[] = [];
    for (const slug of match.activated_slugs) {
      const loaded = this.skills.loadSkill(slug);
      if (loaded.ok) {
        verifiedSkills.push(slug);
        this.storage.appendEvent('skill.activated', bot.id, {
          slug,
          sha256: loaded.sha256?.slice(0, 16),
          caveman_exempt: true,
        });
      }
    }

    // 3. Route via OmniRoute Cloud Engine + Stacked Compression Telemetry
    const routeDecision = this.router.route({ target: bot.routing_target });
    const compression = compressContext({
      text: params.text,
      role: 'user_prose',
      cavemanIntensity: 'medium',
    });

    // 4. Execute matching Permanent Core Tools / Draft Card / Reviewer Agent
    const lower = params.text.toLowerCase();
    let replyText = '';
    let draftCard: DraftCardPayload | null = null;
    let reviewerVerdict: ReviewerVerdict = evaluateReviewerAgent(this.storage, {
      tool: 'read_file',
      target: bot.id,
      summary: params.text.slice(0, 100),
    });
    let nextMood: 'idle' | 'waiting' | 'done' = 'done';

    if (/^\/draft-x\b|\b(draft-x|tweet|thread x|utasan x|post x)\b/i.test(lower)) {
      const rawDraft =
        'Di era digital saat ini, QyroBot hadir untuk merevolusi workflow multi-agent dengan mode Free-Tier-Only, avatar prosedural SVG 60fps, dan 23 skill bawaan tanpa paywall.';
      draftCard = {
        id: `draft-${crypto.randomUUID().slice(0, 8)}`,
        channel: 'x_post',
        status: 'draft',
        body: rawDraft,
        max_chars: 280,
        humanizer_applied: false,
        edited_by_user: false,
      };
      reviewerVerdict = evaluateReviewerAgent(this.storage, {
        tool: 'post_x',
        target: 'x.com',
        summary: 'Propose X post draft card',
      });
      nextMood = 'waiting';
      replyText =
        'Draf utasan X siap disunting langsung di kartu bawah. Klik **Haluskan dengan Humanizer** untuk membersihkan klise AI, lalu **Setujui & Kirim** agar melewati gerbang tulis X Shield.';
      this.storage.appendEvent('draft.proposed', bot.id, {
        draft_id: draftCard.id,
        channel: 'x_post',
      });
    } else if (/^\/draft-email\b|\b(draft-email|draf email|tulis email|kirim email|balas email)\b/i.test(lower)) {
      draftCard = {
        id: `draft-${crypto.randomUUID().slice(0, 8)}`,
        channel: 'email',
        status: 'draft',
        to: 'tim-engineering@perusahaan.id',
        subject: 'Ringkasan Progres QyroBot Fase 2 & Prioritas Minggu Ini',
        body: 'Halo tim,\n\nDi era digital saat ini, sangat penting untuk dicatat bahwa QyroBot Fase 2 sudah merampungkan mesin avatar prosedural, 23 built-in skills, dan detector anti-slop 62 aturan.\n\nMohon review prioritas integrasi Fase 3 sebelum pukul 16.00 WIB hari ini.',
        humanizer_applied: false,
        edited_by_user: false,
      };
      reviewerVerdict = evaluateReviewerAgent(this.storage, {
        tool: 'send_email',
        target: draftCard.to ?? 'email',
        summary: draftCard.subject ?? 'Draft email',
      });
      nextMood = 'waiting';
      replyText =
        'Saya sudah menyiapkan Interactive Draft Card email di bawah. Kamu bisa mengubah penerima, subjek, dan isi pesan langsung di chat sebelum menyetujui pengiriman.';
      this.storage.appendEvent('draft.proposed', bot.id, {
        draft_id: draftCard.id,
        channel: 'email',
      });
    } else if (/^\/(impeccable|audit-ui|polish)\b|\b(impeccable|anti-slop|audit ui)\b/i.test(lower)) {
      const sampleToAudit =
        params.text.includes('<') || params.text.includes('className')
          ? params.text
          : '<div onClick={go} className="bg-gradient-to-r from-purple-500 to-pink-500 border-l-4"><span className="w-2 h-2 rounded-full animate-pulse"></span><h1>// 01_HERO</h1><p>Di era digital saat ini lorem ipsum</p></div>';
      const audit = runImpeccable62Audit(sampleToAudit);
      const topLines = audit.findings
        .slice(0, 5)
        .map((f) => `- **${f.rule_id}** (${f.severity}): ${f.title} — ${f.fix}`)
        .join('\n');
      replyText = audit.passed
        ? `Audit **Impeccable 62-Rule** selesai (0 token LLM): 0 pelanggaran ditemukan.`
        : `Audit **Impeccable ${audit.rules_evaluated}-Rule** (0 token LLM) mendeteksi **${audit.violation_count} pelanggaran** (High: ${audit.by_severity.high}, Medium: ${audit.by_severity.medium}, Low: ${audit.by_severity.low}):\n${topLines}`;
    } else if (/^\/(ui-ux|design-system)\b|\b(design system|palet warna|ui-ux)\b/i.test(lower)) {
      const ds = generateDesignSystemBm25(params.text);
      const bm = ds.best_match;
      replyText = `**UI-UX-Pro-Max BM25** (0 token LLM) merekomendasikan sistem desain **${bm.domain}**:\n- Gaya: ${bm.ui_style}\n- Palet: Canvas \`${bm.palette.canvas}\`, Surface \`${bm.palette.surface}\`, Border \`${bm.palette.border}\`, Accent \`${bm.palette.accent}\`\n- Tipografi: Display \`${bm.font_pairing.display}\` + Body \`${bm.font_pairing.body}\` + Mono \`${bm.font_pairing.mono}\`\n- Pola Layout: ${bm.landing_pattern}`;
    } else if (/^\/humanizer\b|\b(humanizer|haluskan teks)\b/i.test(lower)) {
      const payload = params.text.replace(/^\/humanizer\s*/i, '').trim() ||
        'Di era digital saat ini, sangat penting untuk dicatat bahwa solusi ini seamlessly revolutionize workflow kita.';
      const res = runHumanizerPass(payload);
      replyText = `**Humanizer v4.0.0** membersihkan ${res.patterns_cleaned.length} pola prosa AI (${res.patterns_cleaned.join(', ') || 'sudah natural'}):\n\n${res.humanized}`;
    } else if (/\b(deploy|hapus database|rm -rf|shell_exec|publish)\b/i.test(lower)) {
      reviewerVerdict = evaluateReviewerAgent(this.storage, {
        tool: 'shell_exec',
        target: 'production-vps',
        summary: params.text,
      });
      if (reviewerVerdict.decision === 'deny') {
        nextMood = 'done';
        replyText = `**Reviewer Agent (Layer 1 — DENY):** ${reviewerVerdict.reason}`;
      } else {
        const act = this.storage.enqueueAction(bot.id, 'approval', {
          title: `Permintaan Persetujuan Aksi: ${params.text.slice(0, 64)}`,
          summary: reviewerVerdict.reason,
          risk: reviewerVerdict.risk,
        });
        nextMood = 'waiting';
        replyText = `**Reviewer Agent (ASK):** Aksi ini memerlukan persetujuan manusia dan telah masuk ke **Perlu Perhatian** (\`${act.id}\`).`;
      }
    } else {
      const memHits = this.memory.memSearchIndex(params.text, 2);
      const memNote =
        memHits.length > 0
          ? `\n\nKonteks relevan dari **qyro-memory** (${memHits.length} item): ${memHits.map((m) => `"${m.title}"`).join(', ')}.`
          : '';
      const providerName = routeDecision.selected_provider?.name ?? 'OmniRoute Cloud Free';
      const routingNote = match.routing_notes.length > 0 ? `\n${match.routing_notes.join(' ')}` : '';
      replyText = `Diproses oleh **${bot.name}** melalui **${providerName}** (hemat konteks ${compression.savings_pct}% via RTK+Caveman). Skill aktif terverifikasi SHA-256: ${verifiedSkills.map((s) => `\`${s}\``).join(', ')}.${routingNote}${memNote}`;
    }

    // 5. Persist assistant message & update bot mood
    const asstMsgId = `msg-${crypto.randomUUID().slice(0, 8)}`;
    const asstTime = new Date().toISOString();
    this.storage.db
      .prepare(
        `INSERT INTO messages (id, channel_id, bot_id, role, content, active_skills_json, draft_card_json, created_at)
         VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?)`
      )
      .run(
        asstMsgId,
        chId,
        bot.id,
        replyText,
        JSON.stringify(verifiedSkills),
        draftCard ? JSON.stringify(draftCard) : null,
        asstTime
      );

    this.storage.db
      .prepare(`UPDATE bots SET current_mood = ?, updated_at = ? WHERE id = ?`)
      .run(nextMood, asstTime, bot.id);

    this.storage.appendEvent('bot.mood_changed', bot.id, { mood: nextMood });

    return {
      user_message: {
        id: userMsgId,
        channel_id: chId,
        bot_id: bot.id,
        role: 'user',
        content: params.text.trim(),
        active_skills: [],
        draft_card: null,
        created_at: now,
      },
      assistant_message: {
        id: asstMsgId,
        channel_id: chId,
        bot_id: bot.id,
        role: 'assistant',
        content: replyText,
        active_skills: verifiedSkills,
        draft_card: draftCard,
        created_at: asstTime,
      },
      telemetry: {
        provider_id: routeDecision.selected_provider?.id ?? 'free-pool',
        model: routeDecision.selected_provider?.default_model ?? 'auto',
        tier: routeDecision.selected_provider?.tier ?? 'free',
        savings_pct: compression.savings_pct,
        cost_usd: routeDecision.selected_provider?.cost_per_1m_usd ?? 0,
        active_skills: verifiedSkills,
        reviewer_verdict: reviewerVerdict,
      },
    };
  }

  /**
   * Update / Humanize / Approve / Save / Discard an Interactive Inline Draft Card
   * Records user edits to qyro-memory so bot learns writing style (PRD §4.3).
   */
  mutateDraftCard(
    messageId: string,
    action: 'edit' | 'humanize' | 'approve_send' | 'save' | 'discard',
    patch?: { to?: string; subject?: string; body?: string }
  ): ChatMessageRecord | null {
    const row = this.storage.db
      .prepare(`SELECT * FROM messages WHERE id = ?`)
      .get(messageId) as Record<string, unknown> | undefined;
    if (!row || !row.draft_card_json) return null;

    const draft = JSON.parse(String(row.draft_card_json)) as DraftCardPayload;
    if (patch?.to !== undefined) draft.to = patch.to;
    if (patch?.subject !== undefined) draft.subject = patch.subject;
    if (patch?.body !== undefined && patch.body !== draft.body) {
      draft.body = patch.body;
      draft.edited_by_user = true;
    }

    if (action === 'humanize') {
      const res = runHumanizerPass(draft.body);
      draft.body = res.humanized;
      draft.humanizer_applied = true;
    } else if (action === 'approve_send') {
      draft.status = 'approved_sent';
      if (draft.edited_by_user) {
        this.memory.recordObservation({
          bot_id: row.bot_id ? String(row.bot_id) : 'bot-chief-of-staff',
          kind: 'preference',
          title: `Gaya Penulisan Disetujui (${draft.channel})`,
          body: `User menyunting dan menyetujui draf ${draft.channel}: "${draft.body.slice(0, 180)}"`,
          tags: ['writing-style', 'draft-edit', draft.channel],
        });
      }
      if (row.bot_id) {
        this.storage.db
          .prepare(`UPDATE bots SET current_mood = 'done', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
          .run(String(row.bot_id));
      }
    } else if (action === 'save') {
      draft.status = 'saved';
    } else if (action === 'discard') {
      draft.status = 'discarded';
    }

    this.storage.db
      .prepare(`UPDATE messages SET draft_card_json = ? WHERE id = ?`)
      .run(JSON.stringify(draft), messageId);

    return {
      id: String(row.id),
      channel_id: String(row.channel_id),
      bot_id: row.bot_id ? String(row.bot_id) : null,
      role: row.role as ChatMessageRecord['role'],
      content: String(row.content),
      active_skills: JSON.parse(String(row.active_skills_json ?? '[]')) as string[],
      draft_card: draft,
      created_at: String(row.created_at),
    };
  }
}
