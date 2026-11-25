/// <reference lib="webworker" />
// Safqa offline brain (Web Worker): multilingual-e5-small (int8 ONNX, ~118 MB,
// cached by the browser after the first opt-in download) + the int8 catalog
// index. Semantic search = int8 dot products over every product; review
// insight = zero-shot sentiment against anchor phrases + centroid extraction.
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/multilingual-e5-small';
env.allowLocalModels = false;
let embedder: FeatureExtractionPipeline | null = null;
let items: { id: string; t: string; p: number; s: string | null; i: string | null; k: string | null; u: string }[] = [];
let vecs: Int8Array | null = null;
let dim = 384;
let anchors: { pos: Float32Array; neg: Float32Array } | null = null;

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

async function embed(texts: string[]): Promise<Float32Array[]> {
  const out = await embedder!(texts, { pooling: 'mean', normalize: true });
  const d = out.dims[1] as number;
  const data = out.data as Float32Array;
  return texts.map((_, r) => data.slice(r * d, (r + 1) * d));
}
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i]! * b[i]!; return s; };

async function load(base: string) {
  const files: Record<string, { loaded: number; total: number }> = {};
  const device = (self.navigator as unknown as { gpu?: unknown }).gpu ? 'webgpu' : 'wasm';
  // biome-ignore lint/suspicious/noExplicitAny: transformers.js overloads are too deep for tsc
  const make = (dev: 'webgpu' | 'wasm') => (pipeline as any)('feature-extraction', MODEL, {
    dtype: 'q8', device: dev,
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file) {
        files[p.file] = { loaded: p.loaded ?? 0, total: p.total ?? 0 };
        const tot = Object.values(files).reduce((a, f) => a + f.total, 0);
        const got = Object.values(files).reduce((a, f) => a + f.loaded, 0);
        post({ type: 'progress', stage: 'model', loaded: got, total: tot });
      }
    },
  }) as Promise<FeatureExtractionPipeline>;
  try { embedder = await make(device); } catch { embedder = await make('wasm'); }
  post({ type: 'progress', stage: 'index', loaded: 0, total: 1 });
  const [idx, bin] = await Promise.all([fetch(`${base}ai/index.json`).then((r) => r.json()), fetch(`${base}ai/vecs.bin`).then((r) => r.arrayBuffer())]);
  items = idx.items; dim = idx.dim; vecs = new Int8Array(bin);
  const [pos, neg] = await embed([
    'query: منتج ممتاز وجودته عالية وأنا مبسوط جدا بيه، يستاهل كل جنيه',
    'query: منتج وحش وسيء، باظ بسرعة ومش راضي عنه خالص، فلوس ضايعة',
  ]);
  anchors = { pos: pos!, neg: neg! };
  post({ type: 'ready', products: items.length, device });
}

function search(q: Float32Array, k: number, cat?: string | null, maxPrice?: number | null) {
  const v = vecs!;
  const qi = Int8Array.from(q, (x) => Math.round(x * 127));
  const top: { s: number; r: number }[] = [];
  let min = -Infinity;
  for (let r = 0; r < items.length; r += 1) {
    const it = items[r]!;
    if (cat && it.k !== cat) continue;
    if (maxPrice && it.p > maxPrice) continue;
    let s = 0;
    const o = r * dim;
    for (let i = 0; i < dim; i += 1) s += qi[i]! * v[o + i]!;
    if (top.length < k) { top.push({ s, r }); if (top.length === k) { top.sort((a, b) => b.s - a.s); min = top[k - 1]!.s; } }
    else if (s > min) { top[k - 1] = { s, r }; top.sort((a, b) => b.s - a.s); min = top[k - 1]!.s; }
  }
  top.sort((a, b) => b.s - a.s);
  return top.map((x) => ({ ...items[x.r]!, score: x.s / (127 * 127) }));
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { id: number; type: string; [k: string]: unknown };
  try {
    if (m.type === 'load') { await load(String(m.base)); return; }
    if (!embedder || !vecs) throw new Error('not loaded');
    if (m.type === 'search') {
      const t0 = performance.now();
      const [q] = await embed([`query: ${String(m.q).slice(0, 200)}`]);
      post({ id: m.id, type: 'result', items: search(q!, Number(m.k ?? 24), (m.cat as string) ?? null, (m.maxPrice as number) ?? null), ms: Math.round(performance.now() - t0) });
    } else if (m.type === 'reviews') {
      const texts = (m.texts as string[]).slice(0, 60);
      const sentences = texts.flatMap((t) => t.split(/[.!؟?\n،]+/).map((s) => s.trim()).filter((s) => s.length > 8)).slice(0, 120);
      if (!sentences.length) { post({ id: m.id, type: 'result', pros: [], cons: [], score: 0, n: 0 }); return; }
      const vs = await embed(sentences.map((s) => `query: ${s}`));
      const scored = sentences.map((s, i) => ({ s, v: vs[i]!, pol: dot(vs[i]!, anchors!.pos) - dot(vs[i]!, anchors!.neg) }));
      const centroid = new Float32Array(vs[0]!.length);
      for (const x of vs) for (let i = 0; i < x.length; i += 1) centroid[i]! += x[i]! / vs.length;
      const central = (arr: typeof scored) => arr.map((x) => ({ ...x, c: dot(x.v, centroid) })).sort((a, b) => b.c - a.c);
      const pros = central(scored.filter((x) => x.pol > 0.015)).slice(0, 3).map((x) => x.s);
      const cons = central(scored.filter((x) => x.pol < -0.015)).slice(0, 3).map((x) => x.s);
      const score = scored.reduce((a, x) => a + Math.tanh(x.pol * 25), 0) / scored.length;
      post({ id: m.id, type: 'result', pros, cons, score, n: sentences.length });
    } else if (m.type === 'embed') {
      post({ id: m.id, type: 'result', vectors: await embed((m.texts as string[]).map((t) => `query: ${t}`)) });
    }
  } catch (err) {
    post({ id: m.id, type: 'error', message: String((err as Error).message ?? err) });
  }
};
