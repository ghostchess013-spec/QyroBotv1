import React, { useMemo, useState } from 'react';
import { Dices, RotateCcw, Upload, Image as ImageIcon, Check } from 'lucide-react';
import {
  AVATAR_COLORS,
  AVATAR_EXPRESSIONS,
  AVATAR_SHAPES,
  type AvatarColorName,
  type AvatarExpression,
  type AvatarShape,
  type BotAvatarSpec,
  type UiLocale,
} from '../core/types';
import { QyroBotAvatar } from './QyroBotAvatar';

interface AvatarStudioProps {
  spec: BotAvatarSpec;
  isChiefOfStaff?: boolean;
  locale: UiLocale;
  onChange: (next: BotAvatarSpec) => void;
  compact?: boolean;
}

const DEFAULT_SPEC: BotAvatarSpec = {
  type: 'procedural',
  shape: 'circle',
  color: 'ink',
  expression: 'attentive',
  animationOverride: null,
  assetPath: null,
};

function hashPrompt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function buildGeneratedSvgDataUri(prompt: string, variantIdx: number): string {
  const h = hashPrompt(`${prompt}:${variantIdx}`);
  const bgA = AVATAR_COLORS[h % AVATAR_COLORS.length].hex;
  const bgB = AVATAR_COLORS[(h + 3 + variantIdx) % AVATAR_COLORS.length].hex;
  const accent = AVATAR_COLORS[(h + 7 + variantIdx) % AVATAR_COLORS.length].hex;
  const eyeColor = (h % 2 === 0) ? '#ffffff' : '#0a0a0c';
  const r = 16 + (h % 8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <defs><linearGradient id="g${variantIdx}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bgA}"/><stop offset="100%" stop-color="${bgB}"/></linearGradient></defs>
    <rect width="128" height="128" rx="28" fill="url(#g${variantIdx})"/>
    <circle cx="${32 + (h % 64)}" cy="${26 + (h % 22)}" r="${r}" fill="${accent}" fill-opacity="0.28"/>
    <rect x="26" y="30" width="76" height="68" rx="${18 + variantIdx * 4}" fill="${bgA}" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
    <circle cx="50" cy="62" r="6" fill="${eyeColor}"/>
    <circle cx="78" cy="62" r="6" fill="${eyeColor}"/>
    <path d="M52 78 Q64 ${84 + variantIdx * 2} 76 78" fill="none" stroke="${eyeColor}" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const AvatarStudio: React.FC<AvatarStudioProps> = ({
  spec,
  isChiefOfStaff = false,
  locale,
  onChange,
  compact = false,
}) => {
  const isId = locale === 'id-ID';
  const [tab, setTab] = useState<'bot' | 'generate' | 'upload'>('bot');
  const [genPrompt, setGenPrompt] = useState('Minimalist studio strategist robot');
  const [generatedSet, setGeneratedSet] = useState<string[]>([]);
  const [selectedGenerated, setSelectedGenerated] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(
    spec.type === 'uploaded' ? spec.assetPath ?? null : null
  );

  const liveSpec = useMemo<BotAvatarSpec>(
    () => ({
      ...spec,
      type: tab === 'bot' ? 'procedural' : spec.type,
    }),
    [spec, tab]
  );

  const handleRandomize = () => {
    const shape = AVATAR_SHAPES[Math.floor(Math.random() * AVATAR_SHAPES.length)] as AvatarShape;
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)].id as AvatarColorName;
    const expression =
      AVATAR_EXPRESSIONS[Math.floor(Math.random() * AVATAR_EXPRESSIONS.length)] as AvatarExpression;
    onChange({
      type: 'procedural',
      shape,
      color,
      expression,
      animationOverride: null,
      assetPath: null,
    });
  };

  const handleReset = () => {
    onChange({ ...DEFAULT_SPEC });
  };

  const handleGenerate = () => {
    const clean = genPrompt.trim() || 'QyroBot Minimalist';
    const items = [0, 1, 2, 3].map((i) => buildGeneratedSvgDataUri(clean, i));
    setGeneratedSet(items);
    setSelectedGenerated(items[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setUploadError(
        isId ? 'Format didukung: PNG, JPEG, WebP, atau SVG.' : 'Supported formats: PNG, JPEG, WebP, or SVG.'
      );
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setUploadError(isId ? 'Ukuran berkas melebihi batas 25 MB.' : 'File size exceeds 25 MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      {/* 3-Tab Studio Switcher */}
      <div
        className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
        role="tablist"
        aria-label="Avatar Studio Tabs"
      >
        {(
          [
            { id: 'bot', label: 'Bot' },
            { id: 'generate', label: isId ? 'Buat' : 'Generate' },
            { id: 'upload', label: isId ? 'Unggah' : 'Upload' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              tab === item.id
                ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Live 3-Mood Preview Strip */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              { mood: 'idle', label: 'Idle' },
              { mood: 'thinking', label: isId ? 'Berpikir' : 'Thinking' },
              { mood: 'waiting', label: isId ? 'Butuh kamu' : 'Needs you' },
            ] as const
          ).map((preview) => (
            <div key={preview.mood} className="flex flex-col items-center gap-1.5">
              <QyroBotAvatar
                spec={liveSpec}
                mood={preview.mood}
                size={compact ? 42 : 48}
                isChiefOfStaff={isChiefOfStaff}
                label={`${preview.label} avatar preview`}
              />
              <span className="text-[11px] text-[var(--text-secondary)]">{preview.label}</span>
            </div>
          ))}
        </div>
      </div>

      {tab === 'bot' && (
        <div className="space-y-4">
          {/* 8 Shapes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {isId ? 'Bentuk (8)' : 'Shape (8)'}
              </span>
              <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                {spec.shape}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {AVATAR_SHAPES.map((shape) => {
                const active = spec.type === 'procedural' && spec.shape === shape;
                return (
                  <button
                    key={shape}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...spec,
                        type: 'procedural',
                        shape,
                        assetPath: null,
                      })
                    }
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-colors ${
                      active
                        ? 'border-[var(--text-primary)] bg-[var(--bg-surface-hover)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)]'
                    }`}
                    aria-label={`Shape ${shape}`}
                  >
                    <QyroBotAvatar
                      spec={{ ...spec, type: 'procedural', shape, assetPath: null }}
                      size={28}
                      label={shape}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* 12 Official Hex Colors */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {isId ? 'Warna & Kontras Otomatis (12)' : 'Color & Auto-Contrast (12)'}
              </span>
              <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                {AVATAR_COLORS.find((c) => c.id === spec.color)?.hex}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {AVATAR_COLORS.map((c) => {
                const active = spec.color === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...spec,
                        type: 'procedural',
                        color: c.id,
                        assetPath: null,
                      })
                    }
                    aria-label={`Color ${c.id}`}
                    title={`${c.id} (${c.hex})`}
                    className={`h-8 rounded-lg border flex items-center justify-center transition-transform ${
                      active
                        ? 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-canvas)] border-transparent'
                        : 'border-[var(--border-subtle)] hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {active && <Check className="w-3.5 h-3.5" style={{ color: c.eyeHex }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 16 Expressions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {isId ? 'Ekspresi Wajah (16)' : 'Expression (16)'}
              </span>
              <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                {spec.expression}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {AVATAR_EXPRESSIONS.map((expression) => {
                const active = spec.type === 'procedural' && spec.expression === expression;
                return (
                  <button
                    key={expression}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...spec,
                        type: 'procedural',
                        expression,
                        assetPath: null,
                      })
                    }
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium truncate transition-colors ${
                      active
                        ? 'border-[var(--text-primary)] bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {expression}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Randomize / Reset Controls */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleRandomize}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
            >
              <Dices className="w-3.5 h-3.5" />
              {isId ? 'Acak' : 'Randomize'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
      )}

      {tab === 'generate' && (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="avatar-generate-prompt"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
            >
              {isId ? 'Deskripsi karakter avatar' : 'Avatar character description'}
            </label>
            <input
              id="avatar-generate-prompt"
              type="text"
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              placeholder={isId ? 'Mis. robot minimalis geometris' : 'e.g. minimalist geometric studio bot'}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
            />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {isId ? 'Buat 4 Kandidat Avatar' : 'Generate 4 Candidates'}
          </button>

          {generatedSet.length > 0 && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-4 gap-2">
                {generatedSet.map((uri, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedGenerated(uri)}
                    className={`p-1 rounded-xl border transition-colors ${
                      selectedGenerated === uri
                        ? 'border-[var(--text-primary)] bg-[var(--bg-surface-hover)]'
                        : 'border-[var(--border-subtle)]'
                    }`}
                    aria-label={`Generated candidate ${idx + 1}`}
                  >
                    <img
                      src={uri}
                      alt={`Candidate ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full aspect-square rounded-lg object-cover"
                    />
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!selectedGenerated}
                onClick={() => {
                  if (!selectedGenerated) return;
                  onChange({
                    ...spec,
                    type: 'generated',
                    assetPath: selectedGenerated,
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium"
              >
                {isId ? 'Pasang Avatar Terpilih' : 'Set Avatar'}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'upload' && (
        <div className="space-y-3">
          <label
            htmlFor="avatar-upload-input"
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] cursor-pointer text-center"
          >
            <Upload className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-xs font-medium text-[var(--text-primary)]">
              {isId ? 'Pilih berkas PNG, JPEG, WebP, atau SVG' : 'Select PNG, JPEG, WebP, or SVG'}
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {isId ? 'Maksimal 25 MB' : 'Maximum 25 MB'}
            </span>
            <input
              id="avatar-upload-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          {uploadError && (
            <p className="text-xs text-[var(--status-danger)]" role="alert">
              {uploadError}
            </p>
          )}

          {uploadPreview && (
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
              <img
                src={uploadPreview}
                alt="Uploaded avatar preview"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover border border-[var(--border-subtle)]"
              />
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...spec,
                    type: 'uploaded',
                    assetPath: uploadPreview,
                  })
                }
                className="ml-auto px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                {isId ? 'Pasang Avatar' : 'Set Avatar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
