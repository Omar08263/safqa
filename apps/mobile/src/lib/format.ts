/** One digits style everywhere (Latin digits, like Egyptian stores print them). */
export const num = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '—');
export const egp = (n: number | null | undefined) => (n == null ? '—' : `\u2068${num(Math.round(n))}\u00a0ج.م\u2069`);
export const pct = (n: number) => `${num(Math.round(n))}%`;
export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return 'دلوقتي';
  if (s < 3600) return `من ${Math.round(s / 60)} دقيقة`;
  if (s < 86400) return `من ${Math.round(s / 3600)} ساعة`;
  return `من ${Math.round(s / 86400)} يوم`;
}
export function cairoTime(iso: string): string {
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
export function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' }).format(new Date()));
  if (h >= 5 && h < 12) return 'صباح الفل ☀️';
  if (h >= 12 && h < 17) return 'نهارك سعيد 🌤️';
  if (h >= 17 && h < 22) return 'مساء الخير 🌙';
  return 'سهرانين؟ العروض صاحية 🦉';
}
