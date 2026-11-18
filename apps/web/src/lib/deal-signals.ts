// Deal signals from REAL data only: the catalog's current offers and each
// product's recorded price history. Used by the deal hunters, the
// notifications team, the radar page and the agent chat engine.
import type { PriceHistory, ProductCard } from '@safqa/shared';
import { hash32, pick } from './arabic';

export type SignalKind = 'drop' | 'all_time_low' | 'fake_discount' | 'cheapest_store_gap' | 'back_in_stock';
export interface DealSignal {
  id: string; // stable: kind + product + price
  kind: SignalKind;
  productId: string;
  title: string;
  titleEn: string;
  priceEgp: number;
  beforeEgp?: number;
  pct?: number;
  store: string;
  storeEn: string;
  exceptional: boolean;
  headline: string;
  headlineEn: string;
  body: string;
  at: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

const dropHeadlines = [
  (t: string, p: number, pct: number) => `🔥 ${t} نزل ${pct}% — دلوقتي ${fmt(p)} ج`,
  (t: string, p: number, pct: number) => `⚡ وقع السعر! ${t} بقى ${fmt(p)} ج (−${pct}%)`,
  (t: string, p: number, pct: number) => `🎯 لقطة: ${t} أرخص بـ ${pct}% من آخر تحديث`,
  (t: string, p: number, pct: number) => `💸 فرصة حقيقية — ${t} بـ ${fmt(p)} ج بعد نزول ${pct}%`,
  (t: string, p: number, pct: number) => `🚨 مش هتصدق: ${t} نزل ${pct}% وبقى ${fmt(p)} ج`,
];
const lowHeadlines = [
  (t: string, p: number) => `🏆 أقل سعر سجلناه: ${t} بـ ${fmt(p)} ج`,
  (t: string, p: number) => `📉 ${t} عند القاع — ${fmt(p)} ج`,
  (t: string, p: number) => `✨ أرخص ما وصل له ${t}: ${fmt(p)} ج`,
];
const gapHeadlines = [
  (t: string, gap: number, s: string) => `🧠 نفس ${t} أرخص بـ ${fmt(gap)} ج في ${s}`,
  (t: string, gap: number, s: string) => `👀 متدفعش زيادة: ${t} أوفر بـ ${fmt(gap)} ج عند ${s}`,
];
const fakeHeadlines = [
  (t: string) => `⚠️ خلي بالك: خصم ${t} شكله مضخّم`,
  (t: string) => `🕵️ الخصم على ${t} مش حقيقي — اعرف ليه`,
];

export function signalsFrom(products: ProductCard[], histories: Record<string, PriceHistory | undefined>): DealSignal[] {
  const out: DealSignal[] = [];
  for (const p of products) {
    const o = p.bestOffer;
    if (!o) continue;
    const h = histories[p.id];
    const at = o.lastSeenAt;
    const base = { productId: p.id, title: p.titleAr, titleEn: p.titleEn, priceEgp: o.priceEgp, store: o.store.nameAr, storeEn: o.store.nameEn, at };
    if (h) {
      const series = h.series.filter((s) => s.points.length > 1);
      for (const s of series) {
        const last = s.points.at(-1)?.priceEgp ?? 0;
        const prev = s.points.at(-2)?.priceEgp ?? 0;
        if (prev > 0 && last < prev && (prev - last) / prev >= 0.02) {
          const pct = Math.round(((prev - last) / prev) * 100);
          const seed = hash32(`${p.id}${last}`);
          out.push({ ...base, id: `drop:${p.id}:${s.storeSlug}:${last}`, kind: 'drop', priceEgp: last, beforeEgp: prev, pct, store: s.storeNameAr, storeEn: s.storeNameEn, exceptional: pct >= 10, headline: pick(dropHeadlines, seed)(p.titleAr, last, pct), headlineEn: `🔥 ${p.titleEn} dropped ${pct}% to EGP ${fmt(last)}`, body: `كان ${fmt(prev)} ج في ${s.storeNameAr} وبقى ${fmt(last)} ج — حسب آخر تحديث للأسعار الحقيقية.` });
        }
      }
      const all = h.series.flatMap((s) => s.points.map((x) => x.priceEgp));
      const days = new Set(h.series.flatMap((s) => s.points.map((x) => x.t.slice(0, 10)))).size;
      if (days >= 3 && all.length > 2 && o.priceEgp <= Math.min(...all)) out.push({ ...base, id: `low:${p.id}:${o.priceEgp}`, kind: 'all_time_low', exceptional: false, headline: pick(lowHeadlines, hash32(p.id))(p.titleAr, o.priceEgp), headlineEn: `🏆 Lowest recorded: ${p.titleEn} at EGP ${fmt(o.priceEgp)}`, body: `أقل سعر في ${days} يوم من التتبع.` });
    }
    if (o.fakeDiscount) out.push({ ...base, id: `fake:${p.id}:${o.priceEgp}`, kind: 'fake_discount', exceptional: false, headline: pick(fakeHeadlines, hash32(p.id))(p.titleAr), headlineEn: `⚠️ ${p.titleEn}: the discount looks inflated`, body: o.fakeDiscountReason ?? 'السعر "قبل الخصم" أعلى من اللي سجلناه فعلًا.' });
  }
  return out.sort((a, b) => Number(b.exceptional) - Number(a.exceptional) || (b.pct ?? 0) - (a.pct ?? 0));
}

/** Store-gap signals need full offer lists (product detail). */
export function gapSignal(p: { id: string; titleAr: string; titleEn: string; offers: { priceEgp: number; inStock: boolean; condition: string; store: { nameAr: string; nameEn: string }; lastSeenAt: string }[] }): DealSignal | null {
  const offers = p.offers.filter((o) => o.inStock && o.condition === 'new').sort((a, b) => a.priceEgp - b.priceEgp);
  if (offers.length < 2) return null;
  const lo = offers[0] as (typeof offers)[number];
  const hi = offers.at(-1) as (typeof offers)[number];
  const gap = hi.priceEgp - lo.priceEgp;
  if (gap < 200 || gap / hi.priceEgp < 0.03) return null;
  return { id: `gap:${p.id}:${lo.priceEgp}:${hi.priceEgp}`, kind: 'cheapest_store_gap', productId: p.id, title: p.titleAr, titleEn: p.titleEn, priceEgp: lo.priceEgp, beforeEgp: hi.priceEgp, pct: Math.round((gap / hi.priceEgp) * 100), store: lo.store.nameAr, storeEn: lo.store.nameEn, exceptional: gap / hi.priceEgp >= 0.1, headline: pick(gapHeadlines, hash32(p.id))(p.titleAr, gap, lo.store.nameAr), headlineEn: `🧠 Same ${p.titleEn} is EGP ${fmt(gap)} cheaper at ${lo.store.nameEn}`, body: `${lo.store.nameAr}: ${fmt(lo.priceEgp)} ج مقابل ${hi.store.nameAr}: ${fmt(hi.priceEgp)} ج.`, at: lo.lastSeenAt };
}
