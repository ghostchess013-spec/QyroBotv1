import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  Bell,
  Binary,
  Bot,
  Brain,
  Check,
  Database,
  FileCode2,
  Hash,
  KeyRound,
  MessageSquare,
  Monitor,
  Moon,
  Network,
  Package,
  PanelRight,
  Plus,
  QrCode,
  Send,
  Settings2,
  Shield,
  Sliders,
  Sun,
  X,
} from 'lucide-react';
import { api, type BootstrapResponse } from './lib/api';
import type {
  BotAccentMode,
  BotAvatarSpec,
  BotRecord,
  UiLocale,
  UserPreferences,
  WorkingMood,
} from './core/types';
import type { ChatMessageRecord } from './core/agent';
import { QyroBotAvatar, getAvatarColorDef } from './components/QyroBotAvatar';
import { DraftCard } from './components/DraftCard';
import { InspectorPane } from './components/InspectorPane';
import { OnboardingWizard } from './components/OnboardingWizard';
import { CreateBotModal } from './components/CreateBotModal';
import { OverviewPanel } from './components/OverviewPanel';
import { RouterPanel } from './components/RouterPanel';
import { CompressionPanel } from './components/CompressionPanel';
import { VaultPanel } from './components/VaultPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { BackupPanel } from './components/BackupPanel';
import { ComputerPanel } from './components/ComputerPanel';
import { ReaMcpPanel } from './components/ReaMcpPanel';
import { PairingDevicesPanel } from './components/PairingDevicesPanel';
import { XBridgePanel } from './components/XBridgePanel';
import { ChannelsRoutinesPanel } from './components/ChannelsRoutinesPanel';
import { EcosystemOpsPanel } from './components/EcosystemOpsPanel';

type CoreTab = 'overview' | 'router' | 'compression' | 'vault' | 'memory' | 'backup';
type WorkspaceView =
  | 'chat'
  | 'action_queue'
  | 'core'
  | 'computer'
  | 'mcp'
  | 'pairing'
  | 'x_bridge'
  | 'channels_routines'
  | 'ecosystem_ops';
type MobileTab = 'bots' | 'chat' | 'computer' | 'inspector' | 'queue';

const CORE_TABS: Array<{ id: CoreTab; i18nKey: string; icon: typeof Database }> = [
  { id: 'overview', i18nKey: 'nav-overview', icon: Database },
  { id: 'router', i18nKey: 'nav-router', icon: Network },
  { id: 'compression', i18nKey: 'nav-compression', icon: FileCode2 },
  { id: 'vault', i18nKey: 'nav-vault', icon: KeyRound },
  { id: 'memory', i18nKey: 'nav-memory', icon: Brain },
  { id: 'backup', i18nKey: 'nav-backup', icon: Archive },
];

const SLASH_COMMANDS = [
  { cmd: '/draft-x', descId: 'Buat Interactive Draft Card utasan X + Humanizer', descEn: 'Create interactive X post draft card + Humanizer' },
  { cmd: '/draft-email', descId: 'Buat Interactive Draft Card email', descEn: 'Create interactive email draft card' },
  { cmd: '/impeccable', descId: 'Audit anti-AI-slop 62 aturan (0 token LLM)', descEn: 'Run 62-rule anti-AI-slop audit (0 LLM tokens)' },
  { cmd: '/ui-ux', descId: 'Generator design system BM25 (0 token LLM)', descEn: 'Run BM25 design system generator (0 LLM tokens)' },
  { cmd: '/humanizer', descId: 'Bersihkan pola prosa AI dengan Humanizer v4', descEn: 'Clean AI prose clichés with Humanizer v4' },
  { cmd: '/briefing', descId: 'Ringkasan harian Chief of Staff (WIB)', descEn: 'Chief of Staff daily briefing' },
  { cmd: '/research', descId: 'Riset terstruktur multi-sumber', descEn: 'Multi-source structured research' },
];

