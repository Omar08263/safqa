import { useEffect, useSyncExternalStore } from 'react';
import { edge, signedInToBackend } from './edge';
import type { Cue } from './sound';

/**
 * Safqa memberships. Prices are EGP / month and match the real backend
 * (apps/edge/src/tiers.ts, GET /api/v2/tiers) and the InstaPay checkout at #/pay.
 * The member's tier always comes from the server (GET /api/auth/me) and is
 * cached locally, so limits still apply offline. Signed-out visitors are «مجاني».
 * Limits marked `live` are enforced in the app today.
 */
export type TierId = 'free' | 'silver' | 'gold' | 'diamond';

export interface Perk {
  ar: string;
  en: string;
  values: Record<TierId, string | boolean>;
  live: boolean;
}

export interface Tier {
  id: TierId;
  ar: string;
  en: string;
  emoji: string;
  taglineAr: string;
  taglineEn: string;
  badge: string;
  colors: [string, string, string];
  glow: string;
  sound: Cue;
  priceEgp: number;
  priceAr: string;
  priceEn: string;
  limits: { watchlist: number; alerts: number; collections: number; compare: number };
}

export const tiers: Tier[] = [
  {
    id: 'free', ar: 'مجاني', en: 'Free', emoji: '🌱', taglineAr: 'كل الأساسيات، ببلاش وللأبد', taglineEn: 'All the essentials, free forever',
    badge: '/brand/tiers/free.svg', colors: ['#7EE2B8', '#1FA67A', '#0B5A44'], glow: '', sound: 'tier-free',
    priceEgp: 0, priceAr: 'ببلاش', priceEn: 'Free', limits: { watchlist: 10, alerts: 5, collections: 3, compare: 4 },
  },
  {
    id: 'silver', ar: 'فضّي', en: 'Silver', emoji: '🥈', taglineAr: 'للي بيدوّر كتير ومش عايز يفوّت عرض', taglineEn: 'For frequent hunters who hate missing a deal',
    badge: '/brand/tiers/silver.svg', colors: ['#F4F7FB', '#B8C4D3', '#6B7A8F'], glow: 'tier-glow-silver', sound: 'tier-silver',
    priceEgp: 49, priceAr: '49 ج.م / شهر', priceEn: 'EGP 49 / month', limits: { watchlist: 30, alerts: 20, collections: 10, compare: 4 },
  },
  {
    id: 'gold', ar: 'ذهبي', en: 'Gold', emoji: '👑', taglineAr: 'تنبيهات أسرع ودعم بأولوية', taglineEn: 'Faster alerts and priority support',
    badge: '/brand/tiers/gold.svg', colors: ['#FFE7A3', '#F5B524', '#B86B05'], glow: 'tier-glow-gold', sound: 'tier-gold',
    priceEgp: 99, priceAr: '99 ج.م / شهر', priceEn: 'EGP 99 / month', limits: { watchlist: 100, alerts: 75, collections: 30, compare: 4 },
  },
  {
    id: 'diamond', ar: 'ماسي', en: 'Diamond', emoji: '💎', taglineAr: 'كل حاجة بلا حدود وأولوية أولى', taglineEn: 'Everything unlimited, first in line',
    badge: '/brand/tiers/diamond.svg', colors: ['#C9F6FF', '#7C9CFF', '#6A3DE8'], glow: 'tier-glow-diamond', sound: 'tier-diamond',
    priceEgp: 199, priceAr: '199 ج.م / شهر', priceEn: 'EGP 199 / month', limits: { watchlist: 500, alerts: 300, collections: 100, compare: 4 },
  },
];

const v = (free: string | boolean, silver: string | boolean, gold: string | boolean, diamond: string | boolean) => ({ free, silver, gold, diamond });

