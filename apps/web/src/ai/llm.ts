// Optional offline LLM (WebLLM + WebGPU): Qwen2.5-0.5B-Instruct q4f16 (~400 MB,
// opt-in, cached by the browser). Used by the assistant and voice shopping
// when the visitor turns it on; otherwise they talk to the cloud agents.
import { useEffect, useState } from 'react';
import { flagOn, report } from '../lib/remote';
import { semanticSearch, brainState } from './brain';

export const LLM_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
type Engine = { chat: { completions: { create: (o: unknown) => Promise<AsyncIterable<{ choices: { delta?: { content?: string } }[] }>> } } };
export type LlmState = { status: 'off' | 'loading' | 'ready' | 'error' | 'unsupported'; progress?: number; text?: string; error?: string };

let engine: Engine | null = null;
let state: LlmState = { status: typeof navigator !== 'undefined' && 'gpu' in navigator ? 'off' : 'unsupported' };
const subs = new Set<(s: LlmState) => void>();
const set = (s: LlmState) => { state = s; for (const f of subs) f(s); };
export const llmState = () => state;
export const hasWebGPU = () => typeof navigator !== 'undefined' && 'gpu' in navigator;

export async function startLlm() {
  if (engine || state.status === 'loading' || !flagOn('webllm')) return;
  if (!hasWebGPU()) { set({ status: 'unsupported' }); return; }
  set({ status: 'loading', progress: 0, text: 'بنجهّز العقل…' });
  try {
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
    engine = (await CreateMLCEngine(LLM_MODEL, { initProgressCallback: (p: { progress: number; text: string }) => set({ status: 'loading', progress: p.progress, text: p.text }) })) as unknown as Engine;
    set({ status: 'ready' });
  } catch (e) {
    set({ status: 'error', error: String((e as Error).message ?? e) });
    report('error', `webllm: ${(e as Error).message}`, 'webllm');
  }
}

const SYS = 'إنت «صفقة»، مساعد تسوّق مصري لطيف وشاطر. رد بالعامية المصرية في 2-4 جمل قصيرة مع إيموجي واحد. استخدم المنتجات اللي في السياق بس، واذكر السعر بالجنيه. لو مفيش حاجة مناسبة قول كده بصراحة.';

/** Streams an answer; grounds it with offline semantic search when the brain is loaded. */
export async function* askOffline(question: string, history: { role: 'user' | 'assistant'; content: string }[] = []) {
  if (!engine) throw new Error('llm not ready');
  let ctx = '';
  if (brainState().status === 'ready') {
    const r = await semanticSearch(question, 6).catch(() => null);
    if (r?.items.length) ctx = r.items.map((p) => `- ${p.t} — ${Math.round(p.p).toLocaleString('en-US')} ج${p.s ? ` (${p.s})` : ''}`).join('\n');
  }
  const stream = await engine.chat.completions.create({
    stream: true, temperature: 0.5, max_tokens: 220,
    messages: [{ role: 'system', content: SYS + (ctx ? `\nالمنتجات المتاحة:\n${ctx}` : '') }, ...history.slice(-4), { role: 'user', content: question }],
  });
  for await (const chunk of stream) {
    const t = chunk.choices[0]?.delta?.content;
    if (t) yield t;
  }
}

export function useLlm(): LlmState {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); return () => { subs.delete(setS); }; }, []);
  return s;
}
