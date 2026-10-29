import type { Locale } from './i18n';

const tag = (lang: Locale) => (lang === 'tr' ? 'tr-TR' : 'en-US');

/** USD from integer micros, e.g. 1_234_500_000n → "$1,234.50". */
export function usd(micros: bigint, lang: Locale, opts: { compact?: boolean } = {}): string {
  const value = Number(micros) / 1e6;
  return new Intl.NumberFormat(tag(lang), {
    style: 'currency',
    currency: 'USD',
    notation: opts.compact && value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: value < 10 && !opts.compact ? 2 : value >= 10_000 && opts.compact ? 1 : 2,
  }).format(value);
}

export function num(value: number, lang: Locale): string {
  return new Intl.NumberFormat(tag(lang)).format(value);
}

export function dateTime(value: Date, lang: Locale): string {
  return new Intl.DateTimeFormat(tag(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(value);
}

export function shortDate(iso: string, lang: Locale): string {
  return new Intl.DateTimeFormat(tag(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/** Percentage change between periods; null when there is no baseline. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function countryName(code: string, lang: Locale): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames([tag(lang)], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function flag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