export const perks: Perk[] = [
  { ar: 'منتجات في المراقبة', en: 'Watchlist size', values: v('10', '30', '100', 'بلا حدود (500)'), live: true },
  { ar: 'تنبيهات سعر شغّالة', en: 'Active price alerts', values: v('5', '20', '75', 'بلا حدود (300)'), live: true },
  { ar: 'مجموعات منتجات', en: 'Collections', values: v('3', '10', '30', '100'), live: true },
  { ar: 'أسئلة للوكلاء الأذكياء يوميًا', en: 'AI agent questions / day', values: v('20', '50', '200', '500'), live: true },
  { ar: 'تنبيهات تيليجرام خاصة', en: 'Private Telegram alerts', values: v(false, true, true, true), live: true },
  { ar: 'شارة وإطار في البروفايل والمجتمع', en: 'Profile & community flair', values: v('🌱', '🥈 إطار فضي', '👑 إطار ذهبي متحرك', '💎 إطار ماسي لامع'), live: true },
  { ar: 'صوت وتأثير خاص بالباقة', en: 'Tier sound & effect', values: v(true, true, true, true), live: true },
  { ar: 'كاشف الخصومات الوهمية', en: 'Fake-discount detector', values: v(true, true, true, true), live: true },
  { ar: 'تاريخ السعر', en: 'Price history', values: v('90 يوم', 'كل التاريخ', 'كل التاريخ', 'كل التاريخ'), live: true },
  { ar: 'أدوات أوفلاين', en: 'Offline tools', values: v('كلها', 'كلها', 'كلها', 'كلها'), live: true },
  { ar: 'وصول مبكر لعروض الرادار', en: 'Early deal radar access', values: v(false, false, 'قبلها بساعة', 'قبلها بـ 3 ساعات'), live: false },
  { ar: 'أولوية الدعم', en: 'Support priority', values: v('المجتمع', 'خلال 48 ساعة', 'خلال 24 ساعة', 'نفس اليوم'), live: true },
  { ar: 'من غير إعلانات', en: 'No ads', values: v(true, true, true, true), live: true },
];

export const payUrl = (id: TierId) => `#/pay?tier=${id}`;

// ---------- the member's tier, from the server ----------
const CACHE_KEY = 'safqa.serverTier.v1';
interface Cached { tier: TierId; until: string | null; status: string | null; at: string; userId: string | null }
const empty: Cached = { tier: 'free', until: null, status: null, at: '', userId: null };
function read(): Cached {
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') ?? {}) };
  } catch {
    return empty;
  }
}
let cache: Cached = typeof localStorage === 'undefined' ? empty : read();
const subs = new Set<() => void>();
function write(next: Cached) {
  cache = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f());
}
let inflight: Promise<void> | null = null;
/** Ask the backend for the signed-in member's tier. Offline keeps the last known value. */
export function syncServerTier(): Promise<void> {
  if (!signedInToBackend()) {
    if (cache.tier !== 'free' || cache.userId) write(empty);
    return Promise.resolve();
  }
  inflight ??= edge<{ id: string; tier: TierId; tierUntil: string | null; tierStatus: string | null }>('/api/auth/me')
    .then((u) => write({ tier: tiers.some((t) => t.id === u.tier) ? u.tier : 'free', until: u.tierUntil ?? null, status: u.tierStatus ?? null, at: new Date().toISOString(), userId: u.id }))
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function currentTierId(): TierId {
  return signedInToBackend() ? cache.tier : 'free';
}
export function tierById(id: TierId): Tier {
  return tiers.find((t) => t.id === id) ?? (tiers[0] as Tier);
}
export function limitsNow() {
  return tierById(currentTierId()).limits;
}
export function useTier() {
  const snap = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => cache,
  );
  useEffect(() => {
    void syncServerTier();
    const onFocus = () => void syncServerTier();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  const signedIn = signedInToBackend();
  return {
    tier: tierById(signedIn ? snap.tier : 'free'),
    until: signedIn ? snap.until : null,
    signedIn,
    /** 'server' = confirmed by the backend; 'cache' = last known (offline). */
    source: snap.at ? (snap.at > new Date(Date.now() - 10 * 60_000).toISOString() ? 'server' : 'cache') : 'none',
    refresh: syncServerTier,
  };
}
