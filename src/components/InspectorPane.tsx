import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  FolderOpen,
  Layers,
  Palette,
  Pin,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Wrench,
} from 'lucide-react';
import {
  AVATAR_ANIMATIONS,
  WORKING_MOODS,
  type AvatarAnimation,
  type BotAccentMode,
  type BotAvatarSpec,
  type BotRecord,
  type UiLocale,
  type WorkingMood,
} from '../core/types';
import type { InstalledSkillRecord, LoadedSkillResult, SkillActivationMode, StaticScanResult } from '../core/skills';
import type { DesignSystemPreset, ImpeccableAuditResult } from '../core/tools';
import type { MemSearchIndexRow, MemoryObservation } from '../core/memory';
import type { ReviewerVerdict } from '../core/agent';
import { api, type LibraryItemView } from '../lib/api';
import { AvatarStudio } from './AvatarStudio';

interface InspectorPaneProps {
  bot: BotRecord;
  locale: UiLocale;
  accentMode: BotAccentMode;
  virtualCombos: string[];
  libraryItems: LibraryItemView[];
  skills: InstalledSkillRecord[];
  skillIndex: {
    entries: Array<{ slug: string; name: string; mode: SkillActivationMode; summary: string }>;
    estimated_tokens: number;
    within_budget: boolean;
  };
  onUpdateBot: (
    botId: string,
    patch: Partial<Pick<BotRecord, 'name' | 'label' | 'description' | 'avatar_spec' | 'current_mood' | 'routing_target'>>
  ) => Promise<void>;
  onToggleAccentMode: (mode: BotAccentMode) => Promise<void>;
  onSkillsUpdated: (skills: InstalledSkillRecord[]) => void;
  onRefreshBootstrap: () => Promise<void>;
}