function moodSubtitle(mood: WorkingMood, isId: boolean): string {
  switch (mood) {
    case 'thinking':
      return isId ? 'Sedang berpikir...' : 'Thinking...';
    case 'working':
      return isId ? 'Menjalankan alat...' : 'Working on tasks...';
    case 'waiting':
      return isId ? 'Menunggu konfirmasimu' : 'Needs your input';
    case 'blocked':
      return isId ? 'Terhambat kebijakan' : 'Blocked by policy';
    case 'done':
      return isId ? 'Selesai & siap' : 'Done & ready';
    default:
      return isId ? 'Siap membantu' : 'Idle · ready';
  }
}

function renderFormattedText(content: string) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-[var(--text-primary)]">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) return <div key={lineIdx} className="h-1" />;
        const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <p key={lineIdx} className="break-words">
            {tokens.map((tok, i) => {
              if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
                return (
                  <strong key={i} className="font-semibold text-[var(--text-primary)]">
                    {tok.slice(2, -2)}
                  </strong>
                );
              }
              if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
                return (
                  <code
                    key={i}
                    className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                  >
                    {tok.slice(1, -1)}
                  </code>
                );
              }
              return <React.Fragment key={i}>{tok}</React.Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true);

  const [selectedBotId, setSelectedBotId] = useState<string>('bot-chief-of-staff');
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('chat');
  const [coreTab, setCoreTab] = useState<CoreTab>('overview');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);

  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [draftBusyId, setDraftBusyId] = useState<string | null>(null);
  const [lastTelemetry, setLastTelemetry] = useState<{
    provider_id: string;
    model: string;
    tier: string;
    savings_pct: number;
    cost_usd: number;
    active_skills: string[];
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const autostartBypass = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  }, []);

  const loadBootstrap = useCallback(async () => {
    try {
      const res = await api.bootstrap();
      setData(res);
      setError(null);
      const isDark = res.preferences.theme_mode !== 'light';
      setDarkMode(isDark);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.lang = res.preferences.ui_locale === 'en-US' ? 'en' : 'id';
      setSelectedBotId((prev) =>
        res.bots.some((b) => b.id === prev) ? prev : (res.bots[0]?.id ?? 'bot-chief-of-staff')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat QyroBot');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const loadMessages = useCallback(async (botId: string) => {
    try {
      const res = await api.listMessages(botId);
      setMessages(res.messages);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (!data || !selectedBotId) return;
    void loadMessages(selectedBotId);
  }, [data?.bots.length, selectedBotId, loadMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  // Keyboard shortcut Cmd/Ctrl+N to create new bot
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setCreateModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const t = useCallback(
    (key: string) => data?.i18n.bundle[key] ?? key,
    [data]
  );

  const handleUpdatePreferences = async (patch: Partial<UserPreferences>) => {
    if (!data) return;
    const res = await api.updatePreferences(patch);
    if (patch.ui_locale) {
      document.documentElement.lang = patch.ui_locale === 'en-US' ? 'en' : 'id';
    }
    if (patch.theme_mode) {
      const isDark = patch.theme_mode !== 'light';
      setDarkMode(isDark);
      document.documentElement.classList.toggle('dark', isDark);
    }
    setData({
      ...data,
      preferences: res.preferences,
      i18n: {
        ...data.i18n,
        locale: res.preferences.ui_locale,
        bundle: res.bundle,
      },
    });
  };

  const handleThemeToggle = async () => {
    const nextDark = !darkMode;
    await handleUpdatePreferences({ theme_mode: nextDark ? 'dark' : 'light' });
  };

  const handleLocaleChange = async (locale: UiLocale) => {
    await handleUpdatePreferences({ ui_locale: locale });
  };

  const handleToggleFreeOnly = async (enabled: boolean) => {
    await handleUpdatePreferences({ free_only_mode: enabled });
  };

  const handleToggleAccentMode = async (mode: BotAccentMode) => {
    await handleUpdatePreferences({ bot_accent_mode: mode });
  };

  const handleUpdateBot = async (
    botId: string,
    patch: Partial<
      Pick<BotRecord, 'name' | 'label' | 'description' | 'avatar_spec' | 'current_mood' | 'routing_target'>
    >
  ) => {
    if (!data) return;
    const res = await api.updateBot(botId, patch);
    setData({ ...data, bots: res.bots });
  };

  const handleCreateBot = async (payload: {
    name: string;
    label: string;
    description: string;
    avatar_spec: BotAvatarSpec;
    routing_target: string;
  }) => {
    if (!data) return;
    const res = await api.createBot(payload);
    setData({ ...data, bots: res.bots });
    setSelectedBotId(res.bot.id);
    setWorkspaceView('chat');
    setMobileTab('chat');
  };

  const handleSendMessage = async (textOverride?: string) => {
    if (!data || sending) return;
    const text = (textOverride ?? composerText).trim();
    if (!text) return;
    setSending(true);
    if (!textOverride) setComposerText('');
    try {
      const res = await api.sendMessage(selectedBotId, text);
      setMessages(res.messages);
      setLastTelemetry(res.telemetry);
      setData((prev) =>
        prev
          ? {
              ...prev,
              bots: res.bots,
              action_queue: res.action_queue,
              stats: res.stats,
            }
          : prev
      );
    } finally {
      setSending(false);
    }
  };

  const handleDraftAction = async (
    messageId: string,
    action: 'edit' | 'humanize' | 'approve_send' | 'save' | 'discard',
    patch?: { to?: string; subject?: string; body?: string }
  ) => {
    setDraftBusyId(messageId);
    try {
      const res = await api.mutateDraft(messageId, action, patch);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? res.message : m)));
      setData((prev) =>
        prev
          ? {
              ...prev,
              bots: res.bots,
              stats: res.stats,
            }
          : prev
      );
    } finally {
      setDraftBusyId(null);
    }
  };

  const handleResolveAction = async (id: string, decision: 'approved' | 'denied') => {
    await api.resolveAction(id, decision);
    await loadBootstrap();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center p-6">
        <p className="text-sm text-[var(--text-secondary)]">Memuat ruang kerja QyroBot...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-3">
          <h1 className="text-base font-semibold text-[var(--status-danger)]">Koneksi Backend Gagal</h1>
          <p className="text-xs text-[var(--text-secondary)]">{error ?? 'Server tidak merespons.'}</p>
          <button
            type="button"
            onClick={() => void loadBootstrap()}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)]"
          >
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  const isId = data.preferences.ui_locale === 'id-ID';
  const chiefBot = data.bots.find((b) => b.is_chief_of_staff) ?? data.bots[0];
  const specialistBots = data.bots.filter((b) => !b.is_chief_of_staff);
  const activeBot = data.bots.find((b) => b.id === selectedBotId) ?? chiefBot;
  const activeColor = getAvatarColorDef(activeBot.avatar_spec.color);
  const accentMode = data.preferences.bot_accent_mode;
  const pendingActions = data.action_queue.filter((a) => a.status === 'pending');

  // First-Run 4-Step Onboarding Wizard (bypassed with ?autostart=1)
  const shouldShowOnboarding =
    forceOnboarding || (!data.preferences.onboarding_completed && !autostartBypass);

  if (shouldShowOnboarding) {
    return (
      <OnboardingWizard
        preferences={data.preferences}
        chiefBot={chiefBot}
        onUpdatePreferences={handleUpdatePreferences}
        onUpdateChiefAvatar={(spec) => handleUpdateBot(chiefBot.id, { avatar_spec: spec })}
        onComplete={async (starterPrompt) => {
          await handleUpdatePreferences({ onboarding_completed: true });
          setForceOnboarding(false);
          setSelectedBotId(chiefBot.id);
          setWorkspaceView('chat');
          if (starterPrompt) {
            setTimeout(() => void handleSendMessage(starterPrompt), 50);
          }
        }}
      />
    );
  }

  const showSlashPopup = composerText.startsWith('/');
  const matchingSlashCommands = showSlashPopup
    ? SLASH_COMMANDS.filter((s) =>
        s.cmd.toLowerCase().includes(composerText.trim().toLowerCase())
      )
    : [];

  const userBubbleStyle: React.CSSProperties =
    accentMode === 'bot_color'
      ? {
          backgroundColor: darkMode ? activeColor.tintDark : activeColor.tintLight,
          borderColor: activeColor.hex,
        }
      : {};

  const sendBtnStyle: React.CSSProperties | undefined =
    accentMode === 'bot_color'
      ? { backgroundColor: activeColor.hex, color: activeColor.eyeHex }
      : undefined;

  const starterCards = isId
    ? [
        { title: 'Utasan X + Humanizer', prompt: '/draft-x' },
        { title: 'Draf Email Tim', prompt: '/draft-email' },
        { title: 'Audit UI 62-Aturan', prompt: '/impeccable' },
        { title: 'Design System BM25', prompt: '/ui-ux fintech analytics dark mode' },
      ]
    : [
        { title: 'X Post + Humanizer', prompt: '/draft-x' },
        { title: 'Team Email Draft', prompt: '/draft-email' },
        { title: '62-Rule UI Audit', prompt: '/impeccable' },
        { title: 'BM25 Design System', prompt: '/ui-ux fintech analytics dark mode' },
      ];

  const renderSidebar = () => (
    <aside
      aria-label="QyroBot Bot Sidebar"
      className="w-full lg:w-[260px] shrink-0 h-full bg-[var(--bg-sidebar)] lg:border-r border-[var(--border-subtle)] flex flex-col"
    >
      {/* Top Brand + New Bot (+) */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
            QyroBot
          </span>
          <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
            v1.7
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          aria-label={isId ? 'Buat bot baru' : 'Create new bot'}
          title="Cmd/Ctrl+N"
          className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)]"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Unified Action Queue Entry */}
      <div className="p-3 border-b border-[var(--border-subtle)] shrink-0">
        <button
          type="button"
          onClick={() => {
            setWorkspaceView('action_queue');
            setMobileTab('queue');
          }}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
            workspaceView === 'action_queue'
              ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
              : 'bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
          }`}
        >
          <span className="inline-flex items-center gap-2 truncate">
            <Bell className="w-3.5 h-3.5 text-[var(--status-attention)] shrink-0" />
            <span className="truncate">{isId ? 'Perlu Perhatian' : 'Needs Attention'}</span>
          </span>
          <span
            className={`font-mono tabular-nums text-xs ${
              pendingActions.length > 0
                ? 'text-[var(--status-warning)] font-semibold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {pendingActions.length}
          </span>
        </button>
      </div>

      {/* Bots List: Pinned Chief of Staff + Specialist Bots */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Pinned Chief of Staff */}
        <div className="space-y-1">
          <p className="px-2 text-[11px] font-medium text-[var(--text-secondary)]">
            {isId ? 'Disematkan' : 'Pinned'}
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedBotId(chiefBot.id);
              setWorkspaceView('chat');
              setMobileTab('chat');
            }}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
              workspaceView === 'chat' && activeBot.id === chiefBot.id
                ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                : 'hover:bg-[var(--bg-surface)] text-[var(--text-primary)]'
            }`}
          >
            <QyroBotAvatar
              spec={chiefBot.avatar_spec}
              mood={chiefBot.current_mood}
              size={36}
              isChiefOfStaff
              label={chiefBot.name}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {chiefBot.name}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] truncate">
                {moodSubtitle(chiefBot.current_mood, isId)}
              </p>
            </div>
          </button>
        </div>

        {/* Specialist Bots */}
        <div className="space-y-1">
          <div className="px-2 flex items-center justify-between">
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">
              {isId ? 'Bot Spesialis' : 'Specialist Bots'}
            </p>
            <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
              {specialistBots.length}
            </span>
          </div>
          {specialistBots.map((bot) => {
            const active = workspaceView === 'chat' && activeBot.id === bot.id;
            return (
              <button
                key={bot.id}
                type="button"
                onClick={() => {
                  setSelectedBotId(bot.id);
                  setWorkspaceView('chat');
                  setMobileTab('chat');
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                  active
                    ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                    : 'hover:bg-[var(--bg-surface)] text-[var(--text-primary)]'
                }`}
              >
                <QyroBotAvatar
                  spec={bot.avatar_spec}
                  mood={bot.current_mood}
                  size={34}
                  label={bot.name}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {bot.name}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    {moodSubtitle(bot.current_mood, isId)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Phase 3: Sandbox Computer, REA MCP & Ed25519 QR Pairing */}
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
          <p className="px-2 text-[11px] font-medium text-[var(--text-secondary)]">
            {isId ? 'Sandbox & Perangkat' : 'Sandbox & Devices'}
          </p>
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('computer');
              setMobileTab('computer');
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
              workspaceView === 'computer'
                ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Computer & Browser</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('mcp');
              setMobileTab('chat');
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
              workspaceView === 'mcp'
                ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Binary className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">REA MCP Bridge</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('pairing');
              setMobileTab('chat');
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
              workspaceView === 'pairing'
                ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isId ? 'Perangkat & QR' : 'Devices & QR'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('x_bridge');
              setMobileTab('chat');
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
              workspaceView === 'x_bridge'
                ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">X Bridge & Shield</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('channels_routines');
              setMobileTab('chat');
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
              workspaceView === 'channels_routines'
                ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Hash className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Channels & Routines</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('ecosystem_ops');
              setMobileTab('chat');
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
              workspaceView === 'ecosystem_ops'
                ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isId ? 'Ekosistem & RBAC' : 'Ecosystem & RBAC'}</span>
          </button>
        </div>

        {/* Phase 1 Core Console Drawer Entry */}
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
          <p className="px-2 text-[11px] font-medium text-[var(--text-secondary)]">
            {isId ? 'Sistem Inti' : 'Core Engine'}
          </p>
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('core');
              setMobileTab('chat');
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
              workspaceView === 'core'
                ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {isId ? 'Router, Vault & Backup' : 'Router, Vault & Backup'}
            </span>
          </button>
        </div>
      </nav>

      {/* Bottom Controls: Locale, Theme, Onboarding */}
      <div className="p-3 border-t border-[var(--border-subtle)] space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Language switcher"
            className="flex items-center p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            <button
              type="button"
              onClick={() => void handleLocaleChange('id-ID')}
              aria-pressed={data.preferences.ui_locale === 'id-ID'}
              className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 ${
                data.preferences.ui_locale === 'id-ID'
                  ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              id-ID
            </button>
            <button
              type="button"
              onClick={() => void handleLocaleChange('en-US')}
              aria-pressed={data.preferences.ui_locale === 'en-US'}
              className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 ${
                data.preferences.ui_locale === 'en-US'
                  ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              en-US
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleThemeToggle()}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)]"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setForceOnboarding(true)}
            className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
          >
            Wizard
          </button>
        </div>
      </div>
    </aside>
  );

  const renderActionQueueView = () => (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8">
      <div className="max-w-[780px] mx-auto space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              {isId ? 'Perlu Perhatian (Unified Action Queue)' : 'Needs Attention (Unified Action Queue)'}
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {isId
                ? 'Semua persetujuan Reviewer Agent, skill mencurigakan, dan aksi tulis eksternal berkumpul di sini.'
                : 'All Reviewer Agent approvals, quarantined skills, and external write requests appear here.'}
            </p>
          </div>
          <span className="font-mono tabular-nums text-xs text-[var(--text-secondary)]">
            {pendingActions.length} pending
          </span>
        </div>

        {data.action_queue.length === 0 ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center text-xs text-[var(--text-secondary)]">
            {isId ? 'Tidak ada antrean tindakan saat ini.' : 'No action items in queue.'}
          </div>
        ) : (
          <div className="space-y-3">
            {data.action_queue.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-primary)] truncate">
                      {String(item.payload.title ?? item.kind)}
                    </span>
                    <span className="text-[var(--text-secondary)]">·</span>
                    <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                      {item.kind}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {String(item.payload.summary ?? '')}
                  </p>
                </div>

                {item.status === 'pending' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleResolveAction(item.id, 'approved')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isId ? 'Setujui' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolveAction(item.id, 'denied')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--status-danger)] whitespace-nowrap shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                      {isId ? 'Tolak' : 'Deny'}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-mono text-[var(--status-success)] shrink-0">
                    {item.status} ({String(item.payload.decision ?? 'done')})
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderCoreConsoleView = () => (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      <div className="px-4 sm:px-6 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex items-center gap-1.5 overflow-x-auto shrink-0">
        {CORE_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCoreTab(item.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                coreTab === item.id
                  ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(item.i18nKey)}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-[1100px] mx-auto">
          {coreTab === 'overview' && (
            <OverviewPanel data={data} t={t} onRefresh={loadBootstrap} />
          )}
          {coreTab === 'router' && (
            <RouterPanel
              data={data}
              t={t}
              onToggleFreeOnly={handleToggleFreeOnly}
              onRefresh={loadBootstrap}
            />
          )}
          {coreTab === 'compression' && <CompressionPanel t={t} />}
          {coreTab === 'vault' && (
            <VaultPanel data={data} t={t} onRefresh={loadBootstrap} />
          )}
          {coreTab === 'memory' && (
            <MemoryPanel data={data} t={t} onRefresh={loadBootstrap} />
          )}
          {coreTab === 'backup' && (
            <BackupPanel data={data} t={t} onRefresh={loadBootstrap} />
          )}
        </div>
      </div>
    </div>
  );

  const renderChatStage = () => (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[var(--bg-canvas)]">
      {/* Top Chat Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <QyroBotAvatar
            spec={activeBot.avatar_spec}
            mood={activeBot.current_mood}
            size={36}
            isChiefOfStaff={activeBot.is_chief_of_staff}
            label={activeBot.name}
          />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {activeBot.name}
            </h1>
            <p className="text-xs text-[var(--text-secondary)] truncate">
              {activeBot.label} · {moodSubtitle(activeBot.current_mood, isId)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-xs font-mono text-[var(--status-success)] whitespace-nowrap">
            {data.preferences.free_only_mode ? 'Free-Tier-Only' : 'Multi-Tier'}
          </span>

          <button
            type="button"
            onClick={() =>
              void handleUpdatePreferences({
                show_telemetry_band: !data.preferences.show_telemetry_band,
              })
            }
            aria-pressed={data.preferences.show_telemetry_band}
            aria-label={isId ? 'Tampilkan pita telemetri' : 'Toggle telemetry band'}
            title={isId ? 'Pita Telemetri Ponytail' : 'Ponytail Telemetry Band'}
            className={`p-2 rounded-lg border transition-colors ${
              data.preferences.show_telemetry_band
                ? 'border-[var(--text-primary)] bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setInspectorOpen((v) => !v)}
            aria-label={isId ? 'Tampilkan atau sembunyikan inspektor' : 'Toggle inspector'}
            className="hidden lg:inline-flex p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)]"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Optional Ponytail Telemetry Band */}
      {data.preferences.show_telemetry_band && (
        <div className="px-4 sm:px-6 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
          <span>
            Route:{' '}
            <strong className="text-[var(--text-primary)]">
              {lastTelemetry?.provider_id ?? activeBot.routing_target}
            </strong>
          </span>
          <span>
            Tier:{' '}
            <strong className="text-[var(--status-success)]">
              {lastTelemetry?.tier ?? (data.preferences.free_only_mode ? 'free' : 'multi')}
            </strong>
          </span>
          <span>
            RTK+Caveman:{' '}
            <strong className="text-[var(--text-primary)]">
              {lastTelemetry ? `-${lastTelemetry.savings_pct}%` : 'ready'}
            </strong>
          </span>
          <span>
            Cost:{' '}
            <strong className="text-[var(--text-primary)]">
              ${(lastTelemetry?.cost_usd ?? 0).toFixed(4)}
            </strong>
          </span>
          <span>
            Skills Index:{' '}
            <strong className="text-[var(--text-primary)]">
              {data.skill_index.estimated_tokens} tok ({data.skills.length} packs)
            </strong>
          </span>
        </div>
      )}

      {/* Conversation Message Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-[780px] mx-auto space-y-5">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <QyroBotAvatar
                    spec={activeBot.avatar_spec}
                    mood="idle"
                    size={32}
                    isChiefOfStaff={activeBot.is_chief_of_staff}
                    label={activeBot.name}
                    className="mt-0.5"
                  />
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[80%] min-w-0 ${
                    isUser
                      ? 'rounded-2xl px-4 py-2.5 border border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                      : 'flex-1'
                  }`}
                  style={isUser ? userBubbleStyle : undefined}
                >
                  {renderFormattedText(msg.content)}

                  {!isUser && msg.active_skills.length > 0 && (
                    <p className="mt-2 text-[11px] font-mono text-[var(--text-secondary)]">
                      {msg.active_skills.join(' · ')}
                    </p>
                  )}

                  {!isUser && msg.draft_card && (
                    <DraftCard
                      messageId={msg.id}
                      draft={msg.draft_card}
                      locale={data.preferences.ui_locale}
                      accentMode={accentMode}
                      accentHex={activeColor.hex}
                      accentEyeHex={activeColor.eyeHex}
                      busy={draftBusyId === msg.id}
                      onAction={handleDraftAction}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Starter Cards Bar */}
          {messages.length <= 2 && (
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {starterCards.map((card) => (
                <button
                  key={card.prompt}
                  type="button"
                  onClick={() => void handleSendMessage(card.prompt)}
                  className="text-left px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                >
                  <p className="text-xs font-medium text-[var(--text-primary)]">{card.title}</p>
                  <p className="text-[11px] font-mono text-[var(--text-secondary)] mt-0.5 truncate">
                    {card.prompt}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Composer with Slash-Command Autocomplete */}
      <div className="px-4 sm:px-6 pb-4 pt-2 bg-[var(--bg-canvas)] shrink-0">
        <div className="max-w-[780px] mx-auto relative">
          {showSlashPopup && matchingSlashCommands.length > 0 && (
            <div
              className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-1.5 space-y-0.5 z-20"
              role="listbox"
              aria-label="Slash command suggestions"
            >
              {matchingSlashCommands.map((item) => (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => setComposerText(`${item.cmd} `)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-left"
                >
                  <span className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                    {item.cmd}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] truncate">
                    {isId ? item.descId : item.descEn}
                  </span>
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage();
            }}
            className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2"
          >
            <input
              type="text"
              aria-label={isId ? 'Tulis pesan atau perintah slash' : 'Write message or slash command'}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder={
                isId
                  ? `Kirim pesan ke ${activeBot.name} atau ketik /draft-x, /impeccable, /ui-ux...`
                  : `Message ${activeBot.name} or type /draft-x, /impeccable, /ui-ux...`
              }
              className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none px-1"
            />
            <button
              type="submit"
              disabled={sending || !composerText.trim()}
              style={sendBtnStyle}
              aria-label={isId ? 'Kirim pesan' : 'Send message'}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 disabled:opacity-45 ${
                accentMode === 'black'
                  ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)]'
                  : ''
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isId ? 'Kirim' : 'Send'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col">
      {/* Desktop 3-Column Workspace (lg+) & Mobile Single-Stack (< lg) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Column 1: Left Bot Sidebar */}
        <div
          className={`${
            mobileTab === 'bots' ? 'flex w-full' : 'hidden'
          } lg:flex lg:w-[260px] shrink-0 h-full`}
        >
          {renderSidebar()}
        </div>

        {/* Column 2: Center Stage (Chat / Computer / REA MCP / Pairing / Action Queue / Core Console) */}
        <main
          className={`${
            mobileTab === 'chat' || mobileTab === 'queue' || mobileTab === 'computer' ? 'flex' : 'hidden'
          } lg:flex flex-1 min-w-0 h-full flex-col overflow-hidden`}
        >
          {workspaceView === 'action_queue' || mobileTab === 'queue' ? (
            renderActionQueueView()
          ) : workspaceView === 'computer' || mobileTab === 'computer' ? (
            <ComputerPanel
              activeBotId={activeBot.id}
              locale={data.preferences.ui_locale}
              onRefreshBootstrap={loadBootstrap}
            />
          ) : workspaceView === 'mcp' ? (
            <ReaMcpPanel locale={data.preferences.ui_locale} />
          ) : workspaceView === 'pairing' ? (
            <PairingDevicesPanel
              bots={data.bots}
              activeBotId={activeBot.id}
              locale={data.preferences.ui_locale}
              onRefreshBootstrap={loadBootstrap}
            />
          ) : workspaceView === 'x_bridge' ? (
            <XBridgePanel
              activeBotId={activeBot.id}
              locale={data.preferences.ui_locale}
              onRefreshBootstrap={loadBootstrap}
              onNavigateComputer={() => {
                setWorkspaceView('computer');
                setMobileTab('computer');
              }}
            />
          ) : workspaceView === 'channels_routines' ? (
            <ChannelsRoutinesPanel
              bots={data.bots}
              activeBotId={activeBot.id}
              locale={data.preferences.ui_locale}
              onRefreshBootstrap={loadBootstrap}
            />
          ) : workspaceView === 'ecosystem_ops' ? (
            <EcosystemOpsPanel
              locale={data.preferences.ui_locale}
              onRefreshBootstrap={loadBootstrap}
            />
          ) : workspaceView === 'core' ? (
            renderCoreConsoleView()
          ) : (
            renderChatStage()
          )}
        </main>

        {/* Column 3: Right Collapsible 3-Tab Inspector */}
        <div
          className={`${
            mobileTab === 'inspector' ? 'flex w-full' : 'hidden'
          } ${inspectorOpen ? 'lg:flex lg:w-[340px]' : 'lg:hidden'} shrink-0 h-full`}
        >
          <div className="w-full h-full">
            <InspectorPane
              bot={activeBot}
              locale={data.preferences.ui_locale}
              accentMode={accentMode}
              virtualCombos={data.catalog.virtual_combos}
              libraryItems={data.library_items}
              skills={data.skills}
              skillIndex={data.skill_index}
              onUpdateBot={handleUpdateBot}
              onToggleAccentMode={handleToggleAccentMode}
              onSkillsUpdated={(nextSkills) =>
                setData((prev) => (prev ? { ...prev, skills: nextSkills } : prev))
              }
              onRefreshBootstrap={loadBootstrap}
            />
          </div>
        </div>
      </div>

      {/* Adaptive Mobile Single-Stack Bottom Bar (< 1024px) */}
      <nav
        aria-label="Mobile workspace navigation"
        className="lg:hidden h-14 border-t border-[var(--border-subtle)] bg-[var(--bg-sidebar)] grid grid-cols-5 shrink-0"
      >
        {(
          [
            { id: 'bots', label: 'Bots', icon: Bot },
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'computer', label: 'Screen', icon: Monitor },
            { id: 'inspector', label: isId ? 'Detail' : 'Inspect', icon: Sliders },
            {
              id: 'queue',
              label: isId ? `Antre (${pendingActions.length})` : `Queue (${pendingActions.length})`,
              icon: Bell,
            },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = mobileTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMobileTab(item.id);
                if (item.id === 'chat' && (workspaceView === 'action_queue' || workspaceView === 'computer')) {
                  setWorkspaceView('chat');
                }
                if (item.id === 'computer') {
                  setWorkspaceView('computer');
                }
                if (item.id === 'queue') {
                  setWorkspaceView('action_queue');
                }
              }}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium whitespace-nowrap ${
                active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Create New Specialist Bot Modal */}
      <CreateBotModal
        open={createModalOpen}
        locale={data.preferences.ui_locale}
        virtualCombos={data.catalog.virtual_combos}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateBot}
      />
    </div>
  );
}
