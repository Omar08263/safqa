// Main-thread client for the offline brain worker + opt-in state.
import { useEffect, useState } from 'react';
import { readLocal, writeLocal } from '../lib/local';
import { flagOn, report } from '../lib/remote';
import { parseIntent } from './intent';

export type BrainState = { status: 'off' | 'loading' | 'ready' | 'error' | 'unsupported'; stage?: string; loaded?: number; total?: number; products?: number; device?: string; error?: string };
export interface Hit { id: string; t: string; p: number; s: string | null; i: string | null; k: string | null; u: string; score: number }

const OPT = 'safqa.ai.optin.v1';
let worker: Worker | null = null;
let state: BrainState = { status: 'off' };
const subs = new Set<(s: BrainState) => void>();
const pending = new Map<number, { ok: (v: any) => void; no: (e: Error) => void }>();
let seq = 0;
const set = (s: BrainState) => { state = s; for (const f of subs) f(s); };

export const brainOptedIn = () => readLocal<boolean>(OPT, false);
export const brainState = () => state;

export function startBrain() {
  if (worker || !flagOn('offline_ai')) return;
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') { set({ status: 'unsupported' }); return; }
  writeLocal(OPT, true);
  set({ status: 'loading', stage: 'model', loaded: 0, total: 0 });
  worker = new Worker(new URL('./brain.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') set({ status: 'loading', stage: m.stage, loaded: m.loaded, total: m.total });
    else if (m.type === 'ready') set({ status: 'ready', products: m.products, device: m.device });
    else if (m.id != null) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.type === 'error') p?.no(new Error(m.message));
      else p?.ok(m);
    } else if (m.type === 'error') { set({ status: 'error', error: m.message }); report('error', `brain: ${m.message}`, 'offline_ai'); }
  };
  worker.onerror = (e) => { set({ status: 'error', error: e.message }); report('error', `brain worker: ${e.message}`, 'offline_ai'); worker = null; };
  worker.postMessage({ type: 'load', base: import.meta.env.BASE_URL });
}
export function forgetBrain() {
  writeLocal(OPT, false);
  worker?.terminate();
  worker = null;
  set({ status: 'off' });
  void caches?.keys().then((ks) => ks.filter((k) => k.includes('transformers')).forEach((k) => void caches.delete(k)));
}

function ask<T>(msg: Record<string, unknown>): Promise<T> {
  if (!worker || state.status !== 'ready') return Promise.reject(new Error('brain not ready'));
  const id = ++seq;
  return new Promise<T>((ok, no) => { pending.set(id, { ok, no }); worker!.postMessage({ ...msg, id }); });
}
/** Hybrid offline search: intent (budget, cheap/premium), Arabic→English expansion, then a lexical re-rank of the semantic top hits. */
export async function semanticSearch(q: string, k = 24, opts: { cat?: string | null; maxPrice?: number | null } = {}) {
  const it = parseIntent(q);
  const r = await ask<{ items: Hit[]; ms: number }>({ type: 'search', q: it.expanded, k: Math.max(k * 2, 40), cat: opts.cat ?? null, maxPrice: opts.maxPrice ?? it.maxPrice });
  const words = it.expanded.toLowerCase().split(/[\s|،,]+/).filter((w) => w.length > 2);
  const items = r.items
    .filter((x) => !it.minPrice || x.p >= it.minPrice)
    .map((x) => {
      const t = x.t.toLowerCase();
      const lex = words.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0) / Math.max(4, words.length);
      return { ...x, score: x.score + lex * 0.12 - (it.cheap ? Math.log10(Math.max(10, x.p)) * 0.025 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return { items, ms: r.ms, intent: it };
}
export const reviewInsight = (texts: string[]) => ask<{ pros: string[]; cons: string[]; score: number; n: number }>({ type: 'reviews', texts });

/** Auto-resumes for people who opted in before (files come from the browser cache). */
export function useBrain(): BrainState {
  const [s, setS] = useState(state);
  useEffect(() => {
    subs.add(setS);
    if (!worker && brainOptedIn()) startBrain();
    return () => { subs.delete(setS); };
  }, []);
  return s;
}
