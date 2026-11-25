import React, { useEffect, useState } from 'react';
import { Check, FileText, Mail, MessageSquare, PenLine, Send, Trash2 } from 'lucide-react';
import type { BotAccentMode, UiLocale } from '../core/types';
import type { DraftCardPayload } from '../core/agent';

interface DraftCardProps {
  messageId: string;
  draft: DraftCardPayload;
  locale: UiLocale;
  accentMode: BotAccentMode;
  accentHex: string;
  accentEyeHex: '#ffffff' | '#0a0a0c';
  busy?: boolean;
  onAction: (
    messageId: string,
    action: 'edit' | 'humanize' | 'approve_send' | 'save' | 'discard',
    patch?: { to?: string; subject?: string; body?: string }
  ) => Promise<void>;
}

export const DraftCard: React.FC<DraftCardProps> = ({
  messageId,
  draft,
  locale,
  accentMode,
  accentHex,
  accentEyeHex,
  busy = false,
  onAction,
}) => {
  const isId = locale === 'id-ID';
  const [to, setTo] = useState(draft.to ?? '');
  const [subject, setSubject] = useState(draft.subject ?? '');
  const [body, setBody] = useState(draft.body);

  useEffect(() => {
    setTo(draft.to ?? '');
    setSubject(draft.subject ?? '');
    setBody(draft.body);
  }, [draft.to, draft.subject, draft.body]);

  const locked = draft.status === 'approved_sent' || draft.status === 'discarded';
  const isX = draft.channel === 'x_post';
  const isEmail = draft.channel === 'email';
  const maxChars = draft.max_chars ?? 280;
  const overLimit = isX && body.length > maxChars;

  const primaryBtnStyle =
    accentMode === 'bot_color'
      ? { backgroundColor: accentHex, color: accentEyeHex }
      : undefined;

  const channelLabel = isEmail
    ? isId
      ? 'Draf Email'
      : 'Email Draft'
    : isX
      ? isId
        ? 'Draf Utasan X'
        : 'X Post Draft'
      : isId
        ? 'Draf Slack'
        : 'Slack Draft';

  const statusText =
    draft.status === 'approved_sent'
      ? isId
        ? 'Disetujui & dikirim'
        : 'Approved & sent'
      : draft.status === 'saved'
        ? isId
          ? 'Tersimpan sebagai draf'
          : 'Saved as draft'
        : draft.status === 'discarded'
          ? isId
            ? 'Dibuang'
            : 'Discarded'
          : isId
            ? 'Menunggu tinjauan'
            : 'Awaiting review';

  return (
    <div
      className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 space-y-3"
      data-testid={`draft-card-${draft.channel}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-[var(--border-subtle)] pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {isEmail ? (
            <Mail className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          ) : (
            <MessageSquare className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          )}
          <span className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap">
            {channelLabel}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">·</span>
          <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">{statusText}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] shrink-0">
          {draft.humanizer_applied && (
            <span className="font-medium text-[var(--status-success)]">Humanizer</span>
          )}
          {draft.edited_by_user && (
            <span className="font-medium text-[var(--text-secondary)]">
              {isId ? 'Disunting' : 'Edited'}
            </span>
          )}
          {isX && (
            <span
              className={`font-mono tabular-nums ${
                overLimit ? 'text-[var(--status-danger)] font-semibold' : 'text-[var(--text-secondary)]'
              }`}
            >
              {body.length}/{maxChars}
            </span>
          )}
        </div>
      </div>

      {isEmail && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor={`draft-to-${messageId}`}
              className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
            >
              {isId ? 'Kepada' : 'To'}
            </label>
            <input
              id={`draft-to-${messageId}`}
              type="text"
              value={to}
              disabled={locked}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] disabled:opacity-60"
            />
          </div>
          <div>
            <label
              htmlFor={`draft-subj-${messageId}`}
              className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
            >
              {isId ? 'Subjek' : 'Subject'}
            </label>
            <input
              id={`draft-subj-${messageId}`}
              type="text"
              value={subject}
              disabled={locked}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] disabled:opacity-60"
            />
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor={`draft-body-${messageId}`}
          className="sr-only"
        >
          {channelLabel}
        </label>
        <textarea
          id={`draft-body-${messageId}`}
          rows={isEmail ? 5 : 3}
          value={body}
          disabled={locked}
          onChange={(e) => setBody(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm leading-relaxed text-[var(--text-primary)] resize-y disabled:opacity-60"
        />
      </div>

      {!locked ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={busy || overLimit}
            onClick={() => onAction(messageId, 'approve_send', { to, subject, body })}
            style={primaryBtnStyle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-opacity disabled:opacity-50 ${
              accentMode === 'black'
                ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)]'
                : ''
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            {isId ? 'Setujui & Kirim' : 'Approve & Send'}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(messageId, 'humanize', { to, subject, body })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <PenLine className="w-3.5 h-3.5" />
            {isId ? 'Haluskan dengan Humanizer' : 'Polish with Humanizer'}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(messageId, 'save', { to, subject, body })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            {isId ? 'Simpan Draf' : 'Save Draft'}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(messageId, 'discard', { to, subject, body })}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--status-danger)] hover:bg-[var(--bg-surface)] whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isId ? 'Buang' : 'Discard'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Check className="w-3.5 h-3.5 text-[var(--status-success)]" />
          <span>
            {draft.status === 'approved_sent'
              ? isId
                ? draft.edited_by_user
                  ? 'Terkirim. Gaya suntingan kamu disimpan ke qyro-memory.'
                  : 'Draf telah disetujui dan dikirim.'
                : draft.edited_by_user
                  ? 'Sent. Your writing style edits were saved to qyro-memory.'
                  : 'Draft approved and sent.'
              : isId
                ? 'Draf ini telah dibuang.'
                : 'This draft was discarded.'}
          </span>
        </div>
      )}
    </div>
  );
};
