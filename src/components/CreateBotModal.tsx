import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { BotAvatarSpec, UiLocale } from '../core/types';
import { AvatarStudio } from './AvatarStudio';

interface CreateBotModalProps {
  open: boolean;
  locale: UiLocale;
  virtualCombos: string[];
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    label: string;
    description: string;
    avatar_spec: BotAvatarSpec;
    routing_target: string;
  }) => Promise<void>;
}

export const CreateBotModal: React.FC<CreateBotModalProps> = ({
  open,
  locale,
  virtualCombos,
  onClose,
  onCreate,
}) => {
  const isId = locale === 'id-ID';
  const [name, setName] = useState('');
  const [label, setLabel] = useState('Specialist');
  const [description, setDescription] = useState('');
  const [routingTarget, setRoutingTarget] = useState('auto/coding');
  const [avatarSpec, setAvatarSpec] = useState<BotAvatarSpec>({
    type: 'procedural',
    shape: 'squircle',
    color: 'blue',
    expression: 'curious',
    animationOverride: null,
    assetPath: null,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        label: label.trim() || 'Specialist Bot',
        description: description.trim(),
        avatar_spec: avatarSpec,
        routing_target: routingTarget,
      });
      setName('');
      setDescription('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-bot-title"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <h2 id="create-bot-title" className="text-sm font-semibold text-[var(--text-primary)]">
            {isId ? 'Buat Bot Spesialis Baru' : 'Create New Specialist Bot'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={isId ? 'Tutup modal' : 'Close modal'}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="new-bot-name"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                {isId ? 'Nama Bot' : 'Bot Name'}
              </label>
              <input
                id="new-bot-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isId ? 'Mis. Social Growth' : 'e.g. Social Growth'}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label
                htmlFor="new-bot-label"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                {isId ? 'Peran / Label' : 'Role / Label'}
              </label>
              <input
                id="new-bot-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="new-bot-desc"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              {isId ? 'Deskripsi Singkat' : 'Short Description'}
            </label>
            <input
              id="new-bot-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isId
                  ? 'Spesialis riset, penulisan X/email, atau audit UI'
                  : 'Research, X/email drafting, or UI audit specialist'
              }
              className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="new-bot-route"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              OmniRoute Target
            </label>
            <select
              id="new-bot-route"
              value={routingTarget}
              onChange={(e) => setRoutingTarget(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
            >
              {virtualCombos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <AvatarStudio
            spec={avatarSpec}
            locale={locale}
            onChange={setAvatarSpec}
            compact
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
            >
              {isId ? 'Batal' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isId ? 'Simpan Bot' : 'Create Bot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
