/**
 * App state kept on the phone (AsyncStorage): watchlist with target prices,
 * settings and onboarding. A tiny external store so every screen stays in sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export interface WatchItem { id: string; target: number | null; addedAt: string; lastPrice: number | null; notifiedAt?: string }
export interface Settings { theme: 'system' | 'light' | 'dark'; haptics: boolean; notifications: boolean; onboarded: boolean; minDropPct: number }
interface State { watch: WatchItem[]; settings: Settings; ready: boolean }

const KEY = 'safqa.app.v1';
const defaults: Settings = { theme: 'system', haptics: true, notifications: true, onboarded: false, minDropPct: 5 };
let state: State = { watch: [], settings: defaults, ready: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const persist = () => void AsyncStorage.setItem(KEY, JSON.stringify({ watch: state.watch, settings: state.settings }));

export async function hydrate() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<State>) : {};
    state = { watch: parsed.watch ?? [], settings: { ...defaults, ...(parsed.settings ?? {}) }, ready: true };
  } catch {
    state = { ...state, ready: true };
  }
  emit();
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  persist();
  emit();
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useApp(): State {
  return useSyncExternalStore(subscribe, () => state);
}
export function useSettings() {
  const s = useApp();
  return { settings: s.settings, ready: s.ready, update: (patch: Partial<Settings>) => set({ settings: { ...state.settings, ...patch } }) };
}
export const WATCH_LIMIT = 30;
export function useWatch() {
  const s = useApp();
  return {
    items: s.watch,
    has: (id: string) => s.watch.some((w) => w.id === id),
    add: (id: string, price: number | null, target: number | null = null): 'added' | 'full' | 'exists' => {
      if (state.watch.some((w) => w.id === id)) return 'exists';
      if (state.watch.length >= WATCH_LIMIT) return 'full';
      set({ watch: [{ id, target, addedAt: new Date().toISOString(), lastPrice: price }, ...state.watch] });
      return 'added';
    },
    remove: (id: string) => {
      const prev = state.watch.find((w) => w.id === id);
      set({ watch: state.watch.filter((w) => w.id !== id) });
      return prev;
    },
    restore: (item: WatchItem) => set({ watch: [item, ...state.watch.filter((w) => w.id !== item.id)] }),
    setTarget: (id: string, target: number | null) => set({ watch: state.watch.map((w) => (w.id === id ? { ...w, target } : w)) }),
  };
}
export function patchWatch(items: WatchItem[]) {
  set({ watch: items });
}
export function getState() {
  return state;
}
