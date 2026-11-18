import { readLocal, useLocal, writeLocal } from './local';
import type { Cue } from './sound';

/**
 * Safqa memberships. There is NO payment anywhere in Safqa: «مجاني» is the
 * default, «فضّي» is free to switch on during the launch, «ذهبي» and «ماسي»
 * are «قريبًا» (join the waitlist). Limits marked `live` are enforced in the
 * app today (watchlist, alerts, collections, compare); the others are
 * announced perks that need the shared backend and say so.
 */
export type TierId = 'free' | 'silver' | 'gold' | 'diamond';
export type Availability = 'active' | 'launch-free' | 'soon';

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
  availability: Availability;
  priceAr: string;
  priceEn: string;
  limits: { watchlist: number; alerts: number; collections: number; compare: number };
}

export const tiers: Tier[] = [
  {
    id: 'free', ar: 'مجاني', en: 'Free', emoji: '🌱', taglineAr: 'كل الأساسيات، ببلاش وللأبد', taglineEn: 'All the essentials, free forever',
    badge: '/brand/tiers/free.svg', colors: ['#7EE2B8', '#1FA67A', '#0B5A44'], glow: '', sound: 'tier-free', availability: 'active',
    priceAr: 'ببلاش', priceEn: 'Free', limits: { watchlist: 10, alerts: 5, collections: 3, compare: 4 },
  },
  {
    id: 'silver', ar: 'فضّي', en: 'Silver', emoji: '🥈', taglineAr: 'للي بيدوّر كتير ومش عايز يفوّت عرض', taglineEn: 'For frequent hunters who hate missing a deal',
    badge: '/brand/tiers/silver.svg', colors: ['#F4F7FB', '#B8C4D3', '#6B7A8F'], glow: 'tier-glow-silver', sound: 'tier-silver', availability: 'launch-free',
    priceAr: 'مجاني فترة الإطلاق', priceEn: 'Free during launch', limits: { watchlist: 30, alerts: 20, collections: 10, compare: 4 },
  },
  {
    id: 'gold', ar: 'ذهبي', en: 'Gold', emoji: '👑', taglineAr: 'تنبيهات أسرع ودعم بأولوية', taglineEn: 'Faster alerts and priority support',
    badge: '/brand/tiers/gold.svg', colors: ['#FFE7A3', '#F5B524', '#B86B05'], glow: 'tier-glow-gold', sound: 'tier-gold', availability: 'soon',
    priceAr: 'قريبًا', priceEn: 'Coming soon', limits: { watchlist: 100, alerts: 75, collections: 30, compare: 4 },
  },
  {
    id: 'diamond', ar: 'ماسي', en: 'Diamond', emoji: '💎', taglineAr: 'كل حاجة بلا حدود وأولوية أولى', taglineEn: 'Everything unlimited, first in line',
    badge: '/brand/tiers/diamond.svg', colors: ['#C9F6FF', '#7C9CFF', '#6A3DE8'], glow: 'tier-glow-diamond', sound: 'tier-diamond', availability: 'soon',
    priceAr: 'قريبًا', priceEn: 'Coming soon', limits: { watchlist: 500, alerts: 300, collections: 100, compare: 4 },
  },
];

const v = (free: string | boolean, silver: string | boolean, gold: string | boolean, diamond: string | boolean) => ({ free, silver, gold, diamond });

export const perks: Perk[] = [
  { ar: 'منتجات في المراقبة', en: 'Watchlist size', values: v('10', '30', '100', 'بلا حدود (500)'), live: true },
  { ar: 'تنبيهات سعر شغّالة', en: 'Active price alerts', values: v('5', '20', '75', 'بلا حدود (300)'), live: true },
  { ar: 'مجموعات منتجات', en: 'Collections', values: v('3', '10', '30', '100'), live: true },
  { ar: 'شارة وإطار في البروفايل والمجتمع', en: 'Profile & community flair', values: v('🌱', '🥈 إطار فضي', '👑 إطار ذهبي متحرك', '💎 إطار ماسي لامع'), live: true },
  { ar: 'صوت وتأثير خاص بالباقة', en: 'Tier sound & effect', values: v(true, true, true, true), live: true },
  { ar: 'كاشف الخصومات الوهمية', en: 'Fake-discount detector', values: v(true, true, true, true), live: true },
  { ar: 'تاريخ السعر', en: 'Price history', values: v('90 يوم', 'كل التاريخ', 'كل التاريخ', 'كل التاريخ'), live: true },
  { ar: 'أدوات أوفلاين', en: 'Offline tools', values: v('كلها', 'كلها', 'كلها', 'كلها'), live: true },
  { ar: 'نشرة العروض على الإيميل', en: 'Email deal digest', values: v('أسبوعي', 'يومي', 'يومي + فوري', 'فوري'), live: false },
  { ar: 'وصول مبكر لعروض الرادار', en: 'Early deal radar access', values: v(false, false, 'قبلها بساعة', 'قبلها بـ 3 ساعات'), live: false },
  { ar: 'أولوية الدعم', en: 'Support priority', values: v('المجتمع', 'خلال 48 ساعة', 'خلال 24 ساعة', 'نفس اليوم'), live: false },
  { ar: 'تنبيهات تيليجرام خاصة', en: 'Private Telegram alerts', values: v(false, true, true, true), live: false },
  { ar: 'من غير إعلانات', en: 'No ads', values: v(true, true, true, true), live: true },
];

const TIER_KEY = 'safqa.tier.v1';
const WAIT_KEY = 'safqa.tierWaitlist.v1';

export function currentTierId(): TierId {
  const id = readLocal<TierId>(TIER_KEY, 'free');
  const tier = tiers.find((t) => t.id === id);
  // Only tiers that are actually available can be active.
  return tier && tier.availability !== 'soon' ? id : 'free';
}
export function tierById(id: TierId): Tier {
  return tiers.find((t) => t.id === id) ?? (tiers[0] as Tier);
}
export function limitsNow() {
  return tierById(currentTierId()).limits;
}
export function useTier() {
  const [id, setId] = useLocal<TierId>(TIER_KEY, 'free');
  const safe = tierById(id).availability === 'soon' ? 'free' : id;
  return { tier: tierById(safe), setTier: (next: TierId) => tierById(next).availability !== 'soon' && setId(next) };
}
export function useWaitlist() {
  return useLocal<TierId[]>(WAIT_KEY, []);
}
export function joinWaitlist(id: TierId) {
  const list = readLocal<TierId[]>(WAIT_KEY, []);
  if (!list.includes(id)) writeLocal(WAIT_KEY, [...list, id]);
}
