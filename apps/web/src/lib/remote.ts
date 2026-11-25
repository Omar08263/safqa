// Remote config pushed from Safqa Hub (feature flags, curated picks, suspect
// prices) + lightweight client telemetry that powers incident detection and
// automatic flag rollback by the Autopilot «حارس» agent.
import { useEffect, useState } from 'react';
import changelog from '../features/changelog.json';
import { EDGE_URL } from './edge';
import { setRemoteSoundOff } from './sound';

export interface Flag { on: boolean; rollout: number; value: unknown; platforms: string[] }
export interface RemoteConfig { version: number; flags: Record<string, Flag>; curated: { headline: string; ids: string[]; ai?: boolean; day?: string } | null; suspectPrices: string[] }

const KEY = 'safqa.remote.v1';
const SID_KEY = 'safqa.sid.v1';
const EMPTY: RemoteConfig = { version: 0, flags: {}, curated: null, suspectPrices: [] };
let current: RemoteConfig = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? EMPTY; } catch { return EMPTY; } })();
const subs = new Set<(c: RemoteConfig) => void>();

export function sid(): string {
  let s = localStorage.getItem(SID_KEY);
  if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(SID_KEY, s); }
  return s;
}
/** Stable 0–99 bucket per browser for percentage rollouts. */
function bucket(key: string) {
  let h = 2166136261;
  for (const ch of `${sid()}:${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h) % 100;
}
export function flagOn(key: string, fallback = true): boolean {
  const f = current.flags[key];
  if (!f) return fallback;
  if (!f.on || (f.platforms && !f.platforms.includes('web'))) return false;
  return bucket(key) < (f.rollout ?? 100);
}
export const flagValue = <T,>(key: string, fallback: T): T => (current.flags[key]?.value as T) ?? fallback;
export const remoteConfig = () => current;

function apply(c: RemoteConfig) {
  current = c;
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* quota */ }
  setRemoteSoundOff(!flagOn('ui_sounds'));
  document.documentElement.classList.toggle('no-premium-motion', !flagOn('premium_motion'));
  for (const s of subs) s(c);
}

export async function refreshConfig() {
  try {
    const r = await fetch(`${EDGE_URL}/api/v2/config`, { cache: 'no-store' });
    if (r.ok) apply(await r.json());
  } catch { /* offline: keep cached */ }
}

export function useRemoteConfig(): RemoteConfig {
  const [c, setC] = useState(current);
  useEffect(() => { subs.add(setC); return () => { subs.delete(setC); }; }, []);
  return c;
}
export function useFlag(key: string, fallback = true) {
  useRemoteConfig();
  return flagOn(key, fallback);
}

// ---------------- telemetry ----------------
type Ev = { kind: string; flag?: string | null; msg: string };
let queue: Ev[] = [];
let timer = 0;
let activeFlag: string | null = null;
let sent = 0;
/** The feature currently on screen, so errors are attributed to its flag. */
export function setActiveFeature(flag: string | null) { activeFlag = flag; }
export function report(kind: string, msg: string, flag: string | null = activeFlag) {
  if (sent > 40) return; // never flood
  queue.push({ kind, flag, msg: msg.slice(0, 300) });
  sent += 1;
  clearTimeout(timer);
  timer = window.setTimeout(flush, 2500);
}
function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ sid: sid(), platform: 'web', version: changelog.latest, events: queue.splice(0, 10) });
  try {
    if (navigator.sendBeacon?.(`${EDGE_URL}/api/v2/telemetry`, new Blob([body], { type: 'text/plain' }))) return;
  } catch { /* fall through */ }
  void fetch(`${EDGE_URL}/api/v2/telemetry`, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => 0);
}

export function installRemote() {
  void refreshConfig();
  window.setInterval(() => { if (document.visibilityState === 'visible') void refreshConfig(); }, 5 * 60_000);
  window.addEventListener('error', (e) => {
    const m = String(e.message || '');
    if (!m || /ResizeObserver|Script error/.test(m)) return;
    report('error', `${m} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const m = String((e.reason as Error)?.message ?? e.reason ?? '');
    if (!m || /Failed to fetch|NetworkError|AbortError|Load failed/.test(m)) return;
    report('rejection', m);
  });
  window.addEventListener('pagehide', flush);
}
