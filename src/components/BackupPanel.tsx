import { useState } from 'react';
import { Archive, Pin, ShieldCheck, Trash2 } from 'lucide-react';
import { api, type BootstrapResponse } from '../lib/api';
import type { BackupManifest } from '../core/backup';
import type { StorageGcResult } from '../core/storage';

interface BackupPanelProps {
  data: BootstrapResponse;
  t: (key: string) => string;
  onRefresh: () => Promise<void>;
}

export function BackupPanel({ data, t, onRefresh }: BackupPanelProps) {
  const [passphrase, setPassphrase] = useState('qyro-backup-2026');
  const [mode, setMode] = useState<'compact' | 'full'>('compact');
  const [snapshot, setSnapshot] = useState<{
    size_bytes: number;
    manifest: BackupManifest;
    archive_base64: string;
  } | null>(null);
  const [verifyPassphrase, setVerifyPassphrase] = useState('qyro-backup-2026');
  const [verifyStatus, setVerifyStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const [gcResult, setGcResult] = useState<StorageGcResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreateBackup() {
    setBusy(true);
    setVerifyStatus(null);
    try {
      const res = await api.createBackup(passphrase, mode);
      setSnapshot(res);
      setVerifyPassphrase(passphrase);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyBackup() {
    if (!snapshot) return;
    setBusy(true);
    try {
      const res = await api.verifyBackup(snapshot.archive_base64, verifyPassphrase);
      if (res.status === 200 && res.data.valid) {
        setVerifyStatus({
          valid: true,
          message: `Arsip QYROBAK1 valid · SHA-256 ${res.data.manifest.payload_sha256.slice(0, 20)}... · ${res.data.table_names.length} tabel terverifikasi.`,
        });
      } else {
        setVerifyStatus({
          valid: false,
          message: res.data.error ?? 'Verifikasi gagal',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRunGc() {
    setBusy(true);
    try {
      const res = await api.runStorageGc();
      setGcResult(res.result);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleSeedStale() {
    setBusy(true);
    try {
      await api.seedStaleLibraryCache();
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  const isEn = data.preferences.ui_locale === 'en-US';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('backup-title')}</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">{t('backup-subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Encrypted .qyrobak Snapshot Creator & Verifier */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {isEn
              ? 'Encrypted Snapshot (.qyrobak · ChaCha20-Poly1305)'
              : 'Snapshot Terenkripsi (.qyrobak · ChaCha20-Poly1305)'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="backup-pass" className="block text-xs text-[var(--text-secondary)] mb-1">
                {isEn ? 'Encryption Passphrase (min 6 chars)' : 'Passphrase Enkripsi (min 6 karakter)'}
              </label>
              <input
                id="backup-pass"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label htmlFor="backup-mode" className="block text-xs text-[var(--text-secondary)] mb-1">
                {isEn ? 'Snapshot Mode' : 'Mode Snapshot'}
              </label>
              <select
                id="backup-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'compact' | 'full')}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
              >
                <option value="compact">Compact (DB + Vault + Memory + Pinned)</option>
                <option value="full">Full (+ Event Log &amp; Messages)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={busy || passphrase.length < 6}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 disabled:opacity-40 whitespace-nowrap cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5" />
            {isEn ? 'Create .qyrobak Snapshot' : 'Buat Snapshot .qyrobak'}
          </button>

          {snapshot && (
            <div data-testid="backup-manifest" className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between font-mono">
                <span className="font-semibold text-[var(--status-success)]">QYROBAK1 READY</span>
                <span className="tabular-nums text-[var(--text-secondary)]">
                  {snapshot.size_bytes.toLocaleString()} bytes · {snapshot.manifest.source_arch}
                </span>
              </div>
              <p className="font-mono text-[var(--text-secondary)] break-all">
                SHA-256: {snapshot.manifest.payload_sha256}
              </p>

              <div className="pt-2 border-t border-[var(--border-subtle)] flex gap-2">
                <input
                  aria-label="Passphrase for snapshot verification"
                  type="password"
                  value={verifyPassphrase}
                  onChange={(e) => setVerifyPassphrase(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  onClick={handleVerifyBackup}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {isEn ? 'Verify Decryption' : 'Verifikasi Dekripsi'}
                </button>
              </div>

              {verifyStatus && (
                <p
                  className={
                    verifyStatus.valid
                      ? 'text-[var(--status-success)] font-mono'
                      : 'text-[var(--status-danger)] font-mono'
                  }
                >
                  {verifyStatus.message}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Storage Garbage Collector & Pinned Library Protection */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {isEn
                  ? 'Storage Garbage Collector (Pinned Item Protection)'
                  : 'Storage Garbage Collector (Proteksi Item Pinned)'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {isEn
                  ? 'Prunes unpinned RTK cache > 14d and media cache > 30d; pinned=1 items are never touched.'
                  : 'Menghapus cache RTK > 14 hari & cache media > 30 hari; item pinned=1 tidak pernah disentuh.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRunGc}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isEn ? 'Run Storage GC' : 'Jalankan Storage GC'}
            </button>
            <button
              type="button"
              onClick={handleSeedStale}
              disabled={busy}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
            >
              {isEn ? 'Seed Stale Cache (19d)' : 'Tambah Cache Usang (19 Hari)'}
            </button>
          </div>

          {gcResult && (
            <div data-testid="gc-result" className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs font-mono space-y-1">
              <div className="text-[var(--status-success)]">
                GC Selesai · dihapus: rtk={gcResult.deleted_rtk_cache}, screenshots={gcResult.deleted_temp_screenshots}, media={gcResult.deleted_media_cache}
              </div>
              <div className="text-[var(--text-secondary)]">
                Dilindungi: pinned_library={gcResult.preserved_pinned_items} · memory={gcResult.preserved_memory_observations} · vault={gcResult.preserved_vault_secrets}
              </div>
            </div>
          )}

          <div className="divide-y divide-[var(--border-subtle)]">
            {data.library_items.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                    {item.pinned && <Pin className="w-3.5 h-3.5 text-[var(--status-warning)] shrink-0" />}
                    <span className="truncate">{item.title}</span>
                  </div>
                  <div className="font-mono text-[var(--text-secondary)] mt-0.5">
                    {item.kind} · {(item.size_bytes / 1024).toFixed(1)} KB · {item.pinned ? 'PINNED' : 'ephemeral'}
                  </div>
                </div>
                <span className="font-mono text-[var(--text-secondary)] shrink-0">
                  {item.created_at.slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
