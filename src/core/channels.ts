/**
 * Channels + Fast Auto-Router (< 400 ms) + Group Chat Round-Robin Orchestrator + poke_bot Delegation
 * (PRD v1.7.0 §9.1)
 */

import crypto from 'node:crypto';
import type { QyroStorage } from './storage';
import type { BotRecord } from './types';

export type ChannelMode = 'auto_route' | 'group_round_robin';

export interface ChannelRecord {
  id: string;
  name: string;
  mode: ChannelMode;
  member_bot_ids: string[];
  created_at: string;
}

export interface ChannelMessageRecord {
  id: string;
  channel_id: string;
  sender_type: 'user' | 'bot' | 'system';
  sender_id: string;
  sender_name: string;
  content: string;
  route_latency_ms: number | null;
  routed_reason: string | null;
  created_at: string;
}

export interface DelegationRecord {
  id: string;
  from_bot_id: string;
  to_bot_id: string;
  task_summary: string;
  status: string;
  created_at: string;
}

/**
 * Pure Fast Auto-Router (< 400 ms, PRD §9.1):
 * Deterministically scores member bots against message intent keywords and bot metadata.
 */
export function selectFastAutoRouteBot(
  message: string,
  memberBots: BotRecord[]
): { bot: BotRecord; reason: string; latency_ms: number } {
  const t0 = performance.now();
  const lowered = message.toLowerCase();

  let bestBot = memberBots[0];
  let bestScore = -1;
  let bestReason = 'Default primary fallback';

  for (const bot of memberBots) {
    let score = 0;
    const reasons: string[] = [];
    const hay = `${bot.name} ${bot.label} ${bot.description} ${bot.routing_target}`.toLowerCase();

    // Coding / Rust / Systems signals
    if (/\b(rust|cargo|code|bug|refactor|compile|sql|api|rtk|memory|elf|pe|binary)\b/i.test(lowered)) {
      if (/rust|code|architect|engineer|coding/.test(hay)) {
        score += 12;
        reasons.push('specialist:coding/rust');
      }
    }

    // Briefing / Coordination / Delegation / Approval signals
    if (/\b(briefing|ringkas|koordinasi|jadwal|prioritas|delegasi|tim|summary|plan)\b/i.test(lowered)) {
      if (bot.is_chief_of_staff || /chief|orchestrator|koordinat/.test(hay)) {
        score += 10;
        reasons.push('chief_of_staff:orchestration');
      }
    }

    // Direct token overlap with bot name/description
    const words = lowered.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    for (const w of words) {
      if (hay.includes(w)) {
        score += 2;
      }
    }

    if (bot.is_chief_of_staff && score === 0) {
      score += 1;
      reasons.push('primary_orchestrator_fallback');
    }

    if (score > bestScore) {
      bestScore = score;
      bestBot = bot;
      bestReason = reasons.length > 0 ? reasons.join(', ') : `keyword_score=${score}`;
    }
  }

  const latencyMs = Math.max(0.1, Number((performance.now() - t0).toFixed(2)));
  return { bot: bestBot, reason: bestReason, latency_ms: latencyMs };
}

export class QyroChannelsEngine {
  private readonly storage: QyroStorage;

  constructor(storage: QyroStorage) {
    this.storage = storage;
    this.ensureDefaultChannels();
  }

  private ensureDefaultChannels(): void {
    const count = Number(
      (
        this.storage.db
          .prepare(`SELECT COUNT(*) AS c FROM channels WHERE kind IN ('channel', 'group_chat')`)
          .get() as { c: number }
      ).c
    );
    if (count === 0) {
      const bots = this.storage.listBots();
      const botIds = bots.map((b) => b.id);
      this.createChannel({
        name: '#general-auto-router',
        mode: 'auto_route',
        member_bot_ids: botIds,
      });
      this.createChannel({
        name: '#war-room-round-robin',
        mode: 'group_round_robin',
        member_bot_ids: botIds,
      });
    }
  }

