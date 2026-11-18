/**
 * One data client with a base URL. Today it reads the public snapshot that the
 * daily price refresh publishes on the Safqa site; later the same interface can
 * point at a live API (set SNAPSHOT_URL / API base in app.json "extra").
 * Every successful download is cached for offline use.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { snapshotUrl?: string; siteUrl?: string };
export const SITE_URL = (extra.siteUrl ?? 'https://safqa-eg-safqa.static.hf.space').replace(/\/$/, '');
export const SNAPSHOT_URL = extra.snapshotUrl ?? `${SITE_URL}/demo/snapshot.json`;
const CACHE_KEY = 'safqa.snapshot.v1';

export interface Store { slug: string; nameAr: string; nameEn: string; domain?: string }
export interface Offer {
  id: string; url: string; title: string; priceEgp: number; listPriceEgp: number | null; inStock: boolean;
  rating: number | null; dealScore: number; dealLabel: string; fakeDiscount: boolean; fakeDiscountReason: string | null;
  discountPct: number | null; lastSeenAt: string; store: Store;
}
export interface Product {
  id: string; titleAr: string; titleEn: string; brand: string; model: string;
  category: { slug: string; nameAr: string; nameEn: string } | null;
  offerCount: number; lowestPriceEgp: number | null; bestOffer: Offer | null; image?: string;
}
export interface Series { storeSlug: string; storeNameAr: string; points: { t: string; priceEgp: number }[] }
export interface ProductDetail {
  detail: Product & { offers?: Offer[] };
  history?: { median30: number | null; min90: number | null; series: Series[] };
  prediction?: { recommendation: string; confidence: number; reasonAr: string; expectedLowEgp?: number };
  debate?: { score: number; recommendation: string; explanationAr: string };
  media?: { images: { full: string; thumb: string; store: string }[]; description?: { text: string; store: string } | null; specs?: { key: string; value: string }[] };
}
export interface Snapshot {
  recordedAt: string;
  all: Product[];
  products: Record<string, ProductDetail>;
  fx?: { base: string; rates: Record<string, number>; updatedAt: string; source: string };
}
export interface Loaded { snap: Snapshot; fromCache: boolean; fetchedAt: string }

export function mediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  return /^https?:/.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

export async function cached(): Promise<Loaded | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { snap: Snapshot; fetchedAt: string };
    return { snap: parsed.snap, fetchedAt: parsed.fetchedAt, fromCache: true };
  } catch {
    return null;
  }
}

/** Network first (12 s timeout), cache fallback. Throws only when both fail. */
export async function loadSnapshot(): Promise<Loaded> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(`${SNAPSHOT_URL}?t=${Date.now()}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = (await res.json()) as Snapshot;
    if (!Array.isArray(snap.all)) throw new Error('bad snapshot');
    const fetchedAt = new Date().toISOString();
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ snap, fetchedAt }));
    return { snap, fetchedAt, fromCache: false };
  } catch (error) {
    const fallback = await cached();
    if (fallback) return fallback;
    throw error;
  }
}

export const imageOf = (snap: Snapshot, p: Product): string | undefined =>
  mediaUrl(p.image ?? snap.products[p.id]?.media?.images?.[0]?.thumb);
