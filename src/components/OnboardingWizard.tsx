import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Globe, ShieldCheck } from 'lucide-react';
import type { BotAvatarSpec, BotRecord, UiLocale, UserPreferences } from '../core/types';
import { api } from '../lib/api';
import { AvatarStudio } from './AvatarStudio';
import { QyroBotAvatar } from './QyroBotAvatar';

interface OnboardingWizardProps {
  preferences: UserPreferences;
  chiefBot: BotRecord;
  onUpdatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  onUpdateChiefAvatar: (spec: BotAvatarSpec) => Promise<void>;
  onComplete: (starterPrompt?: string) => Promise<void>;
}

const TIMEZONE_OPTIONS = [
  { label: 'WIB (Asia/Jakarta)', value: 'Asia/Jakarta' },
  { label: 'WITA (Asia/Makassar)', value: 'Asia/Makassar' },
  { label: 'WIT (Asia/Jayapura)', value: 'Asia/Jayapura' },
  { label: 'UTC', value: 'UTC' },
];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  preferences,
  chiefBot,
  onUpdatePreferences,
  onUpdateChiefAvatar,
  onComplete,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<string | null>(null);

  const isId = preferences.ui_locale === 'id-ID';

  const handleTestConnection = async () => {
    setTestingConn(true);
    try {
      const res = await api.routeRequest({
        target: 'auto/fast',
        free_only_override: preferences.free_only_mode,
      });
      if (res.decision.ok && res.decision.selected_provider) {
        setConnResult(
          isId
            ? `Terhubung: ${res.decision.selected_provider.name} (${res.decision.selected_provider.tier}) — Anti-Local Guard aktif.`
            : `Connected: ${res.decision.selected_provider.name} (${res.decision.selected_provider.tier}) — Anti-Local Guard active.`
        );
      } else {
        setConnResult(res.decision.error_message ?? 'Route blocked');
      }
    } finally {
      setTestingConn(false);
    }
  };

  const starterCards = isId
    ? [
        {
          title: 'Siapkan Draf Utasan X',
          desc: 'Buka Interactive Draft Card + Humanizer v4.0.0.',
          prompt: '/draft-x',
        },
        {
          title: 'Audit UI 62-Aturan Impeccable',
          desc: 'Deteksi anti-AI-slop deterministik dengan 0 token LLM.',
          prompt: '/impeccable',
        },
        {
          title: 'Buat Design System BM25',
          desc: 'Susun palet warna & tipografi domain fintech secara instan.',
          prompt: '/ui-ux fintech analytics dark mode',
        },
      ]
    : [
        {
          title: 'Draft an X Thread',
          desc: 'Open Interactive Draft Card + Humanizer v4.0.0.',
          prompt: '/draft-x',
        },
        {
          title: 'Run 62-Rule Impeccable Audit',
          desc: 'Deterministic anti-AI-slop inspection using 0 LLM tokens.',
          prompt: '/impeccable',
        },
        {
          title: 'Generate BM25 Design System',
          desc: 'Build domain-calibrated color & font pairings instantly.',
          prompt: '/ui-ux fintech analytics dark mode',
        },
      ];

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-6 sm:p-8 space-y-6">
        {/* Header & Step Progress */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <QyroBotAvatar
              spec={chiefBot.avatar_spec}
              mood="idle"
              size={44}
              isChiefOfStaff
              label="Chief of Staff"
            />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                QyroBot
              </h1>
              <p className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
                {isId ? `Langkah ${step} dari 4` : `Step ${step} of 4`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onComplete()}
            className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
          >
            {isId ? 'Lewati' : 'Skip'}
          </button>
        </div>

        {/* Minimal 4-Segment Progress Bar */}
        <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className={`h-1 rounded-full transition-colors ${
                idx <= step ? 'bg-[var(--text-primary)]' : 'bg-[var(--border-subtle)]'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Bahasa & Zona Waktu */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Globe className="w-4 h-4 text-[var(--text-secondary)]" />
                {isId ? 'Pilih Bahasa & Zona Waktu' : 'Choose Language & Timezone'}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {isId
                  ? 'Default antarmuka Bahasa Indonesia (id-ID) dan zona waktu WIB dapat diganti kapan saja.'
                  : 'Default UI locale and WIB/WITA/WIT timezone can be changed anytime.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  { id: 'id-ID', title: 'Bahasa Indonesia (id-ID)', sub: 'Default utama + Guard Bahasa Indonesia' },
                  { id: 'en-US', title: 'English (en-US)', sub: 'Full English interface & skill hints' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdatePreferences({ ui_locale: opt.id })}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    preferences.ui_locale === opt.id
                      ? 'border-[var(--text-primary)] bg-[var(--bg-canvas)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{opt.title}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{opt.sub}</p>
                </button>
              ))}
            </div>

            <div>
              <label
                htmlFor="onboarding-tz"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                {isId ? 'Zona Waktu' : 'Timezone'}
              </label>
              <select
                id="onboarding-tz"
                value={preferences.timezone}
                onChange={(e) => onUpdatePreferences({ timezone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 2: Free-Tier-Only Cloud Mode + 1-Click Test Connection */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--status-success)]" />
                {isId ? 'Mode Cloud Gratis & Anti-Local Guard' : 'Free-Tier-Only Cloud & Anti-Local Guard'}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {isId
                  ? 'Semua inferensi berjalan 100% di cloud lewat OmniRoute dengan 16+ provider free-tier dan 0 beban GPU lokal.'
                  : 'All inference runs 100% on cloud via OmniRoute across 16+ free-tier providers with zero local GPU load.'}
              </p>
            </div>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.free_only_mode}
                onChange={(e) => onUpdatePreferences({ free_only_mode: e.target.checked })}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Free-Tier-Only Mode
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {isId
                    ? 'Aktif secara bawaan. Mencegah biaya tak terduga dengan memblokir failover ke provider berbayar.'
                    : 'Enabled by default. Prevents unexpected billing by blocking paid provider failover.'}
                </p>
              </div>
            </label>

            <div className="space-y-2">
              <button
                type="button"
                disabled={testingConn}
                onClick={handleTestConnection}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                <CheckCircle2 className="w-4 h-4 text-[var(--status-success)]" />
                {testingConn
                  ? isId
                    ? 'Menguji...'
                    : 'Testing...'
                  : isId
                    ? 'Uji Koneksi Cloud (1-Klik)'
                    : 'Test Cloud Connection (1-Click)'}
              </button>
              {connResult && (
                <p className="text-xs font-mono text-[var(--status-success)] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3">
                  {connResult}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Kustomisasi Avatar Chief of Staff */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {isId ? 'Sesuaikan Chief of Staff kamu' : 'Customize your Chief of Staff'}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {isId
                  ? 'Pilih bentuk, warna (dengan kontras mata otomatis), dan ekspresi untuk Chief of Staff.'
                  : 'Pick shape, color (with automatic eye contrast), and expression for Chief of Staff.'}
              </p>
            </div>
            <AvatarStudio
              spec={chiefBot.avatar_spec}
              isChiefOfStaff
              locale={preferences.ui_locale}
              onChange={onUpdateChiefAvatar}
              compact
            />
          </div>
        )}

        {/* Step 4: Siap Mulai + 3 Starter Cards */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {isId ? 'Siap Memulai Ruang Kerja QyroBot' : 'Ready to Launch QyroBot Workspace'}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {isId
                  ? 'Pilih salah satu Starter Card di bawah untuk langsung mencoba, atau masuk ke ruang kerja.'
                  : 'Pick a Starter Card below to jump straight in, or enter the workspace.'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {starterCards.map((card) => (
                <button
                  key={card.prompt}
                  type="button"
                  onClick={() => onComplete(card.prompt)}
                  className="text-left p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] transition-colors space-y-1.5"
                >
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{card.title}</p>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {card.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
            className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            {isId ? 'Kembali' : 'Back'}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
            >
              {isId ? 'Lanjut' : 'Continue'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onComplete()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
            >
              {isId ? 'Masuk ke Ruang Kerja' : 'Open Workspace'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
