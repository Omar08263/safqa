// Safqa v5 catalog client: one data client, one base URL (EDGE_URL). Everything live comes from the
// Worker (/api/v5/*); the static Space falls back to a bundled catalog-lite index for offline search.
import type { ProductCard } from '@safqa/shared';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { EDGE_URL, edge } from './edge';

export interface V5Extra { heat: number; hot: number; cold: number; low: number | null; med30: number | null; dropPct: number | null; dropAt: string | null; firstSeen: string; checkedAt: string | null }
export type V5Card = ProductCard & { image?: string | null; condition?: string; v5?: V5Extra };
export interface V5Offer { store: { slug: string; nameAr: string; nameEn: string; domain: string }; url: string; priceEgp: number; listPriceEgp: number | null; inStock: boolean; checkedAt: string; source: string; userReported: boolean; points: number }
export interface Prediction { verdict: 'buy' | 'wait' | 'fair' | 'unknown'; confidence: number; reasonAr: string; reasonEn: string; low90?: number; median?: number; trend?: number }
export type V5Product = V5Card & { specs: Record<string, unknown>; offers: V5Offer[]; history: { at: string; price: number; store: string }[]; series: { at: string; price: number }[]; prediction: Prediction; similar: V5Card[]; votes: { hot: number; cold: number } };
export interface V5Meta { products?: number; offers?: number; stores: { slug: string; nameAr: string; nameEn: string; domain: string; kind: string; products: number; lastCrawl: string | null }[]; categories: { slug: string; nameAr: string; nameEn: string; emoji: string; n: number }[]; at?: string; drops24: number; amazon: boolean; noon: boolean }
export interface SearchRes { items: V5Card[]; page: number; more: boolean; total: number | null; fuzzy: boolean; query?: string; facets?: { categories: { id: string; n: number }[]; stores: { id: string; n: number }[] } }
export interface Drop { dropId: number; old: number; new: number; pct: number; at: string; store: { slug: string; nameAr: string; nameEn: string }; product: V5Card }

