import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Download,
  Lock,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { api } from '../lib/api';
import type { UiLocale } from '../core/types';
import type {
  BotMrrTeamPackage,
  CatalogSkillTemplate,
  SkillInstallSourceType,
  SkillLockHistoryRecord,
  SkillsLockfile,
} from '../core/ecosystem';
import type {
  AccessEvaluationResult,
  CloudBackupConfig,
  CrossArchPortabilityReport,
  ProtectedResourceKind,
  RbacState,
  TeamRole,
  UpdaterStatus,
} from '../core/ops';

interface EcosystemOpsPanelProps {
  locale: UiLocale;
  onRefreshBootstrap: () => Promise<void>;
}

export const EcosystemOpsPanel: React.FC<EcosystemOpsPanelProps> = ({
  locale,
  onRefreshBootstrap,
}) => {
  const isId = locale === 'id-ID';
  const [subTab, setSubTab] = useState<'installer' | 'tinkabot' | 'ops'>('installer');
  const [busy, setBusy] = useState(false);

  // Ecosystem state
  const [lockfile, setLockfile] = useState<SkillsLockfile | null>(null);
  const [lockHistory, setLockHistory] = useState<SkillLockHistoryRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogSkillTemplate[]>([]);
  const [skillsCount, setSkillsCount] = useState(23);
  const [sourceType, setSourceType] = useState<SkillInstallSourceType>('github');
  const [sourceRef, setSourceRef] = useState('https://github.com/qyro-community/slack-digest');
  const [customSlug, setCustomSlug] = useState('slack-digest');
  const [customName, setCustomName] = useState('Slack Digest Skill');
  const [customSkillMd, setCustomSkillMd] = useState(
    '# Slack Digest\nGunakan `vault_use("SLACK_BOT_TOKEN")` untuk merangkum pesan kanal kerja harian tanpa menyimpan rahasia di log.'
  );
  const [installerMsg, setInstallerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Tinkabot state
  const [tkService, setTkService] = useState('StripeBilling');
  const [tkUrl, setTkUrl] = useState('https://api.stripe.com');
  const [tkVaultKey, setTkVaultKey] = useState('STRIPE_SECRET_KEY');
  const [tkEndpointPath, setTkEndpointPath] = useState('/v1/invoices');
  const [tkInstall, setTkInstall] = useState(true);
  const [tkResult, setTkResult] = useState<{ ok: boolean; text: string; md?: string } | null>(null);

  // BotMRR state
  const [pkgName, setPkgName] = useState('QyroBot Ops Squad');
  const [exportedPkg, setExportedPkg] = useState<BotMrrTeamPackage | null>(null);
  const [botMrrFeedback, setBotMrrFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Ops state (RBAC, Cloud R2/S3, Cross-Arch, Auto-Updater)
  const [rbac, setRbac] = useState<RbacState | null>(null);
  const [cloudBackup, setCloudBackup] = useState<CloudBackupConfig | null>(null);
  const [portability, setPortability] = useState<CrossArchPortabilityReport | null>(null);
  const [updater, setUpdater] = useState<UpdaterStatus | null>(null);

  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>('member');
  const [evalActorId, setEvalActorId] = useState('user-owner');
  const [evalResource, setEvalResource] = useState<ProtectedResourceKind>('personal_vault');
  const [evalResult, setEvalResult] = useState<AccessEvaluationResult | null>(null);

  const [r2Provider, setR2Provider] = useState<'r2' | 's3' | 'local'>('r2');
  const [r2Endpoint, setR2Endpoint] = useState('UNSET');
  const [r2Bucket, setR2Bucket] = useState('UNSET');
  const [r2Cron, setR2Cron] = useState('0 3 * * *');
  const [r2GcCron, setR2GcCron] = useState('0 3 * * 0');
  const [rbacFeedback, setRbacFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [updaterFeedback, setUpdaterFeedback] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  const loadAll = useCallback(async () => {
    const [eco, ops] = await Promise.all([api.getEcosystemState(), api.getOpsState()]);
    setLockfile(eco.lockfile);
    setLockHistory(eco.lock_history);
    setCatalog(eco.catalog);
    setSkillsCount(eco.skills_count);

    setRbac(ops.rbac);
    setCloudBackup(ops.cloud_backup);
    setPortability(ops.portability);
    setUpdater(ops.updater);
    setR2Provider(ops.cloud_backup.provider);
    setR2Endpoint(ops.cloud_backup.endpoint_url);
    setR2Bucket(ops.cloud_backup.bucket_name);
    setR2Cron(ops.cloud_backup.schedule_cron);
    setR2GcCron(ops.cloud_backup.auto_gc_cron);
    if (ops.rbac.users.length > 1) {
      setEvalActorId((prev) =>
        ops.rbac.users.some((u) => u.id === prev) ? prev : ops.rbac.users[1].id
      );
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleInstallCatalog = async (tpl: CatalogSkillTemplate) => {
    setBusy(true);
    setInstallerMsg(null);
    try {
      const res = await api.installEcosystemSkill({
        source_type: 'catalog',
        source_ref: tpl.slug,
        slug: tpl.slug,
      });
      setLockfile(res.data.lockfile);
      setLockHistory(res.data.lock_history);
      setSkillsCount(res.data.skills.length);
      setInstallerMsg({
        ok: res.data.installed,
        text: res.data.installed
          ? `Skill "${tpl.name}" terpasang & dikunci di configs/skills-lock.json.`
          : res.data.error ?? 'Gagal memasang skill.',
      });
      await onRefreshBootstrap();
    } finally {
      setBusy(false);
    }
  };

  const handleInstallCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setInstallerMsg(null);
    try {
      const res = await api.installEcosystemSkill({
        source_type: sourceType,
        source_ref: sourceRef,
        slug: customSlug,
        name: customName,
        skill_md: customSkillMd,
      });
      setLockfile(res.data.lockfile);
      setLockHistory(res.data.lock_history);
      setSkillsCount(res.data.skills.length);
      if (res.data.installed) {
        setInstallerMsg({
          ok: true,
          text: `Terpasang & diverifikasi SHA-256 di configs/skills-lock.json (${customSlug}).`,
        });
      } else if (res.data.requires_trust_review) {
        setInstallerMsg({
          ok: false,
          text: `DIBLOKIR Static Scanner (${res.data.scan?.risk_level.toUpperCase()}): dikirim ke Action Queue untuk Trust Review.`,
        });
      } else {
        setInstallerMsg({ ok: false, text: res.data.error ?? 'Instalasi ditolak.' });
      }
      await onRefreshBootstrap();
    } finally {
      setBusy(false);
    }
  };

  const handleRollbackLock = async (historyId?: string) => {
    setBusy(true);
    setInstallerMsg(null);
    try {
      const res = await api.rollbackSkillsLock(historyId);
      setLockfile(res.data.lockfile);
      setLockHistory(res.data.lock_history);
      setInstallerMsg({
        ok: res.data.rolled_back,
        text: res.data.rolled_back
          ? `Rollback lockfile berhasil. Dihapus: ${res.data.removed_slugs.join(', ') || 'none'}.`
          : res.data.error ?? 'Rollback gagal.',
      });
      await onRefreshBootstrap();
    } finally {
      setBusy(false);
    }
  };

  const handleSynthesizeTinkabot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setTkResult(null);
    try {
      const res = await api.synthesizeTinkabot({
        service_name: tkService,
        base_url: tkUrl,
        vault_secret_name: tkVaultKey,
        endpoints: [{ method: 'GET', path: tkEndpointPath, summary: 'Primary query endpoint' }],
        install: tkInstall,
      });
      setLockfile(res.data.lockfile);
      setLockHistory(res.data.lock_history);
      if (res.data.ok) {
        setTkResult({
          ok: true,
          text: `Skill Tinkabot "${res.data.slug}" dibuat dengan vault_use("${res.data.vault_secret_name}")${
            res.data.installed ? ' & dikunci di skills-lock.json' : ''
          }.`,
          md: res.data.skill_md,
        });
        await onRefreshBootstrap();
      } else {
        setTkResult({
          ok: false,
          text: res.data.blocked_reason ?? 'Sintesis Tinkabot diblokir.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleExportBotMrr = async () => {
    setBusy(true);
    setBotMrrFeedback(null);
    try {
      const res = await api.exportBotMrrPackage({ package_name: pkgName });
      setExportedPkg(res.package);
      setBotMrrFeedback({
        ok: true,
        text: `Paket BotMRR diekspor (${res.package.bots.length} bots, ${res.package.channels.length} channels, 0 rahasia). SHA-256: ${res.package.checksum_sha256.slice(0, 16)}...`,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleImportBotMrr = async () => {
    if (!exportedPkg) return;
    setBusy(true);
    try {
      const res = await api.importBotMrrPackage(exportedPkg);
      setBotMrrFeedback({
        ok: res.data.ok,
        text: res.data.ok
          ? `Zero-Secret Import terverifikasi: +${res.data.imported_bots} bot baru, ${res.data.skipped_existing_bots} sudah ada, +${res.data.imported_skills} skill.`
          : res.data.error ?? 'Import gagal.',
      });
      await onRefreshBootstrap();
    } finally {
      setBusy(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim() || !newMemberName.trim()) return;
    setBusy(true);
    setRbacFeedback(null);
    try {
      const res = await api.addTeamMember({
        email: newMemberEmail.trim(),
        display_name: newMemberName.trim(),
        role: newMemberRole,
      });
      setRbac(res.data.state);
      if (res.data.ok) {
        setNewMemberEmail('');
        setNewMemberName('');
        const last = res.data.state.users[res.data.state.users.length - 1];
        if (last) setEvalActorId(last.id);
        setRbacFeedback({ ok: true, text: 'Anggota tim ditambahkan ke direktori RBAC.' });
      } else {
        setRbacFeedback({ ok: false, text: res.data.error ?? 'Gagal menambahkan anggota.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEvaluateIsolation = async () => {
    setBusy(true);
    try {
      const res = await api.evaluateRbacAccess({
        actor_user_id: evalActorId,
        resource_owner_id: 'user-owner',
        resource_kind: evalResource,
      });
      setEvalResult(res);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCloudBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBackupFeedback(null);
    try {
      const res = await api.updateCloudBackup({
        provider: r2Provider,
        endpoint_url: r2Endpoint,
        bucket_name: r2Bucket,
        schedule_cron: r2Cron,
        auto_gc_cron: r2GcCron,
      });
      setCloudBackup(res.data.config);
      setBackupFeedback({
        ok: res.data.ok,
        text: res.data.ok
          ? `Konfigurasi Cloud Backup (${res.data.config.provider.toUpperCase()}) tersimpan.`
          : res.data.error ?? 'Gagal menyimpan konfigurasi backup.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTestUpdater = async (tamper: boolean) => {
    setBusy(true);
    setUpdaterFeedback(null);
    try {
      const res = await api.verifyUpdaterDemo({
        version: '1.7.1',
        arch: 'linux/arm64',
        tamper,
      });
      setUpdater(res.data.updater);
      setUpdaterFeedback({
        ok: res.data.verified,
        text: res.data.message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[var(--bg-canvas)]">
      {/* Header + Tabs */}
      <header className="px-4 sm:px-6 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-[var(--text-primary)] truncate">
            {isId ? 'Ekosistem, Team RBAC & Cloud Ops' : 'Ecosystem, Team RBAC & Cloud Ops'}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] truncate">
            Skill Installer + Lockfile, Tinkabot API, BotMRR Portable, RBAC Isolation, R2/S3 & Auto-Updater
          </p>
        </div>

        <div
          role="tablist"
          className="flex flex-wrap items-center p-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] gap-1 max-w-full"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'installer'}
            onClick={() => setSubTab('installer')}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
              subTab === 'installer'
                ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Skill Installer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'tinkabot'}
            onClick={() => setSubTab('tinkabot')}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
              subTab === 'tinkabot'
                ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Tinkabot & BotMRR
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'ops'}
            onClick={() => setSubTab('ops')}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
              subTab === 'ops'
                ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            RBAC, R2 & Updater
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-[1060px] mx-auto space-y-6">
          {subTab === 'installer' && (
            <>
              {/* Curated One-Click Catalog */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      Katalog Skill Terkurasi (One-Click + Static Scanner)
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Total skill aktif di database: <strong className="font-mono tabular-nums text-[var(--text-primary)]">{skillsCount}</strong> (23 built-in permanen + kustom).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {catalog.map((tpl) => {
                    const installed = lockfile?.entries.some((e) => e.slug === tpl.slug);
                    return (
                      <div
                        key={tpl.slug}
                        className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              {tpl.name}
                            </span>
                            <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                              v{tpl.version}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            {tpl.description}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                            {tpl.slug}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleInstallCatalog(tpl)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0 disabled:opacity-45"
                          >
                            {installed ? 'Re-lock' : 'Pasang'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* GitHub / ZIP Installer */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Pasang Skill dari GitHub / ZIP (Static Pre-Install Scanner)
                </h2>
                <form onSubmit={(e) => void handleInstallCustom(e)} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <select
                      aria-label="Tipe sumber skill"
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value as SkillInstallSourceType)}
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    >
                      <option value="github">GitHub Repo URL</option>
                      <option value="zip">Arsip .zip Lokal</option>
                    </select>
                    <input
                      type="text"
                      aria-label="Referensi sumber skill"
                      value={sourceRef}
                      onChange={(e) => setSourceRef(e.target.value)}
                      placeholder="https://github.com/org/skill-repo"
                      className="sm:col-span-2 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      aria-label="Slug skill"
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value)}
                      placeholder="slug-skill"
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      aria-label="Nama skill"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Nama skill"
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      aria-label="Isi SKILL.md"
                      value={customSkillMd}
                      onChange={(e) => setCustomSkillMd(e.target.value)}
                      className="sm:col-span-2 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Payload mengandung `curl | sh`, `rm -rf /`, `.env`, atau `localhost:11434` otomatis ditolak ke Trust Review.
                    </span>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      Scan & Pasang
                    </button>
                  </div>
                </form>

                {installerMsg && (
                  <p
                    className={`text-xs font-mono ${
                      installerMsg.ok ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'
                    }`}
                  >
                    {installerMsg.text}
                  </p>
                )}
              </section>

              {/* configs/skills-lock.json & Rollback */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      configs/skills-lock.json ({lockfile?.entries.length ?? 0} entri terkunci)
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Setiap instalasi menyimpan snapshot rollback sebelum memodifikasi lockfile.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || lockHistory.length === 0}
                    onClick={() => void handleRollbackLock()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 disabled:opacity-45"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Rollback Terakhir ({lockHistory.length})
                  </button>
                </div>

                {!lockfile || lockfile.entries.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] py-2">
                    Lockfile kosong (hanya 23 skill built-in permanen yang aktif). Pasang skill dari katalog atau Tinkabot untuk mengisi lockfile.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lockfile.entries.map((entry) => (
                      <div
                        key={entry.slug}
                        className="px-3 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {entry.name}
                          </span>
                          <span className="ml-2 font-mono text-[11px] text-[var(--text-secondary)]">
                            {entry.slug}@{entry.version} · {entry.source_type}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-[var(--status-success)] shrink-0">
                          sha256:{entry.sha256.slice(0, 14)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {subTab === 'tinkabot' && (
            <>
              {/* Tinkabot API Integrator */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Tinkabot API Integrator (Anti-Local Guard + Write-Only Vault)
                  </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Mensintesis skill integrasi REST/GraphQL/MCP dengan autentikasi eksklusif <code className="font-mono">vault_use(...)</code> dan pemblokiran endpoint localhost/RFC1918.
                  </p>
                </div>

                <form onSubmit={(e) => void handleSynthesizeTinkabot(e)} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">Nama Layanan</label>
                      <input
                        type="text"
                        aria-label="Nama Layanan Tinkabot"
                        value={tkService}
                        onChange={(e) => setTkService(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">
                        Base URL Remote HTTPS
                      </label>
                      <input
                        type="text"
                        aria-label="Base URL Tinkabot"
                        value={tkUrl}
                        onChange={(e) => setTkUrl(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">
                        Alias Kunci Vault (vault_use)
                      </label>
                      <input
                        type="text"
                        aria-label="Vault Alias Tinkabot"
                        value={tkVaultKey}
                        onChange={(e) => setTkVaultKey(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">Endpoint Path</label>
                      <input
                        type="text"
                        aria-label="Endpoint Path Tinkabot"
                        value={tkEndpointPath}
                        onChange={(e) => setTkEndpointPath(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={tkInstall}
                        onChange={(e) => setTkInstall(e.target.checked)}
                      />
                      Pasang langsung ke configs/skills-lock.json
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTkUrl('http://localhost:8080')}
                        className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
                      >
                        Uji Blokir Localhost
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-4 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
                      >
                        Sintesis Skill API
                      </button>
                    </div>
                  </div>
                </form>

                {tkResult && (
                  <div className="space-y-2">
                    <p
                      className={`text-xs font-mono ${
                        tkResult.ok ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'
                      }`}
                    >
                      {tkResult.text}
                    </p>
                    {tkResult.md && (
                      <pre className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-mono text-[var(--text-primary)] overflow-x-auto whitespace-pre-wrap">
                        {tkResult.md}
                      </pre>
                    )}
                  </div>
                )}
              </section>

              {/* BotMRR Portable Team Packages */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Portable Team Packages (BotMRR Zero-Secret Export / Import)
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Mengekspor tim bot, channel, routine, dan custom skill secara portabel sambil membuang total Vault secrets, sesi X pribadi, dan kunci perangkat Android.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    aria-label="Nama paket BotMRR"
                    value={pkgName}
                    onChange={(e) => setPkgName(e.target.value)}
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleExportBotMrr()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Zero-Secret
                  </button>
                  <button
                    type="button"
                    disabled={busy || !exportedPkg}
                    onClick={() => void handleImportBotMrr()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 disabled:opacity-45"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Verify & Import
                  </button>
                </div>

                {botMrrFeedback && (
                  <p
                    className={`text-xs font-mono ${
                      botMrrFeedback.ok ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'
                    }`}
                  >
                    {botMrrFeedback.text}
                  </p>
                )}

                {exportedPkg && (
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[var(--text-primary)]">
                        {exportedPkg.format} · {exportedPkg.package_name}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--status-success)]">
                        Stripped: {exportedPkg.stripped_sensitive_categories.join(', ')}
                      </span>
                    </div>
                    <p className="text-[var(--text-secondary)] font-mono tabular-nums">
                      Bots: {exportedPkg.bots.length} · Channels: {exportedPkg.channels.length} · Routines: {exportedPkg.routines.length} · Custom Skills: {exportedPkg.custom_skills.length}
                    </p>
                  </div>
                )}
              </section>
            </>
          )}

          {subTab === 'ops' && (
            <>
              {/* Optional Live Team RBAC */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      Optional Live Team RBAC (Isolasi Keras Data Pribadi)
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Default: Single-Owner. Saat Team RBAC aktif, Personal Vault, Sesi X Pribadi, dan Android Device Apps tetap terisolasi penuh per-user.
                    </p>
                  </div>

                  <div className="flex items-center p-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await api.setRbacMode('single_owner');
                        setRbac(res.rbac);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                        rbac?.mode === 'single_owner'
                          ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      Single-Owner
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await api.setRbacMode('team_rbac');
                        setRbac(res.rbac);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                        rbac?.mode === 'team_rbac'
                          ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      Team RBAC
                    </button>
                  </div>
                </div>

                {/* Members List + Add Member */}
                <div className="space-y-2">
                  {rbac?.users.map((u) => (
                    <div
                      key={u.id}
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {u.display_name}
                        </span>
                        <span className="ml-2 font-mono text-[11px] text-[var(--text-secondary)]">
                          {u.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px] uppercase text-[var(--status-success)]">
                          {u.role}
                        </span>
                        {u.id !== 'user-owner' && (
                          <button
                            type="button"
                            aria-label={`Hapus ${u.display_name}`}
                            onClick={async () => {
                              const res = await api.removeTeamMember(u.id);
                              setRbac(res.state);
                            }}
                            className="p-1 rounded-lg border border-[var(--border-subtle)] text-[var(--status-danger)]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={(e) => void handleAddMember(e)}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2"
                >
                  <input
                    type="text"
                    aria-label="Nama anggota tim"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Nama (mis. Budi Engineer)"
                    className="sm:col-span-4 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                  />
                  <input
                    type="email"
                    aria-label="Email anggota tim"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="budi@tim.qyro.id"
                    className="sm:col-span-4 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                  />
                  <select
                    aria-label="Peran anggota"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as TeamRole)}
                    className="sm:col-span-2 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="member">Member</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    type="submit"
                    disabled={busy || !newMemberEmail.trim() || !newMemberName.trim()}
                    className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0 disabled:opacity-45"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Tambah
                  </button>
                </form>

                {rbacFeedback && (
                  <p
                    className={`text-xs font-mono ${
                      rbacFeedback.ok ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'
                    }`}
                  >
                    {rbacFeedback.text}
                  </p>
                )}

                {/* Interactive Isolation Proof */}
                <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                    <Lock className="w-3.5 h-3.5" />
                    Uji Isolasi Akses RBAC (Target: Resource Milik Primary Owner)
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Aktor RBAC"
                      value={evalActorId}
                      onChange={(e) => setEvalActorId(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    >
                      {rbac?.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          Aktor: {u.display_name} ({u.role})
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Resource RBAC"
                      value={evalResource}
                      onChange={(e) => setEvalResource(e.target.value as ProtectedResourceKind)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    >
                      <option value="personal_vault">Personal Vault (Isolated)</option>
                      <option value="personal_x_session">Personal X Session (Isolated)</option>
                      <option value="android_device_apps">Android Device Apps (Isolated)</option>
                      <option value="team_bot">Team Bot (Shared)</option>
                      <option value="team_channel">Team Channel (Shared)</option>
                      <option value="shared_routine">Shared Routine (Shared)</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleEvaluateIsolation()}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      Verifikasi Akses
                    </button>
                  </div>
                  {evalResult && (
                    <div
                      className={`flex items-start gap-2 text-xs font-mono ${
                        evalResult.allowed
                          ? 'text-[var(--status-success)]'
                          : 'text-[var(--status-danger)]'
                      }`}
                    >
                      {evalResult.allowed ? (
                        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span>
                        [{evalResult.policy_code}] {evalResult.reason}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* Cloud R2/S3 Backup & Cross-Arch AMD64 <-> Ampere ARM64 */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-[var(--text-primary)]" />
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Cloud R2 / S3 Backup & Portabilitas AMD64 ↔ Ampere ARM64
                  </h2>
                </div>

                <form onSubmit={(e) => void handleSaveCloudBackup(e)} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <select
                      aria-label="Provider Cloud Backup"
                      value={r2Provider}
                      onChange={(e) => setR2Provider(e.target.value as 'r2' | 's3' | 'local')}
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    >
                      <option value="r2">Cloudflare R2 (Zero Egress)</option>
                      <option value="s3">AWS S3 / S3-Compatible</option>
                      <option value="local">Local Archive Only</option>
                    </select>
                    <input
                      type="text"
                      aria-label="Endpoint URL Cloud Backup"
                      value={r2Endpoint}
                      onChange={(e) => setR2Endpoint(e.target.value)}
                      placeholder="https://<account>.r2.cloudflarestorage.com"
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      aria-label="Nama Bucket"
                      value={r2Bucket}
                      onChange={(e) => setR2Bucket(e.target.value)}
                      placeholder="qyrobot-backups"
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                    <input
                      type="text"
                      aria-label="Cron Backup"
                      value={r2Cron}
                      onChange={(e) => setR2Cron(e.target.value)}
                      placeholder="0 3 * * *"
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      aria-label="Cron Storage GC"
                      value={r2GcCron}
                      onChange={(e) => setR2GcCron(e.target.value)}
                      placeholder="0 3 * * 0"
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      Simpan Target Backup
                    </button>
                  </div>
                </form>

                {backupFeedback && (
                  <p
                    className={`text-xs font-mono ${
                      backupFeedback.ok
                        ? 'text-[var(--status-success)]'
                        : 'text-[var(--status-danger)]'
                    }`}
                  >
                    {backupFeedback.text}
                  </p>
                )}

                {portability && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
                    {portability.checks.map((chk) => (
                      <div
                        key={chk.name}
                        className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-1"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)] shrink-0" />
                          <span>{chk.name}</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          {chk.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Auto-Updater (minisign Ed25519 + atomic rollback) */}
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      Auto-Updater (<code className="font-mono text-xs">qyro self-update</code> · minisign Ed25519 + Atomic Rollback)
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Versi aktif: <span className="font-mono text-[var(--text-primary)]">v{updater?.current_version ?? '1.7.0'}</span> · Host: <span className="font-mono">{updater?.host_target}</span> · Feed: <span className="font-mono">{updater?.release_feed_url ?? 'UNSET'}</span> · Rollback slot: <span className="font-mono">{updater?.previous_version_slot}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleTestUpdater(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Uji Ed25519 Valid
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleTestUpdater(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--status-danger)] whitespace-nowrap shrink-0"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Uji Rollback Tampered
                    </button>
                  </div>
                </div>

                {updaterFeedback && (
                  <p
                    className={`text-xs font-mono ${
                      updaterFeedback.ok
                        ? 'text-[var(--status-success)]'
                        : 'text-[var(--status-danger)]'
                    }`}
                  >
                    {updaterFeedback.text}
                  </p>
                )}

                {cloudBackup && (
                  <p className="text-[11px] font-mono text-[var(--text-secondary)]">
                    Active Backup Policy: {cloudBackup.provider.toUpperCase()} ({cloudBackup.endpoint_url}) · Backup Cron {cloudBackup.schedule_cron} · Storage GC {cloudBackup.auto_gc_cron}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
