import { useState } from 'react';
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { api, type BootstrapResponse } from '../lib/api';

interface VaultPanelProps {
  data: BootstrapResponse;
  t: (key: string) => string;
  onRefresh: () => Promise<void>;
}

export function VaultPanel({ data, t, onRefresh }: VaultPanelProps) {
  const [keyName, setKeyName] = useState('');
  const [providerHint, setProviderHint] = useState('openrouter-free');
  const [secretValue, setSecretValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [redactInput, setRedactInput] = useState(
    'Log error: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9_demo and key sk-live-demo9876543210abcdef'
  );
  const [redactOutput, setRedactOutput] = useState<{ redacted: string; matches_removed: number } | null>(null);

  async function handleStoreSecret(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.storeSecret(keyName.trim(), secretValue, providerHint);
      setKeyName('');
      setSecretValue('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan rahasia');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(key: string) {
    setBusy(true);
    try {
      await api.deleteSecret(key);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleTestRedaction() {
    const res = await api.redactText(redactInput);
    setRedactOutput(res);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('vault-title')}</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">{t('vault-subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Store Secret Form */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Simpan Rahasia Baru (Write-Only AEAD)
          </h3>

          <form onSubmit={handleStoreSecret} className="space-y-3">
            <div>
              <label htmlFor="vault-key-name" className="block text-xs text-[var(--text-secondary)] mb-1">
                Nama Kunci
              </label>
              <input
                id="vault-key-name"
                type="text"
                required
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="OPENROUTER_FREE_KEY"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label htmlFor="vault-provider-hint" className="block text-xs text-[var(--text-secondary)] mb-1">
                Provider Hint
              </label>
              <input
                id="vault-provider-hint"
                type="text"
                value={providerHint}
                onChange={(e) => setProviderHint(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label htmlFor="vault-secret-value" className="block text-xs text-[var(--text-secondary)] mb-1">
                Nilai Rahasia (Tidak pernah dikirim kembali ke browser)
              </label>
              <input
                id="vault-secret-value"
                type="password"
                required
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="sk-or-v1-..."
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
              />
            </div>

            {error && <p className="text-xs text-[var(--status-danger)]">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-90 disabled:opacity-40 whitespace-nowrap cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Enkripsi & Simpan
            </button>
          </form>
        </section>

        {/* Stored Secrets Metadata (Write-Only) */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Metadata Vault ({data.vault.length})
            </h3>
            <span className="text-xs font-mono text-[var(--status-success)]">
              ChaCha20-Poly1305 · Write-Only
            </span>
          </div>

          {data.vault.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)] py-8 text-center">
              Belum ada rahasia tersimpan. Tambahkan API key atau token di panel sebelah kiri.
            </p>
          ) : (
            <div data-testid="vault-secrets-list" className="divide-y divide-[var(--border-subtle)]">
              {data.vault.map((sec) => (
                <div key={sec.key_name} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                        {sec.key_name}
                      </span>
                      <span className="text-xs text-[var(--status-success)]">
                        {t('status-configured')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs font-mono text-[var(--text-secondary)]">
                      provider={sec.provider_hint} · sha256={sec.sha256_fingerprint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(sec.key_name)}
                    aria-label={`Delete secret ${sec.key_name}`}
                    className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--status-danger)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Secret Redaction Sanitizer */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Uji Redaksi Rahasia (Log & Kompresi Guard)
          </h3>
          <button
            type="button"
            onClick={handleTestRedaction}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Jalankan Redaksi
          </button>
        </div>

        <textarea
          aria-label="Text to test secret redaction"
          rows={2}
          value={redactInput}
          onChange={(e) => setRedactInput(e.target.value)}
          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs font-mono text-[var(--text-primary)]"
        />

        {redactOutput && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs font-mono space-y-1">
            <p className="text-[var(--status-success)]">
              matches_removed={redactOutput.matches_removed}
            </p>
            <p className="text-[var(--text-primary)] break-all">{redactOutput.redacted}</p>
          </div>
        )}
      </section>
    </div>
  );
}
