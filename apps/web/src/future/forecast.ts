// Price time-machine forecast. Honest by design: blends the observed trend
// (when there is enough history) with category drift and Egypt's sale seasons,
// and widens the band when data is thin. Pure function → unit-tested.
export interface Pt { t: number; p: number }
export interface Season { id: string; ar: string; from: [number, number]; to: [number, number]; cut: Record<string, number> & { default: number } }

// Recurring Egyptian retail seasons (month 1-12, day). cut = expected discount fraction.
export const SEASONS: Season[] = [
  { id: 'white-friday', ar: 'الجمعة البيضاء', from: [11, 18], to: [12, 3], cut: { default: 0.08, phones: 0.07, laptops: 0.1, audio: 0.14, tvs: 0.12, appliances: 0.1 } },
  { id: 'new-year', ar: 'عروض راس السنة', from: [12, 24], to: [1, 6], cut: { default: 0.05, audio: 0.08 } },
  { id: 'ramadan', ar: 'عروض رمضان', from: [2, 8], to: [3, 10], cut: { default: 0.06, appliances: 0.1, tvs: 0.09 } },
  { id: 'eid', ar: 'عروض العيد', from: [3, 18], to: [3, 26], cut: { default: 0.05 } },
  { id: 'summer', ar: 'تخفيضات الصيف', from: [7, 1], to: [7, 31], cut: { default: 0.05, appliances: 0.08 } },
  { id: 'school', ar: 'عروض المدارس', from: [9, 1], to: [9, 25], cut: { default: 0.04, laptops: 0.08, tablets: 0.08 } },
  { id: '11-11', ar: 'عروض 11.11', from: [11, 9], to: [11, 12], cut: { default: 0.06 } },
];
// Monthly drift in EGP terms: electronics depreciate, appliances follow inflation.
const DRIFT: Record<string, number> = { phones: -0.018, laptops: -0.012, tablets: -0.015, audio: -0.01, tvs: -0.01, wearables: -0.015, gaming: -0.008, appliances: 0.012, default: -0.004 };
const DAY = 86400_000;

function inSeason(s: Season, d: Date) {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  const a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1];
  return a <= b ? md >= a && md <= b : md >= a || md <= b;
}
export const seasonOn = (d: Date) => SEASONS.find((s) => inSeason(s, d)) ?? null;

export interface Forecast { now: number; points: { t: number; mid: number; lo: number; hi: number; season: string | null }[]; low: { t: number; p: number }; verdict: 'buy_now' | 'wait' | 'hold'; confidence: number; reasonAr: string; slopeDay: number; seasonNow: string | null }

export function forecast(history: Pt[], current: number, category: string | null, days = 45, today = new Date()): Forecast {
  const pts = history.filter((x) => x.p > 0).sort((a, b) => a.t - b.t);
  const spanDays = pts.length > 1 ? (pts[pts.length - 1]!.t - pts[0]!.t) / DAY : 0;
  // Least-squares slope (per day) on log price, trusted only with real span.
  let slope = 0;
  if (pts.length >= 3 && spanDays >= 5) {
    const xs = pts.map((x) => (x.t - pts[0]!.t) / DAY), ys = pts.map((x) => Math.log(x.p));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0), den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    slope = den ? Math.max(-0.01, Math.min(0.01, num / den)) : 0;
  }
  const trust = Math.min(1, spanDays / 60);
  const drift = (DRIFT[category ?? ''] ?? DRIFT.default!) / 30;
  const slopeDay = slope * trust + drift * (1 - trust);
  const seasonNow = seasonOn(today)?.ar ?? null;
  const nowCut = seasonOn(today)?.cut[category ?? ''] ?? seasonOn(today)?.cut.default ?? 0;
  const out: Forecast['points'] = [];
  let low = { t: today.getTime(), p: current };
  for (let d = 1; d <= days; d += 1) {
    const day = new Date(today.getTime() + d * DAY);
    const s = seasonOn(day);
    const cut = s ? (s.cut[category ?? ''] ?? s.cut.default) : 0;
    // Prices already include today's seasonal cut; remove it, apply the future one.
    const base = (current / (1 - nowCut)) * Math.exp(slopeDay * d);
    const mid = base * (1 - cut);
    const width = (0.025 + 0.012 * Math.sqrt(d)) * (1.6 - trust * 0.8) * (pts.length < 3 ? 1.4 : 1);
    out.push({ t: day.getTime(), mid, lo: mid * (1 - width), hi: mid * (1 + width), season: s?.ar ?? null });
    if (mid < low.p) low = { t: day.getTime(), p: mid };
  }
  const gain = (current - low.p) / current;
  const daysToLow = Math.round((low.t - today.getTime()) / DAY);
  const confidence = Math.round((0.35 + trust * 0.4 + (pts.length >= 3 ? 0.1 : 0)) * 100) / 100;
  let verdict: Forecast['verdict'] = 'hold', reasonAr = 'السعر غالبًا هيفضل قريب من كده الأسابيع الجاية.';
  if (seasonNow && nowCut >= 0.05) { verdict = 'buy_now'; reasonAr = `إحنا في ${seasonNow} دلوقتي — ده من أرخص أوقات السنة للقسم ده.`; }
  else if (gain >= 0.04 && daysToLow <= days) { verdict = 'wait'; reasonAr = `متوقع ينزل حوالي ${Math.round(gain * 100)}% خلال ${daysToLow} يوم${out.find((x) => x.t === low.t)?.season ? ` مع ${out.find((x) => x.t === low.t)!.season}` : ''}.`; }
  else if (slopeDay > 0.0003) { verdict = 'buy_now'; reasonAr = 'الاتجاه طالع (تضخم/دولار) — الشراء بدري أوفر.'; }
  return { now: current, points: out, low, verdict, confidence, reasonAr, slopeDay, seasonNow };
}
