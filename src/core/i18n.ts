/**
 * qyro-i18n — Fluent (.ftl) localization engine & Indonesian timezone resolver
 * Supports First-Class Bahasa Indonesia (id-ID) & English (en-US)
 */

import fs from 'node:fs';
import path from 'node:path';
import type { UiLocale } from './types';

export interface IndonesianTimezoneInfo {
  code: 'WIB' | 'WITA' | 'WIT';
  iana: 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';
  utcOffsetHours: 7 | 8 | 9;
}

export const INDONESIAN_TIMEZONES: Record<'WIB' | 'WITA' | 'WIT', IndonesianTimezoneInfo> = {
  WIB: { code: 'WIB', iana: 'Asia/Jakarta', utcOffsetHours: 7 },
  WITA: { code: 'WITA', iana: 'Asia/Makassar', utcOffsetHours: 8 },
  WIT: { code: 'WIT', iana: 'Asia/Jayapura', utcOffsetHours: 9 },
};

export function resolveTimezone(input: string): string {
  const normalized = input.trim().toUpperCase();
  if (normalized === 'WIB') return INDONESIAN_TIMEZONES.WIB.iana;
  if (normalized === 'WITA') return INDONESIAN_TIMEZONES.WITA.iana;
  if (normalized === 'WIT') return INDONESIAN_TIMEZONES.WIT.iana;
  return input.trim() || 'Asia/Jakarta';
}

export function parseFtl(source: string): Record<string, string> {
  const messages: Record<string, string> = {};
  const lines = source.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (key) {
      messages[key] = value;
    }
  }
  return messages;
}

export function interpolateFtl(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\s*\$([a-zA-Z0-9_]+)\s*\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    return match;
  });
}

export class QyroI18n {
  private readonly bundles: Record<UiLocale, Record<string, string>>;

  constructor(localesDir?: string) {
    const baseDir = localesDir ?? path.resolve(process.cwd(), 'configs/locales');
    const idSource = fs.readFileSync(path.join(baseDir, 'id-ID.ftl'), 'utf8');
    const enSource = fs.readFileSync(path.join(baseDir, 'en-US.ftl'), 'utf8');
    this.bundles = {
      'id-ID': parseFtl(idSource),
      'en-US': parseFtl(enSource),
    };
  }

  t(locale: UiLocale, key: string, vars?: Record<string, string | number>): string {
    const primary = this.bundles[locale]?.[key];
    const fallback = this.bundles['en-US']?.[key];
    const template = primary ?? fallback ?? key;
    return interpolateFtl(template, vars);
  }

  getBundle(locale: UiLocale): Record<string, string> {
    return { ...this.bundles['en-US'], ...(this.bundles[locale] ?? {}) };
  }

  getSupportedLocales(): UiLocale[] {
    return ['id-ID', 'en-US'];
  }
}
