import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Hash,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Webhook,
} from 'lucide-react';
import { api } from '../lib/api';
import type { BotRecord, UiLocale } from '../core/types';
import type {
  ChannelMessageRecord,
  ChannelMode,
  ChannelRecord,
  DelegationRecord,
} from '../core/channels';
import type {
  ParsedNaturalSchedule,
  RoutineRecord,
  RoutineRunRecord,
  RoutineTriggerType,
} from '../core/scheduler';

interface ChannelsRoutinesPanelProps {
  bots: BotRecord[];
  activeBotId: string;
  locale: UiLocale;
  onRefreshBootstrap: () => Promise<void>;
}

export const ChannelsRoutinesPanel: React.FC<ChannelsRoutinesPanelProps> = ({
  bots,
  activeBotId,
  locale,
  onRefreshBootstrap,
}) => {
  const isId = locale === 'id-ID';
  const [subTab, setSubTab] = useState<'channels' | 'routines'>('channels');

  // Channels state
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [channelMessages, setChannelMessages] = useState<ChannelMessageRecord[]>([]);
  const [delegations, setDelegations] = useState<DelegationRecord[]>([]);
  const [channelInput, setChannelInput] = useState('');
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelMode, setNewChannelMode] = useState<ChannelMode>('auto_route');
  const [showNewChannel, setShowNewChannel] = useState(false);

  // poke_bot state
  const [pokeFrom, setPokeFrom] = useState(bots[0]?.id ?? 'bot-chief-of-staff');
  const [pokeTo, setPokeTo] = useState(bots[1]?.id ?? bots[0]?.id ?? 'bot-systems-engineer');
  const [pokeTask, setPokeTask] = useState('');
  const [channelNotice, setChannelNotice] = useState<string | null>(null);

  // Routines state
  const [routines, setRoutines] = useState<RoutineRecord[]>([]);
  const [runs, setRuns] = useState<RoutineRunRecord[]>([]);
  const [rtnBotId, setRtnBotId] = useState(activeBotId || 'bot-chief-of-staff');
  const [rtnName, setRtnName] = useState('');
  const [rtnTrigger, setRtnTrigger] = useState<RoutineTriggerType>('cron');
  const [rtnSchedule, setRtnSchedule] = useState('Tiap Senin jam 09:30 WITA');
  const [rtnPrompt, setRtnPrompt] = useState('');
  const [parsedPreview, setParsedPreview] = useState<ParsedNaturalSchedule | null>(null);
  const [routineFeedback, setRoutineFeedback] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  const loadChannels = useCallback(async (channelId?: string) => {
    const res = await api.getChannelsState(channelId);
    setChannels(res.channels);
    const active = channelId || res.active_channel_id || res.channels[0]?.id || '';
    setSelectedChannelId(active);
    setChannelMessages(res.messages);
    setDelegations(res.delegations);
  }, []);

  const loadRoutines = useCallback(async () => {
    const res = await api.getRoutinesState();
    setRoutines(res.routines);
    setRuns(res.runs);
  }, []);

  useEffect(() => {
    void loadChannels();
    void loadRoutines();
  }, [loadChannels, loadRoutines]);

  useEffect(() => {
    if (rtnTrigger !== 'cron' || !rtnSchedule.trim()) {
      setParsedPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      void api
        .parseRoutineSchedule(rtnSchedule)
        .then(setParsedPreview)
        .catch(() => setParsedPreview(null));
    }, 180);
    return () => clearTimeout(timer);
  }, [rtnSchedule, rtnTrigger]);

  const activeChannel = channels.find((c) => c.id === selectedChannelId) ?? channels[0];

  const handleSelectChannel = async (id: string) => {
    setSelectedChannelId(id);
    setLastLatencyMs(null);
    await loadChannels(id);
  };

  const handleSendChannelMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannel || !channelInput.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.postChannelMessage(activeChannel.id, channelInput.trim());
      setChannelMessages(res.channel_messages);
      setLastLatencyMs(res.routing_latency_ms);
      setChannelInput('');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setBusy(true);
    try {
      const res = await api.createChannel({
        name: newChannelName.startsWith('#') ? newChannelName.trim() : `#${newChannelName.trim()}`,
        mode: newChannelMode,
        member_bot_ids: bots.map((b) => b.id),
      });
      setChannels(res.channels);
      setNewChannelName('');
      setShowNewChannel(false);
      await handleSelectChannel(res.channel.id);
    } finally {
      setBusy(false);
    }
  };

  const handlePokeBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pokeTask.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.pokeBot({
        from_bot_id: pokeFrom,
        to_bot_id: pokeTo,
        task_summary: pokeTask.trim(),
      });
      setDelegations(res.delegations);
      setPokeTask('');
      setChannelNotice(
        isId
          ? `Delegasi poke_bot dicatat (${res.delegation.id}) dan diselesaikan.`
          : `poke_bot delegation recorded (${res.delegation.id}).`
      );
      await onRefreshBootstrap();
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rtnName.trim() || !rtnPrompt.trim() || busy) return;
    setBusy(true);
    setRoutineFeedback(null);
    try {
      const res = await api.createRoutine({
        bot_id: rtnBotId,
        name: rtnName.trim(),
        trigger_type: rtnTrigger,
        schedule_input: rtnSchedule.trim(),
        prompt: rtnPrompt.trim(),
      });
      if (!res.data.ok) {
        setRoutineFeedback({
          ok: false,
          text: res.data.error ?? 'Gagal membuat routine.',
        });
      } else {
        setRoutines(res.data.routines);
        setRtnName('');
        setRtnPrompt('');
        setRoutineFeedback({
          ok: true,
          text: isId
            ? `Routine "${res.data.routine?.name}" tersimpan (${res.data.routine?.schedule_expr} · ${res.data.routine?.timezone}).`
            : `Routine "${res.data.routine?.name}" saved (${res.data.routine?.schedule_expr} · ${res.data.routine?.timezone}).`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRunRoutine = async (id: string) => {
    setBusy(true);
    try {
      const res = await api.runRoutineNow(id, 'manual_ui_run');
      setRoutines(res.routines);
      setRuns(res.runs);
      setRoutineFeedback({
        ok: res.ok,
        text: res.ok
          ? res.run?.output_summary ?? 'Routine berhasil dijalankan.'
          : res.error ?? 'Eksekusi routine gagal.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTestWebhook = async (id: string) => {
    setBusy(true);
    try {
      const res = await api.triggerRoutineWebhook(id, {
        secret: 'qyro-hmac-demo-secret',
        payload: JSON.stringify({ source: 'github', ref: 'refs/heads/main', ts: Date.now() }),
      });
      if (res.data.routines) setRoutines(res.data.routines);
      if (res.data.runs) setRuns(res.data.runs);
      setRoutineFeedback({
        ok: Boolean(res.data.verified && res.data.ok),
        text: res.data.verified
          ? `HMAC-SHA256 verified (${res.data.signature?.slice(0, 22)}...) — routine dieksekusi.`
          : res.data.error ?? 'HMAC verification gagal.',
      });
    } finally {
      setBusy(false);
    }
  };

  const botName = (id: string) => bots.find((b) => b.id === id)?.name ?? id;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[var(--bg-canvas)]">
      {/* Header + Sub-Tab Navigation */}
      <header className="px-4 sm:px-6 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-[var(--text-primary)] truncate">
            {isId ? 'Channels, Delegasi & Scheduler NL' : 'Channels, Delegation & NL Scheduler'}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] truncate">
            {isId
              ? 'Fast Auto-Router (< 400 ms), Group Chat Round-Robin, poke_bot, & Cron WIB/WITA/WIT'
              : 'Fast Auto-Router (< 400 ms), Group Round-Robin, poke_bot, & WIB/WITA/WIT Routines'}
          </p>
        </div>

        <div
          role="tablist"
          className="flex items-center p-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] gap-1 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'channels'}
            onClick={() => setSubTab('channels')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              subTab === 'channels'
                ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            Channels & poke_bot
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'routines'}
            onClick={() => setSubTab('routines')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              subTab === 'routines'
                ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Scheduler & Routines
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-[1060px] mx-auto space-y-6">
          {subTab === 'channels' ? (
            <>
              {/* Channel Selector Bar */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {channels.map((ch) => {
                      const active = activeChannel?.id === ch.id;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => void handleSelectChannel(ch.id)}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                            active
                              ? 'border-[var(--text-primary)] bg-[var(--bg-canvas)] text-[var(--text-primary)]'
                              : 'border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {ch.mode === 'group_round_robin' ? (
                            <Users className="w-3.5 h-3.5" />
                          ) : (
                            <Hash className="w-3.5 h-3.5" />
                          )}
                          <span>{ch.name}</span>
                          <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                            {ch.mode === 'group_round_robin' ? 'round-robin' : 'auto <400ms'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewChannel((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {isId ? 'Channel Baru' : 'New Channel'}
                  </button>
                </div>

                {showNewChannel && (
                  <form
                    onSubmit={(e) => void handleCreateChannel(e)}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center gap-2"
                  >
                    <input
                      type="text"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="#ops-incident"
                      className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    />
                    <select
                      value={newChannelMode}
                      onChange={(e) => setNewChannelMode(e.target.value as ChannelMode)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    >
                      <option value="auto_route">Fast Auto-Router (&lt; 400 ms)</option>
                      <option value="group_round_robin">Group Chat Round-Robin</option>
                    </select>
                    <button
                      type="submit"
                      disabled={busy || !newChannelName.trim()}
                      className="px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      {isId ? 'Buat' : 'Create'}
                    </button>
                  </form>
                )}

                {/* Channel Mode Info + Latency Strip */}
                {activeChannel && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
                    <span>
                      Mode:{' '}
                      <strong className="text-[var(--text-primary)]">
                        {activeChannel.mode === 'group_round_robin'
                          ? 'Group Chat Round-Robin (semua bot anggota bergiliran)'
                          : 'Fast Auto-Router (pemilihan bot deterministik < 400 ms)'}
                      </strong>
                    </span>
                    <span className="font-mono tabular-nums text-[var(--status-success)]">
                      {lastLatencyMs !== null
                        ? `Last route: ${lastLatencyMs.toFixed(2)} ms`
                        : `${activeChannel.member_bot_ids.length} bots active`}
                    </span>
                  </div>
                )}

                {/* Messages Feed */}
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 max-h-[300px] overflow-y-auto space-y-2.5">
                  {channelMessages.length === 0 ? (
                    <p className="text-xs text-[var(--text-secondary)] py-6 text-center">
                      {isId
                        ? 'Kirim pesan untuk menguji Fast Auto-Router (mis. "audit kode Rust cargo build") atau diskusi Round-Robin.'
                        : 'Send a message to test Fast Auto-Router or multi-bot Round-Robin turns.'}
                    </p>
                  ) : (
                    channelMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-xl border text-xs space-y-1 ${
                          msg.sender_type === 'user'
                            ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)] ml-8'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-sidebar)] mr-8'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {msg.sender_name}
                          </span>
                          {msg.route_latency_ms !== null && (
                            <span className="font-mono tabular-nums text-[11px] text-[var(--status-success)]">
                              {msg.route_latency_ms.toFixed(2)} ms · {msg.routed_reason}
                            </span>
                          )}
                        </div>
                        <p className="text-[var(--text-primary)] leading-relaxed break-words">
                          {msg.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Channel Message Composer */}
                <form
                  onSubmit={(e) => void handleSendChannelMessage(e)}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    aria-label="Kirim pesan channel"
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    placeholder={
                      activeChannel?.mode === 'group_round_robin'
                        ? 'Kirim topik diskusi multi-bot (Round-Robin)...'
                        : 'Kirim tugas (mis. "audit kode Rust" atau "ringkas jadwal tim")...'
                    }
                    className="flex-1 min-w-0 px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)]"
                  />
                  <button
                    type="submit"
                    disabled={busy || !channelInput.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0 disabled:opacity-45"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isId ? 'Kirim' : 'Send'}
                  </button>
                </form>
              </section>

              {/* poke_bot Bot-to-Bot Delegation */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Delegasi Bot-to-Bot (<code className="font-mono text-xs">poke_bot</code>)
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {isId
                      ? 'Serahkan subtugas terverifikasi dari satu bot ke bot spesialis lain dan catat di tabel delegations + event_log.'
                      : 'Delegate a verified subtask from one bot to another specialist bot with SQLite audit.'}
                  </p>
                </div>

                <form
                  onSubmit={(e) => void handlePokeBot(e)}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center"
                >
                  <select
                    aria-label="From bot"
                    value={pokeFrom}
                    onChange={(e) => setPokeFrom(e.target.value)}
                    className="md:col-span-3 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                  >
                    {bots.map((b) => (
                      <option key={b.id} value={b.id}>
                        Dari: {b.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="To bot"
                    value={pokeTo}
                    onChange={(e) => setPokeTo(e.target.value)}
                    className="md:col-span-3 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                  >
                    {bots.map((b) => (
                      <option key={b.id} value={b.id}>
                        Ke: {b.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    aria-label="Ringkasan tugas delegasi"
                    value={pokeTask}
                    onChange={(e) => setPokeTask(e.target.value)}
                    placeholder="Contoh: Verifikasi migration 0005 & test coverage"
                    className="md:col-span-4 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="submit"
                    disabled={busy || !pokeTask.trim()}
                    className="md:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0 disabled:opacity-45"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    poke_bot
                  </button>
                </form>

                {channelNotice && (
                  <p className="text-xs font-mono text-[var(--status-success)]">{channelNotice}</p>
                )}

                {delegations.length > 0 && (
                  <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                    {delegations.slice(0, 6).map((d) => (
                      <div
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-[var(--text-primary)]">
                            {botName(d.from_bot_id)} → {botName(d.to_bot_id)}
                          </span>
                          <p className="text-[var(--text-secondary)] truncate">{d.task_summary}</p>
                        </div>
                        <span className="font-mono text-[11px] text-[var(--status-success)] shrink-0">
                          {d.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              {/* Create Routine + Live NL Parser */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      {isId
                        ? 'Buat Routine Natural Language (id-ID / en-US)'
                        : 'Create Natural Language Routine'}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Guardrail PRD §9.3: interval minimum 5 menit, maks 50 routine/bot, 300 run/jam global, 200 run/jam per routine, 20 riwayat tersimpan.
                    </p>
                  </div>
                </div>

                <form onSubmit={(e) => void handleCreateRoutine(e)} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">Bot Pelaksana</label>
                      <select
                        value={rtnBotId}
                        onChange={(e) => setRtnBotId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                      >
                        {bots.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">Nama Routine</label>
                      <input
                        type="text"
                        aria-label="Nama Routine"
                        value={rtnName}
                        onChange={(e) => setRtnName(e.target.value)}
                        placeholder="Briefing Senin Pagi"
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">Jenis Trigger</label>
                      <select
                        value={rtnTrigger}
                        onChange={(e) => setRtnTrigger(e.target.value as RoutineTriggerType)}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                      >
                        <option value="cron">Cron / Natural Language (WIB/WITA/WIT)</option>
                        <option value="webhook_hmac">Webhook HMAC-SHA256</option>
                        <option value="github">GitHub Event</option>
                        <option value="linear">Linear Event</option>
                        <option value="slack">Slack Event</option>
                        <option value="sentry">Sentry Alert</option>
                        <option value="x">X Free Trigger</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">
                        {rtnTrigger === 'cron'
                          ? 'Jadwal NL atau Cron 5-field (WIB / WITA / WIT)'
                          : 'Filter Event / Topic'}
                      </label>
                      <input
                        type="text"
                        aria-label="Jadwal Natural Language"
                        value={rtnSchedule}
                        onChange={(e) => setRtnSchedule(e.target.value)}
                        placeholder="Tiap Senin jam 09:30 WITA"
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">Instruksi / Prompt</label>
                      <input
                        type="text"
                        aria-label="Prompt Routine"
                        value={rtnPrompt}
                        onChange={(e) => setRtnPrompt(e.target.value)}
                        placeholder="Ringkas prioritas sprint & status backup R2."
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                  </div>

                  {/* Real-time NL Parser Preview */}
                  {rtnTrigger === 'cron' && parsedPreview && (
                    <div
                      className={`px-3.5 py-2.5 rounded-xl border text-xs font-mono ${
                        parsedPreview.ok
                          ? 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--status-success)]'
                          : 'border-[var(--status-danger)] bg-[var(--bg-canvas)] text-[var(--status-danger)]'
                      }`}
                    >
                      {parsedPreview.ok
                        ? `Cron: ${parsedPreview.cron_expr} · TZ: ${parsedPreview.timezone} (${parsedPreview.tz_label}) — ${parsedPreview.human_summary}`
                        : parsedPreview.error}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {[
                        'Tiap Senin jam 09:30 WITA',
                        'Setiap hari kerja 08:00 WIB',
                        'Setiap 15 menit WIT',
                        'Setiap 2 menit',
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setRtnTrigger('cron');
                            setRtnSchedule(preset);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={busy || !rtnName.trim() || !rtnPrompt.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0 disabled:opacity-45"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {isId ? 'Simpan Routine' : 'Save Routine'}
                    </button>
                  </div>
                </form>

                {routineFeedback && (
                  <p
                    className={`text-xs font-mono ${
                      routineFeedback.ok ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'
                    }`}
                  >
                    {routineFeedback.text}
                  </p>
                )}
              </section>

              {/* Active Routines List */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Daftar Routines Aktif ({routines.length})
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                    Cap: 50/bot · 300/hr global
                  </span>
                </div>

                <div className="space-y-2.5">
                  {routines.map((r) => (
                    <div
                      key={r.id}
                      className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[var(--text-primary)]">{r.name}</span>
                          <span className="font-mono text-[11px] text-[var(--status-success)]">
                            {r.schedule_expr}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                            {r.timezone} · {r.trigger_type}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] break-words">
                          {botName(r.bot_id)} — {r.prompt}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleRunRoutine(r.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3 h-3" />
                          Run Now
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleTestWebhook(r.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0"
                        >
                          <Webhook className="w-3 h-3" />
                          HMAC Test
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await api.toggleRoutine(r.id, !r.enabled);
                            setRoutines(res.routines);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
                        >
                          {r.enabled ? 'ON' : 'OFF'}
                        </button>
                        <button
                          type="button"
                          aria-label={`Hapus routine ${r.name}`}
                          onClick={async () => {
                            const res = await api.deleteRoutine(r.id);
                            setRoutines(res.routines);
                            setRuns(res.runs);
                          }}
                          className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--status-danger)] hover:bg-[var(--bg-surface)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Run History */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[var(--status-success)]" />
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Riwayat Eksekusi Terakhir ({runs.length})
                  </h2>
                </div>
                {runs.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Belum ada eksekusi routine tercatat. Klik Run Now atau HMAC Test untuk menguji.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {runs.slice(0, 8).map((run) => (
                      <div
                        key={run.id}
                        className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-[var(--text-primary)] break-words flex-1 min-w-0">
                          {run.output_summary}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-[var(--status-success)] shrink-0">
                          {run.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
