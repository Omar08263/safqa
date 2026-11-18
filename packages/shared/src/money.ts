import type { Locale } from './i18n';

/**
 * One digits style everywhere: Latin digits with thousands separators, as
 * Egyptian stores (B.TECH, 2B, Amazon.eg, Noon) print them in Arabic too.
 * Arabic: "12,999 ج.م" · English: "EGP 12,999".
 */
export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatEGP(value: number, locale: Locale): string {
  const n = formatNumber(Math.round(value));
  return locale === 'ar' ? `${n}\u00a0ج.م` : `EGP\u00a0${n}`;
}

export function formatPct(value: number, _locale: Locale): string {
  return `${formatNumber(Math.round(value))}%`;
}
