// Remote config from Safqa Hub (GET /api/v2/config): feature flags with rollout, refreshed every 5 minutes.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api';

type Flag = { on: boolean; rollout: number; value?: unknown; platforms?: string[] };
let flags: Record<string, Flag> = {};
let bucket = 0;
export async function initRemote() {
  try {
    let id = await AsyncStorage.getItem('safqa.sid');
    if (!id) { id = Math.random().toString(36).slice(2); await AsyncStorage.setItem('safqa.sid', id); }
    bucket = [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 100, 7);
    const cached = await AsyncStorage.getItem('safqa.config');
    if (cached) flags = JSON.parse(cached).flags ?? {};
  } catch {}
  await refreshRemote();
  setInterval(() => void refreshRemote(), 5 * 60_000);
}
export async function refreshRemote() {
  try {
    const r = await fetch(`${API_URL}/api/v2/config?platform=app`);
    if (!r.ok) return;
    const j = await r.json();
    flags = j.flags ?? {};
    await AsyncStorage.setItem('safqa.config', JSON.stringify(j));
  } catch {}
}
export function flagOn(key: string, fallback = true): boolean {
  const f = flags[key];
  if (!f) return fallback;
  if (f.platforms && !f.platforms.includes('app')) return fallback;
  return Boolean(f.on) && bucket < (f.rollout ?? 100);
}
export const flagValue = <T,>(key: string, fallback: T): T => (flags[key]?.value as T) ?? fallback;
