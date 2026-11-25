/**
 * Safqa v5 catalog client for the native app: thousands of real products from Egyptian stores
 * (official feeds + robots-respecting crawler), heat votes, real price history, forecasts, live drops.
 * Same Worker API as the website (/api/v5/*). Votes and link submissions work signed in or anonymous.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API_URL } from './api';

export interface V5Store { slug: string; nameAr: string; nameEn: string; domain?: string }
export interface V5Card {
  id: string; titleAr: string; titleEn: string; brand: string | null; image?: string | null;
  category: { slug: string; nameAr: string; nameEn: string } | null; offerCount: number; condition?: string;
  bestOffer: { priceEgp: number; listPriceEgp: number | null; discountPct: number | null; store: V5Store; url: string; inStock: boolean } | null;
  v5?: { heat: number; hot: number; cold: number; low: number | null; med30: number | null; dropPct: number | null; dropAt: string | null; checkedAt: string | null };
}
export interface V5Offer { store: V5Store; url: string; priceEgp: number; listPriceEgp: number | null; inStock: boolean; checkedAt: string; source: string; userReported: boolean }
export interface V5Prediction { verdict: 'buy' | 'wait' | 'fair' | 'unknown'; confidence: number; reasonAr: string; low90?: number; median?: number }
export type V5Product = V5Card & { offers: V5Offer[]; series: { at: string; price: number }[]; history: { at: string; price: number; store: string }[]; prediction: V5Prediction; similar: V5Card[]; votes: { hot: number; cold: number } };
export interface V5Drop { dropId: number; old: number; new: number; pct: number; at: string; store: V5Store; product: V5Card }
export interface V5Meta { products?: number; offers?: number; drops24: number; stores: (V5Store & { products: number })[]; categories: { slug: string; nameAr: string; emoji: string; n: number }[] }
export interface V5Page { items: V5Card[]; page: number; more: boolean; total: number | null; fuzzy: boolean }

const qs = (o: Record<string, string | number | undefined>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
async function get<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(API_URL + path, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally { clearTimeout(timer); }
}
export const v5 = {
  meta: () => get<V5Meta>('/api/v5/meta'),
  deals: (o: { cat?: string; sort?: string; page?: number }) => get<V5Page>(`/api/v5/deals?${qs({ ...o, limit: 20 })}`),
  search: (q: string, page = 0, sort?: string) => get<V5Page>(`/api/v5/search?${qs({ q, page, sort, limit: 20 })}`),
  product: (id: string) => get<V5Product>(`/api/v5/product/${id}`),
  drops: (since = 0) => get<{ items: V5Drop[]; last: number }>(`/api/v5/drops?${qs({ since, limit: 30 })}`),
  vote: (id: string, v: 1 | -1 | 0) => api<{ hot: number; cold: number; heat: number; mine: number }>('/api/v5/vote', { body: { id, v } }),
  submit: (url: string) => api<{ status: string; productId?: string; message?: string }>('/api/v5/submit', { body: { url } }),
};
export const isV5Id = (id: string) => /^p[0-9a-f]{20}$/.test(id);

/** Generic async loader with refresh. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true);
    try { setData(await fn()); setError(null); } catch (e) { setError(String((e as Error).message)); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void run(); }, [run]);
  return { data, error, loading, refresh: run };
}

/** Paged feed (infinite scroll). */
export function usePaged(load: (page: number) => Promise<V5Page>, deps: unknown[]) {
  const [items, setItems] = useState<V5Card[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fuzzy, setFuzzy] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const gen = useRef(0);
  const fetchPage = useCallback(async (p: number) => {
    const g = ++gen.current;
    setLoading(true);
    try {
      const r = await load(p);
      if (g !== gen.current) return;
      setItems((prev) => { const seen = new Set(p ? prev.map((x) => x.id) : []); return [...(p ? prev : []), ...r.items.filter((x) => !seen.has(x.id))]; });
      setMore(r.more); setPage(p); setFuzzy(r.fuzzy); setTotal(r.total); setError(null);
    } catch (e) { if (g === gen.current) setError(String((e as Error).message)); } finally { if (g === gen.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { setItems([]); void fetchPage(0); }, [fetchPage]);
  return { items, loading, error, more, fuzzy, total, refresh: () => fetchPage(0), next: () => { if (more && !loading) void fetchPage(page + 1); } };
}

/** Live price drops: polls the drop feed every 20 s while mounted (the web uses SSE). */
export function useLiveDrops() {
  const [items, setItems] = useState<V5Drop[]>([]);
  const last = useRef(0);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await v5.drops(last.current);
        if (!alive) return;
        if (r.items.length) { last.current = Math.max(last.current, r.last); setItems((prev) => [...r.items, ...prev].slice(0, 60)); }
      } catch { /* offline: keep what we have */ }
    };
    void tick();
    const t = setInterval(tick, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return items;
}

export const heatLevel = (h: number) => (h >= 150 ? 3 : h >= 60 ? 2 : h >= 20 ? 1 : 0);
export const shopifyThumb = (u?: string | null, w = 400) => (u && /cdn\.shopify/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}width=${w}` : u ?? undefined);