function groupChronologically(items: LibraryItemView[], isId: boolean) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const groups: Array<{ label: string; items: LibraryItemView[] }> = [
    { label: isId ? 'Hari ini' : 'Today', items: [] },
    { label: isId ? 'Minggu ini' : 'This week', items: [] },
    { label: isId ? 'Lebih lama' : 'Older', items: [] },
  ];

  for (const item of items) {
    const t = Date.parse(item.created_at);
    const age = Number.isNaN(t) ? 0 : now - t;
    if (age <= dayMs) groups[0].items.push(item);
    else if (age <= 7 * dayMs) groups[1].items.push(item);
    else groups[2].items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

export const InspectorPane: React.FC<InspectorPaneProps> = ({
  bot,
  locale,
  accentMode,
  virtualCombos,
  libraryItems,
  skills,
  skillIndex,
  onUpdateBot,
  onToggleAccentMode,
  onSkillsUpdated,
  onRefreshBootstrap,
}) => {
  const isId = locale === 'id-ID';
  const [tab, setTab] = useState<'details' | 'library' | 'tools'>('details');
  const [librarySub, setLibrarySub] = useState<'skills' | 'files' | 'memory'>('skills');

  // Skills state
  const [skillFilter, setSkillFilter] = useState('');
  const [loadedSkill, setLoadedSkill] = useState<LoadedSkillResult | null>(null);
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [newSkillSlug, setNewSkillSlug] = useState('');
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillMd, setNewSkillMd] = useState('# Custom Skill\nInstruksi kerja terverifikasi.');
  const [installFeedback, setInstallFeedback] = useState<{
    installed: boolean;
    scan: StaticScanResult;
    action_queue_id?: string;
  } | null>(null);

  // Memory 3-step search state
  const [memQuery, setMemQuery] = useState('');
  const [memRows, setMemRows] = useState<MemSearchIndexRow[]>([]);
  const [memDetails, setMemDetails] = useState<MemoryObservation[]>([]);

  // Tools state
  const [impeccableCode, setImpeccableCode] = useState(
    '<div onClick={run} className="bg-gradient-to-r from-purple-500 to-pink-500 border-l-4"><span className="w-2 h-2 rounded-full animate-pulse"></span><h1>// 01_HERO</h1><p>Di era digital saat ini lorem ipsum</p></div>'
  );
  const [impeccableRes, setImpeccableRes] = useState<ImpeccableAuditResult | null>(null);

  const [bm25Query, setBm25Query] = useState('fintech analytics dashboard dark mode');
  const [bm25Res, setBm25Res] = useState<DesignSystemPreset | null>(null);

  const [mmModality, setMmModality] = useState<'image' | 'video' | 'tts' | 'stt' | 'vision'>('image');
  const [mmPrompt, setMmPrompt] = useState('Ilustrasi arsitektur cloud minimalis');
  const [mmUseVox, setMmUseVox] = useState(false);
  const [mmResult, setMmResult] = useState<string | null>(null);

  const [revTool, setRevTool] = useState('shell_exec');
  const [revTarget, setRevTarget] = useState('production-vps');
  const [revSummary, setRevSummary] = useState('deploy release v1.7');
  const [revVerdict, setRevVerdict] = useState<ReviewerVerdict | null>(null);

  const filteredSkills = useMemo(() => {
    const q = skillFilter.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [skills, skillFilter]);

  const chronoGroups = useMemo(() => groupChronologically(libraryItems, isId), [libraryItems, isId]);

  const handleAvatarChange = async (nextSpec: BotAvatarSpec) => {
    await onUpdateBot(bot.id, { avatar_spec: nextSpec });
  };

  const handleSkillMode = async (slug: string, mode: SkillActivationMode) => {
    const res = await api.updateSkillMode(slug, mode);
    onSkillsUpdated(res.skills);
  };

  const handleLoadSkill = async (slug: string) => {
    const res = await api.loadSkill(slug);
    setLoadedSkill(res.data);
  };

  const handleInstallSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillSlug.trim() || !newSkillName.trim()) return;
    const res = await api.installSkill({
      slug: newSkillSlug.trim(),
      name: newSkillName.trim(),
      description: newSkillDesc.trim() || 'Custom skill pack',
      skill_md: newSkillMd,
    });
    setInstallFeedback({
      installed: res.installed,
      scan: res.scan,
      action_queue_id: res.action_queue_id,
    });
    onSkillsUpdated(res.skills);
    if (res.installed) {
      setNewSkillSlug('');
      setNewSkillName('');
      setNewSkillDesc('');
    } else {
      await onRefreshBootstrap();
    }
  };

  const handleMemSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const idx = await api.searchMemoryIndex(memQuery);
    setMemRows(idx.results);
    setMemDetails([]);
  };

  const handleFetchMemDetail = async (id: string) => {
    const res = await api.searchMemoryDetails([id]);
    setMemDetails(res.observations);
  };

  return (
    <aside
      className="flex flex-col h-full bg-[var(--bg-sidebar)] border-l border-[var(--border-subtle)] min-w-0"
      aria-label={isId ? 'Panel Inspektor Bot' : 'Bot Inspector Panel'}
    >
      {/* 3-Tab Header: Details | Library | Tools */}
      <div className="px-3 py-2.5 border-b border-[var(--border-subtle)]">
        <div
          className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
          role="tablist"
          aria-label="Inspector Tabs"
        >
          {(
            [
              { id: 'details', label: isId ? 'Detail' : 'Details', icon: Sliders },
              { id: 'library', label: isId ? 'Pustaka' : 'Library', icon: FolderOpen },
              { id: 'tools', label: isId ? 'Alat' : 'Tools', icon: Wrench },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  tab === item.id
                    ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {tab === 'details' && (
          <>
            {/* Bot Identity Summary */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {bot.name}
                </h2>
                {bot.is_chief_of_staff && (
                  <span className="text-[11px] font-medium text-[#f0b429] whitespace-nowrap shrink-0">
                    Chief of Staff
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {bot.description || bot.label}
              </p>
            </div>

            {/* Dynamic Bot Accent Color Toggle */}
            <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {isId ? 'Warna Aksen Bot' : 'Bot Accent Color'}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {accentMode === 'bot_color' ? '1:1 Bot color' : 'Black'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleAccentMode('bot_color')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    accentMode === 'bot_color'
                      ? 'border-[var(--text-primary)] bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                  }`}
                >
                  Bot color
                </button>
                <button
                  type="button"
                  onClick={() => onToggleAccentMode('black')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    accentMode === 'black'
                      ? 'border-[var(--text-primary)] bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                  }`}
                >
                  Black
                </button>
              </div>
            </div>

            {/* Working Mood & Animation State */}
            <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
              <div>
                <label
                  htmlFor="inspector-mood-select"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  {isId ? 'Mood Kerja Langsung (6)' : 'Live Working Mood (6)'}
                </label>
                <div className="grid grid-cols-3 gap-1.5" id="inspector-mood-select">
                  {WORKING_MOODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onUpdateBot(bot.id, { current_mood: m as WorkingMood })}
                      className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium capitalize transition-colors ${
                        bot.current_mood === m
                          ? 'border-[var(--text-primary)] bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="inspector-anim-override"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  {isId ? 'Pratinjau Animasi SVG (15)' : 'SVG Animation Preview (15)'}
                </label>
                <select
                  id="inspector-anim-override"
                  value={bot.avatar_spec.animationOverride ?? ''}
                  onChange={(e) =>
                    onUpdateBot(bot.id, {
                      avatar_spec: {
                        ...bot.avatar_spec,
                        animationOverride: (e.target.value || null) as AvatarAnimation | null,
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                >
                  <option value="">{isId ? 'Otomatis ikuti Mood' : 'Auto follow Mood'}</option>
                  {AVATAR_ANIMATIONS.map((anim) => (
                    <option key={anim} value={anim}>
                      {anim}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="inspector-routing-target"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  {isId ? 'Target Routing OmniRoute' : 'OmniRoute Routing Target'}
                </label>
                <select
                  id="inspector-routing-target"
                  value={bot.routing_target}
                  onChange={(e) => onUpdateBot(bot.id, { routing_target: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                >
                  {virtualCombos.map((combo) => (
                    <option key={combo} value={combo}>
                      {combo}
                    </option>
                  ))}
                  <option value="voxcpm2-cloud">voxcpm2-cloud</option>
                </select>
              </div>
            </div>

            {/* Embedded 3-Tab Avatar Studio */}
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Palette className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                  Avatar Studio
                </h3>
              </div>
              <AvatarStudio
                spec={bot.avatar_spec}
                isChiefOfStaff={bot.is_chief_of_staff}
                locale={locale}
                onChange={handleAvatarChange}
                compact
              />
            </div>
          </>
        )}

        {tab === 'library' && (
          <div className="space-y-4">
            {/* Sub-tabs: Skills (23) | Files | Memory */}
            <div className="flex items-center gap-1 border-b border-[var(--border-subtle)] pb-2">
              {(
                [
                  { id: 'skills', label: `Skills (${skills.length})` },
                  { id: 'files', label: isId ? `Berkas (${libraryItems.length})` : `Files (${libraryItems.length})` },
                  { id: 'memory', label: 'Memory' },
                ] as const
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setLibrarySub(sub.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    librarySub === sub.id
                      ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {librarySub === 'skills' && (
              <div className="space-y-3">
                {/* Layer 1 Token Budget Telemetry */}
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--text-primary)]">
                      {isId ? 'Indeks Progressive Disclosure' : 'Progressive Disclosure Index'}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--status-success)]">
                      {skillIndex.estimated_tokens} / 1500 tok
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {isId
                      ? '23 skill permanen terpasang dengan verifikasi SHA-256 runtime dan pengecualian Caveman.'
                      : '23 permanent skills installed with runtime SHA-256 verification and Caveman exemption.'}
                  </p>
                </div>

                {/* Filter + Add Custom Skill */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      aria-label={isId ? 'Cari skill' : 'Filter skills'}
                      value={skillFilter}
                      onChange={(e) => setSkillFilter(e.target.value)}
                      placeholder={isId ? 'Cari 23 skill...' : 'Filter 23 skills...'}
                      className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowInstallForm((v) => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {isId ? 'Pasang' : 'Install'}
                  </button>
                </div>

                {/* Custom Skill Install + Pre-Install Static Scanner */}
                {showInstallForm && (
                  <form
                    onSubmit={handleInstallSkill}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-2.5"
                  >
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {isId ? 'Pasang Skill Kustom (Static Scanner)' : 'Install Custom Skill (Static Scanner)'}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        aria-label="Skill slug"
                        placeholder="slug-skill"
                        value={newSkillSlug}
                        onChange={(e) => setNewSkillSlug(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                      />
                      <input
                        type="text"
                        aria-label="Skill name"
                        placeholder={isId ? 'Nama skill' : 'Skill name'}
                        value={newSkillName}
                        onChange={(e) => setNewSkillName(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      />
                    </div>
                    <input
                      type="text"
                      aria-label="Skill description"
                      placeholder={isId ? 'Deskripsi singkat' : 'Short description'}
                      value={newSkillDesc}
                      onChange={(e) => setNewSkillDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                    />
                    <textarea
                      rows={3}
                      aria-label="SKILL.md content"
                      value={newSkillMd}
                      onChange={(e) => setNewSkillMd(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                    />
                    <button
                      type="submit"
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium"
                    >
                      {isId ? 'Pindai & Pasang Skill' : 'Scan & Install Skill'}
                    </button>
                    {installFeedback && (
                      <div className="text-xs pt-1 space-y-1">
                        <p
                          className={
                            installFeedback.installed
                              ? 'text-[var(--status-success)] font-medium'
                              : 'text-[var(--status-danger)] font-medium'
                          }
                        >
                          {installFeedback.installed
                            ? isId
                              ? 'Lolos Static Scanner & terpasang dengan SHA-256.'
                              : 'Passed Static Scanner & installed with SHA-256.'
                            : isId
                              ? `Ditahan oleh Static Scanner (${installFeedback.scan.risk_level}) -> masuk Perlu Perhatian.`
                              : `Quarantined by Static Scanner (${installFeedback.scan.risk_level}) -> queued in Action Queue.`}
                        </p>
                        {installFeedback.scan.findings.map((f, i) => (
                          <p key={i} className="text-[11px] font-mono text-[var(--text-secondary)]">
                            {f.rule}: {f.detail}
                          </p>
                        ))}
                      </div>
                    )}
                  </form>
                )}

                {/* Layer 2 Loaded SKILL.md Preview */}
                {loadedSkill && (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        Layer 2: {loadedSkill.slug}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLoadedSkill(null)}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {isId ? 'Tutup' : 'Close'}
                      </button>
                    </div>
                    {loadedSkill.ok ? (
                      <>
                        <div className="text-[11px] font-mono tabular-nums text-[var(--status-success)] flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">SHA-256 {loadedSkill.sha256?.slice(0, 16)}... · Caveman exempt</span>
                        </div>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap text-[var(--text-secondary)] bg-[var(--bg-surface)] p-2 rounded-lg max-h-40 overflow-y-auto">
                          {loadedSkill.skill_md}
                        </pre>
                      </>
                    ) : (
                      <p className="text-xs text-[var(--status-danger)] flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {loadedSkill.error}
                      </p>
                    )}
                  </div>
                )}

                {/* Skills List */}
                <div className="space-y-2">
                  {filteredSkills.map((sk) => (
                    <div
                      key={sk.slug}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {sk.name}
                          </p>
                          <p className="text-[11px] text-[var(--text-secondary)] font-mono truncate">
                            {sk.slug} · v{sk.version} · {sk.category === 'curated_pack' ? 'curated' : sk.category}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLoadSkill(sk.slug)}
                          className="text-[11px] font-medium text-[var(--status-attention)] hover:underline whitespace-nowrap shrink-0"
                        >
                          SKILL.md
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-snug line-clamp-2">
                        {sk.description}
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[10px] font-mono tabular-nums text-[var(--text-secondary)] truncate">
                          sha256:{sk.sha256.slice(0, 10)}
                        </span>
                        <select
                          aria-label={`Activation mode for ${sk.slug}`}
                          value={sk.activation_mode}
                          onChange={(e) =>
                            handleSkillMode(sk.slug, e.target.value as SkillActivationMode)
                          }
                          className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-primary)]"
                        >
                          <option value="auto">auto</option>
                          <option value="always_on">always_on</option>
                          <option value="manual_only">manual_only</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {librarySub === 'files' && (
              <div className="space-y-4">
                {chronoGroups.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {isId ? 'Belum ada berkas di Library.' : 'No files in Library yet.'}
                  </p>
                ) : (
                  chronoGroups.map((group) => (
                    <div key={group.label} className="space-y-1.5">
                      <h3 className="text-[11px] font-semibold text-[var(--text-secondary)]">
                        {group.label}
                      </h3>
                      <div className="space-y-1.5">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                                {item.title}
                              </p>
                              <p className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                                {item.kind} · {(item.size_bytes / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            {item.pinned && (
                              <Pin className="w-3.5 h-3.5 text-[var(--status-warning)] shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {librarySub === 'memory' && (
              <div className="space-y-3">
                <form onSubmit={handleMemSearch} className="flex gap-1.5">
                  <input
                    type="text"
                    aria-label="Search qyro-memory"
                    value={memQuery}
                    onChange={(e) => setMemQuery(e.target.value)}
                    placeholder={isId ? 'Cari qyro-memory (3-step)...' : 'Search qyro-memory (3-step)...'}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    {isId ? 'Cari' : 'Search'}
                  </button>
                </form>

                {memRows.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Step 1 Index ({memRows.length}) — {isId ? 'klik item untuk Step 3 Detail' : 'click for Step 3 Details'}
                    </p>
                    {memRows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => handleFetchMemDetail(row.id)}
                        className="w-full text-left p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] space-y-0.5"
                      >
                        <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {row.title}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                          {row.kind} · ~{row.estimated_tokens} tok
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {memDetails.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                    <p className="text-[11px] font-semibold text-[var(--text-primary)]">
                      Step 3 Full Observation
                    </p>
                    {memDetails.map((obs) => (
                      <div
                        key={obs.id}
                        className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1"
                      >
                        <p className="text-xs font-semibold text-[var(--text-primary)]">{obs.title}</p>
                        <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                          {obs.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'tools' && (
          <div className="space-y-5">
            {/* 1. Impeccable 62-Rule Anti-AI-Slop Detector */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--status-success)]" />
                  Impeccable 62-Rule Audit
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                  0 LLM tok
                </span>
              </div>
              <textarea
                rows={3}
                aria-label="Source snippet for Impeccable 62-rule audit"
                value={impeccableCode}
                onChange={(e) => setImpeccableCode(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-mono text-[var(--text-primary)]"
              />
              <button
                type="button"
                onClick={async () => setImpeccableRes(await api.runImpeccable(impeccableCode))}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium"
              >
                {isId ? 'Jalankan Audit 62 Aturan' : 'Run 62-Rule Audit'}
              </button>
              {impeccableRes && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-mono tabular-nums text-[11px]">
                    <span>
                      {impeccableRes.rules_evaluated} rules · {impeccableRes.violation_count}{' '}
                      {isId ? 'temuan' : 'findings'}
                    </span>
                    <span
                      className={
                        impeccableRes.passed
                          ? 'text-[var(--status-success)]'
                          : 'text-[var(--status-danger)]'
                      }
                    >
                      {impeccableRes.passed ? 'PASS' : `H:${impeccableRes.by_severity.high} M:${impeccableRes.by_severity.medium}`}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {impeccableRes.findings.slice(0, 6).map((f) => (
                      <div key={f.rule_id} className="text-[11px] border-t border-[var(--border-subtle)] pt-1">
                        <span className="font-mono font-semibold text-[var(--text-primary)]">
                          {f.rule_id}
                        </span>{' '}
                        <span className="text-[var(--text-secondary)]">({f.severity}) — {f.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* 2. UI-UX-Pro-Max BM25 Design System Generator */}
            <section className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  UI-UX-Pro-Max BM25
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                  0 LLM tok
                </span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  aria-label="Design system domain query"
                  value={bm25Query}
                  onChange={(e) => setBm25Query(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const res = await api.runUiUxBm25(bm25Query);
                    setBm25Res(res.best_match);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium whitespace-nowrap shrink-0"
                >
                  BM25
                </button>
              </div>
              {bm25Res && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 space-y-1.5 text-xs">
                  <p className="font-semibold text-[var(--text-primary)]">{bm25Res.domain}</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">{bm25Res.ui_style}</p>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    {[bm25Res.palette.canvas, bm25Res.palette.surface, bm25Res.palette.accent].map(
                      (hex) => (
                        <span
                          key={hex}
                          className="inline-flex items-center gap-1 text-[10px] font-mono tabular-nums text-[var(--text-secondary)]"
                        >
                          <span
                            className="w-3 h-3 rounded border border-[var(--border-subtle)] inline-block"
                            style={{ backgroundColor: hex }}
                          />
                          {hex}
                        </span>
                      )
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-[var(--text-secondary)]">
                    {bm25Res.font_pairing.display} + {bm25Res.font_pairing.mono}
                  </p>
                </div>
              )}
            </section>

            {/* 3. Multimodal Cloud Dispatcher */}
            <section className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
              <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                {isId ? 'Dispatcher Multimodal Cloud' : 'Multimodal Cloud Dispatcher'}
              </h3>
              <div className="grid grid-cols-5 gap-1">
                {(['image', 'video', 'tts', 'stt', 'vision'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMmModality(m)}
                    className={`py-1 rounded-md border text-[11px] font-medium uppercase ${
                      mmModality === m
                        ? 'border-[var(--text-primary)] bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {mmModality === 'tts' && (
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={mmUseVox}
                    onChange={(e) => setMmUseVox(e.target.checked)}
                  />
                  <span>voxcpm2-cloud (explicit UNSET guard)</span>
                </label>
              )}
              <input
                type="text"
                aria-label="Multimodal prompt"
                value={mmPrompt}
                onChange={(e) => setMmPrompt(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  const res = await api.runMultimodal({
                    bot_id: bot.id,
                    modality: mmModality,
                    prompt: mmPrompt,
                    use_voxcpm2: mmUseVox,
                  });
                  if (res.data.ok) {
                    setMmResult(
                      `Job ${res.data.job_id} (${res.data.status}) via ${res.data.decision.selected_provider?.name}`
                    );
                  } else {
                    setMmResult(
                      `Blocked: ${res.data.decision.error_message ?? 'Route unavailable'}`
                    );
                  }
                }}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium"
              >
                {isId ? 'Jalankan Route Multimodal' : 'Dispatch Cloud Job'}
              </button>
              {mmResult && (
                <p className="text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg p-2">
                  {mmResult}
                </p>
              )}
            </section>

            {/* 4. 2-Layer Reviewer Agent Tester */}
            <section className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
              <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                {isId ? 'Uji Reviewer Agent (2-Layer)' : 'Test Reviewer Agent (2-Layer)'}
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  aria-label="Reviewer tool"
                  value={revTool}
                  onChange={(e) => setRevTool(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
                />
                <input
                  type="text"
                  aria-label="Reviewer target"
                  value={revTarget}
                  onChange={(e) => setRevTarget(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
                />
              </div>
              <input
                type="text"
                aria-label="Reviewer action summary"
                value={revSummary}
                onChange={(e) => setRevSummary(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              />
              <button
                type="button"
                onClick={async () =>
                  setRevVerdict(
                    await api.evaluateReviewer({
                      tool: revTool,
                      target: revTarget,
                      summary: revSummary,
                    })
                  )
                }
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium"
              >
                {isId ? 'Evaluasi Kebijakan' : 'Evaluate Policy'}
              </button>
              {revVerdict && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-semibold uppercase text-[var(--text-primary)]">
                      {revVerdict.decision}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {revVerdict.layer} · risk:{revVerdict.risk}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)]">{revVerdict.reason}</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </aside>
  );
};