export const isV5Id = (id: string) => /^p[0-9a-f]{20}$/.test(id);
async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${EDGE_URL}${path}`, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`v5 ${r.status}`);
  return r.json() as Promise<T>;
}
const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  return p.toString();
};

export const v5 = {
  meta: () => get<V5Meta>('/api/v5/meta'),
  search: (o: { q?: string; cat?: string; store?: string; sort?: string; min?: number; max?: number; cond?: string; instock?: boolean; page?: number; limit?: number }) => get<SearchRes>(`/api/v5/search?${qs(o)}`),
  suggest: (q: string) => get<{ items: { id: string; title: string; image: string | null; price: number; store: string }[]; fuzzy: boolean }>(`/api/v5/suggest?${qs({ q })}`),
  deals: (o: { cat?: string; sort?: string; page?: number; limit?: number }) => get<SearchRes>(`/api/v5/deals?${qs(o)}`),
  feed: (o: { cats?: string; brands?: string; max?: number }) => get<{ items: V5Card[]; personalised: boolean }>(`/api/v5/feed?${qs(o)}`),
  product: (id: string) => get<V5Product>(`/api/v5/product/${id}`),
  compare: (ids: string[]) => get<{ items: V5Product[] }>(`/api/v5/compare?ids=${ids.join(',')}`),
  drops: (since = 0, limit = 30) => get<{ items: Drop[]; last: number }>(`/api/v5/drops?${qs({ since, limit })}`),
  coupons: (store?: string) => get<{ coupons: { id: string; store: { slug: string; nameAr: string; nameEn: string }; code: string | null; title: string; expires: string | null; worked: number; failed: number; created_at: string }[]; storeSales: V5Card[] }>(`/api/v5/coupons?${qs({ store })}`),
  vote: (id: string, v: number) => edge<{ hot: number; cold: number; heat: number; mine: number }>('/api/v5/vote', { method: 'POST', body: { id, v } }),
  myVotes: (ids: string[]) => edge<{ votes: Record<string, number> }>(`/api/v5/votes/mine?ids=${ids.join(',')}`),
  submit: (url: string) => edge<{ status: string; productId?: string; message?: string; via?: string }>('/api/v5/submit', { method: 'POST', body: { url } }),
  addCoupon: (b: { store: string; title: string; code?: string; expires?: string }) => edge<{ id: string }>('/api/v5/coupons', { method: 'POST', body: b }),
  couponFeedback: (id: string, worked: boolean) => edge(`/api/v5/coupons/${id}/feedback`, { method: 'POST', body: { worked } }),
};

export const useV5Meta = () => useQuery({ queryKey: ['v5', 'meta'], queryFn: v5.meta, staleTime: 5 * 60_000, retry: 1 });
export const useV5Product = (id: string) => useQuery({ queryKey: ['v5', 'product', id], queryFn: () => v5.product(id), enabled: Boolean(id), retry: 1 });
export function useV5Deals(cat: string | undefined, sort: string) {
  return useInfiniteQuery({
    queryKey: ['v5', 'deals', cat ?? '', sort],
    queryFn: ({ pageParam }) => v5.deals({ cat, sort, page: pageParam, limit: 24 }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.more ? last.page + 1 : undefined),
    retry: 1,
  });
}

// ---------------- interests (personalised feed, stays on this device) ----------------
const INT_KEY = 'safqa.v5.interests';
type Interests = { cats: Record<string, number>; brands: Record<string, number>; maxSeen: number[] };
const readInt = (): Interests => { try { return { cats: {}, brands: {}, maxSeen: [], ...JSON.parse(localStorage.getItem(INT_KEY) ?? '{}') }; } catch { return { cats: {}, brands: {}, maxSeen: [] }; } };
export function noteInterest(p: { category?: { slug: string } | null; brand?: string | null; lowestPriceEgp?: number | null }, weight = 1) {
  const i = readInt();
  if (p.category?.slug && p.category.slug !== 'other') i.cats[p.category.slug] = (i.cats[p.category.slug] ?? 0) + weight;
  if (p.brand) i.brands[p.brand.toLowerCase()] = (i.brands[p.brand.toLowerCase()] ?? 0) + weight;
  if (p.lowestPriceEgp) i.maxSeen = [...i.maxSeen.slice(-19), p.lowestPriceEgp];
  localStorage.setItem(INT_KEY, JSON.stringify(i));
}
export function topInterests() {
  const i = readInt();
  const top = (o: Record<string, number>, n: number) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  return { cats: top(i.cats, 3), brands: top(i.brands, 3), hasAny: Object.keys(i.cats).length + Object.keys(i.brands).length > 0 };
}
export const clearInterests = () => localStorage.removeItem(INT_KEY);

// ---------------- live drops (SSE with polling fallback) ----------------
export function useLiveDrops(max = 12) {
  const [items, setItems] = useState<Drop[]>([]);
  const [live, setLive] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    let es: EventSource | null = null; let timer: number | undefined; let stopped = false;
    v5.drops(0, max).then((d) => { if (stopped) return; setItems(d.items); last.current = d.last; start(); }).catch(() => start());
    function start() {
      if (stopped) return;
      if (typeof EventSource !== 'undefined') {
        es = new EventSource(`${EDGE_URL}/api/v5/live?since=${last.current}`);
        es.addEventListener('hello', () => setLive(true));
        es.addEventListener('drops', (e) => {
          const fresh = JSON.parse((e as MessageEvent).data) as Drop[];
          last.current = Math.max(last.current, ...fresh.map((x) => x.dropId));
          setItems((cur) => [...fresh, ...cur.filter((c) => !fresh.some((f) => f.dropId === c.dropId))].slice(0, max));
        });
        es.onerror = () => { setLive(false); };
      } else {
        timer = window.setInterval(async () => { const d = await v5.drops(last.current, 10).catch(() => null); if (d?.items.length) { last.current = d.last; setItems((cur) => [...d.items, ...cur].slice(0, max)); } }, 30_000);
      }
    }
    return () => { stopped = true; es?.close(); if (timer) window.clearInterval(timer); };
  }, [max]);
  return { items, live };
}

/** Relative "x minutes ago" in Egyptian Arabic / English with Latin digits. */
export function ago(iso: string | null | undefined, ar: boolean): string {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return ar ? 'دلوقتي' : 'just now';
  if (m < 60) return ar ? `من ${m} دقيقة` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return ar ? `من ${h} ساعة` : `${h} h ago`;
  const d = Math.round(h / 24);
  return ar ? `من ${d} يوم` : `${d} d ago`;
}

// ---------------- adapters so v4 screens (compare) accept v5 catalog ids ----------------
export async function v5AsDetail(id: string) {
  const p = await v5.product(id);
  return {
    ...p,
    median30: p.v5?.med30 ?? null,
    min90: p.prediction.low90 ?? p.v5?.low ?? null,
    offers: p.offers.map((o) => ({ id: `${id}-${o.store.slug}`, store: o.store, url: o.url, priceEgp: o.priceEgp, listPriceEgp: o.listPriceEgp, inStock: o.inStock, checkedAt: o.checkedAt })),
  };
}
export async function v5AsHistory(id: string) {
  const p = await v5.product(id);
  return { series: [{ store: p.bestOffer?.store ?? null, points: p.series.map((s) => ({ t: s.at, priceEgp: s.price })) }] };
}
export async function v5AsPrediction(id: string) {
  const p = await v5.product(id);
  return { recommendation: p.prediction.verdict === 'buy' ? 'buy_now' : p.prediction.verdict === 'wait' ? 'wait' : 'unknown' };
}
