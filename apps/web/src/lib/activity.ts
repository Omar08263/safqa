import { readLocal, useLocal, writeLocal } from './local';

// Per-browser activity log that powers recently viewed, streaks, XP and badges.
export interface Activity {
  views: { id: string; at: string }[];
  searches: { q: string; at: string }[];
  visitDays: string[];
  compares: number;
  shares: number;
  toolsUsed: string[];
  chats: number;
}

const KEY = 'safqa.activity.v1';
const empty: Activity = { views: [], searches: [], visitDays: [], compares: 0, shares: 0, toolsUsed: [], chats: 0 };

export function useActivity() {
  return useLocal<Activity>(KEY, empty);
}

function mutate(fn: (a: Activity) => Activity) {
  writeLocal(KEY, fn({ ...empty, ...readLocal(KEY, empty) }));
}

export const track = {
  view(id: string) {
    mutate((a) => ({ ...a, views: [{ id, at: new Date().toISOString() }, ...a.views.filter((v) => v.id !== id)].slice(0, 30) }));
  },
  search(q: string) {
    const clean = q.trim();
    if (!clean) return;
    mutate((a) => ({ ...a, searches: [{ q: clean, at: new Date().toISOString() }, ...a.searches.filter((s) => s.q !== clean)].slice(0, 15) }));
  },
  visit() {
    const day = new Date().toISOString().slice(0, 10);
    mutate((a) => (a.visitDays.includes(day) ? a : { ...a, visitDays: [...a.visitDays, day].slice(-120) }));
  },
  compare() {
    mutate((a) => ({ ...a, compares: a.compares + 1 }));
  },
  share() {
    mutate((a) => ({ ...a, shares: a.shares + 1 }));
  },
  tool(name: string) {
    mutate((a) => (a.toolsUsed.includes(name) ? a : { ...a, toolsUsed: [...a.toolsUsed, name] }));
  },
  chat() {
    mutate((a) => ({ ...a, chats: a.chats + 1 }));
  },
  clearSearches() {
    mutate((a) => ({ ...a, searches: [] }));
  },
  clearViews() {
    mutate((a) => ({ ...a, views: [] }));
  },
};

/** Consecutive-day streak ending today (or yesterday). */
export function streak(days: string[]): number {
  const set = new Set(days);
  let count = 0;
  const cursor = new Date();
  if (!set.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (set.has(cursor.toISOString().slice(0, 10))) {
    count += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

// Savings tracker + budget + collections live here too so the dashboard can read them.
export interface Purchase {
  id: string;
  title: string;
  paidEgp: number;
  referenceEgp: number;
  at: string;
  productId?: string;
}
export interface Collection {
  id: string;
  name: string;
  emoji: string;
  ids: string[];
  createdAt: string;
}
export interface Budget {
  monthlyEgp: number;
  goalEgp: number;
  planned: { id: string; title: string; priceEgp: number; productId?: string; bought?: boolean }[];
}
export const keys = {
  purchases: 'safqa.purchases.v1',
  collections: 'safqa.collections.v1',
  budget: 'safqa.budget.v1',
  compare: 'safqa.compare.v1',
  savedSearches: 'safqa.savedSearches.v1',
  profile: 'safqa.profile.v1',
  referral: 'safqa.referral.v1',
} as const;
export const defaultBudget: Budget = { monthlyEgp: 20000, goalEgp: 5000, planned: [] };

export function xpOf(a: Activity, purchases: Purchase[], collections: Collection[]): number {
  return (
    a.views.length * 5 +
    a.searches.length * 3 +
    a.visitDays.length * 10 +
    a.compares * 15 +
    a.shares * 20 +
    a.toolsUsed.length * 10 +
    a.chats * 5 +
    purchases.length * 25 +
    collections.length * 15
  );
}
export function levelOf(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 40)) + 1;
  const floor = (level - 1) ** 2 * 40;
  const next = level ** 2 * 40;
  return { level, progress: (xp - floor) / (next - floor), next };
}