  listChannels(): ChannelRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT * FROM channels WHERE kind IN ('channel', 'group_chat') ORDER BY created_at ASC`)
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const members = this.storage.db
        .prepare(`SELECT bot_id FROM channel_members WHERE channel_id = ? ORDER BY turn_order ASC`)
        .all(String(r.id)) as Array<{ bot_id: string }>;
      const routingMode = String(r.routing_mode ?? 'fast_auto');
      return {
        id: String(r.id),
        name: String(r.name),
        mode: routingMode === 'round_robin' ? 'group_round_robin' : 'auto_route',
        member_bot_ids: members.map((m) => m.bot_id),
        created_at: String(r.created_at),
      };
    });
  }

  createChannel(params: {
    name: string;
    mode: ChannelMode;
    member_bot_ids: string[];
  }): ChannelRecord {
    const id = `ch-${crypto.randomUUID().slice(0, 8)}`;
    const kind = params.mode === 'group_round_robin' ? 'group_chat' : 'channel';
    const routingMode = params.mode === 'group_round_robin' ? 'round_robin' : 'fast_auto';
    this.storage.db
      .prepare(`INSERT INTO channels (id, name, kind, routing_mode) VALUES (?, ?, ?, ?)`)
      .run(id, params.name.trim(), kind, routingMode);

    const uniqueIds = Array.from(new Set(params.member_bot_ids));
    uniqueIds.forEach((botId, idx) => {
      this.storage.db
        .prepare(
          `INSERT OR IGNORE INTO channel_members (channel_id, bot_id, turn_order) VALUES (?, ?, ?)`
        )
        .run(id, botId, idx);
    });

    return this.listChannels().find((c) => c.id === id)!;
  }

  listChannelMessages(channelId: string): ChannelMessageRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT * FROM channel_messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT 60`)
      .all(channelId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      channel_id: String(r.channel_id),
      sender_type: r.sender_type as ChannelMessageRecord['sender_type'],
      sender_id: String(r.sender_id),
      sender_name: String(r.sender_name),
      content: String(r.content),
      route_latency_ms: r.route_latency_ms !== null ? Number(r.route_latency_ms) : null,
      routed_reason: r.routed_reason ? String(r.routed_reason) : null,
      created_at: String(r.created_at),
    }));
  }

  postToChannel(channelId: string, text: string): {
    user_message: ChannelMessageRecord;
    bot_replies: ChannelMessageRecord[];
    channel_messages: ChannelMessageRecord[];
    routing_latency_ms: number;
  } {
    const channel = this.listChannels().find((c) => c.id === channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} tidak ditemukan.`);
    }

    const allBots = this.storage.listBots();
    const members = allBots.filter((b) => channel.member_bot_ids.includes(b.id));
    const effectiveMembers = members.length > 0 ? members : allBots;

    const userMsgId = `cmsg-${crypto.randomUUID().slice(0, 8)}`;
    const nowUser = new Date().toISOString();
    this.storage.db
      .prepare(
        `INSERT INTO channel_messages (id, channel_id, sender_type, sender_id, sender_name, content, created_at)
         VALUES (?, ?, 'user', 'owner', 'Anda', ?, ?)`
      )
      .run(userMsgId, channelId, text.trim(), nowUser);

    const botReplies: ChannelMessageRecord[] = [];
    let routingLatencyMs = 0;

    if (channel.mode === 'auto_route') {
      const selected = selectFastAutoRouteBot(text, effectiveMembers);
      routingLatencyMs = selected.latency_ms;
      const replyId = `cmsg-${crypto.randomUUID().slice(0, 8)}`;
      const replyText = `[Fast Auto-Router · ${selected.latency_ms} ms · ${selected.reason}] ${selected.bot.name} (${selected.bot.routing_target}) menangani: "${text.trim()}".`;
      const nowBot = new Date(Date.now() + 2).toISOString();
      this.storage.db
        .prepare(
          `INSERT INTO channel_messages (
            id, channel_id, sender_type, sender_id, sender_name, content, route_latency_ms, routed_reason, created_at
          ) VALUES (?, ?, 'bot', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          replyId,
          channelId,
          selected.bot.id,
          selected.bot.name,
          replyText,
          selected.latency_ms,
          selected.reason,
          nowBot
        );
      botReplies.push({
        id: replyId,
        channel_id: channelId,
        sender_type: 'bot',
        sender_id: selected.bot.id,
        sender_name: selected.bot.name,
        content: replyText,
        route_latency_ms: selected.latency_ms,
        routed_reason: selected.reason,
        created_at: nowBot,
      });
    } else {
      // Group Chat Round-Robin Orchestrator: every member bot takes one ordered turn
      const t0 = performance.now();
      effectiveMembers.forEach((bot, idx) => {
        const replyId = `cmsg-${crypto.randomUUID().slice(0, 8)}`;
        const turnReason = `round_robin_turn_${idx + 1}_of_${effectiveMembers.length}`;
        const replyText = `[Giliran ${idx + 1}/${effectiveMembers.length} · ${bot.label}] Perspektif ${bot.name} terhadap "${text.trim().slice(0, 80)}": fokus pada ${bot.routing_target}.`;
        const ts = new Date(Date.now() + 2 + idx * 5).toISOString();
        const elapsed = Number((performance.now() - t0).toFixed(2));
        this.storage.db
          .prepare(
            `INSERT INTO channel_messages (
              id, channel_id, sender_type, sender_id, sender_name, content, route_latency_ms, routed_reason, created_at
            ) VALUES (?, ?, 'bot', ?, ?, ?, ?, ?, ?)`
          )
          .run(replyId, channelId, bot.id, bot.name, replyText, elapsed, turnReason, ts);

        botReplies.push({
          id: replyId,
          channel_id: channelId,
          sender_type: 'bot',
          sender_id: bot.id,
          sender_name: bot.name,
          content: replyText,
          route_latency_ms: elapsed,
          routed_reason: turnReason,
          created_at: ts,
        });
      });
      routingLatencyMs = Number((performance.now() - t0).toFixed(2));
    }

    const channelMessages = this.listChannelMessages(channelId);
    const userMessage = channelMessages.find((m) => m.id === userMsgId)!;

    return {
      user_message: userMessage,
      bot_replies: botReplies,
      channel_messages: channelMessages,
      routing_latency_ms: routingLatencyMs,
    };
  }

  /**
   * poke_bot — Explicit bot-to-bot task delegation logged in SQLite `delegations` & `event_log`.
   */
  pokeBot(params: {
    from_bot_id: string;
    to_bot_id: string;
    task_summary: string;
  }): DelegationRecord {
    const id = `del-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    this.storage.db
      .prepare(
        `INSERT INTO delegations (id, from_bot_id, to_bot_id, task_summary, status, created_at, completed_at)
         VALUES (?, ?, ?, ?, 'completed', ?, ?)`
      )
      .run(id, params.from_bot_id, params.to_bot_id, params.task_summary.trim(), now, now);

    this.storage.appendEvent('router.decision', params.to_bot_id, {
      kind: 'poke_bot',
      delegation_id: id,
      from_bot_id: params.from_bot_id,
      to_bot_id: params.to_bot_id,
      task_summary: params.task_summary.trim(),
    });

    return {
      id,
      from_bot_id: params.from_bot_id,
      to_bot_id: params.to_bot_id,
      task_summary: params.task_summary.trim(),
      status: 'completed',
      created_at: now,
    };
  }

  listDelegations(): DelegationRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT * FROM delegations ORDER BY created_at DESC LIMIT 20`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      from_bot_id: String(r.from_bot_id),
      to_bot_id: String(r.to_bot_id),
      task_summary: String(r.task_summary),
      status: String(r.status),
      created_at: String(r.created_at),
    }));
  }
}
