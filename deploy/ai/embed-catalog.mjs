// Builds Safqa's offline semantic index: every product title embedded with
// multilingual-e5-small (the same model the browser downloads), L2-normalised
// and quantised to int8. Output (OUT dir, default ~/.safqa/pages-assets/ai):
//   index.json  [{ id, t, p, s, i, k, u }]  compact product cards
//   vecs.bin    Int8Array(n * 384)           one row per product
// Cached per product (title hash) so daily rebuilds only embed new titles.
// Usage: cd deploy/ai && npm i && node embed-catalog.mjs [maxProducts]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

const API = process.env.SAFQA_EDGE || 'https://safqa-api.safqaeg.workers.dev';
const SITE = process.env.SITE_URL || 'https://safqaeg.pages.dev';
const OUT = process.env.OUT || join(homedir(), '.safqa/pages-assets/ai');
const CACHE = join(homedir(), '.safqa/ai-cache.json');
const MAX = Number(process.argv[2] || 20000);
const MODEL = 'Xenova/multilingual-e5-small';
env.cacheDir = join(homedir(), '.safqa/hf-models');
mkdirSync(OUT, { recursive: true });

const items = new Map();
async function j(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
// 1) v5 multi-store catalog (paginated).
for (let page = 0; page < 400 && items.size < MAX; page += 1) {
  const r = await j(`${API}/api/v5/search?limit=100&page=${page}&sort=heat`).catch((e) => { console.log('v5', e.message); return { items: [] }; });
  if (!r.items?.length) break;
  for (const p of r.items) items.set(p.id, { id: p.id, t: p.titleAr || p.titleEn, e: p.titleEn, p: p.lowestPriceEgp, s: p.bestOffer?.store?.nameAr ?? null, i: p.image ?? null, k: p.category?.slug ?? null, u: `/p/${p.id}`, b: p.brand ?? null });
  if (page % 20 === 0) console.log('v5 page', page, items.size);
}
// 2) the curated snapshot (product pages at /product/:id).
try {
  const snap = await j(`${SITE}/demo/snapshot.json`);
  for (const p of snap.all ?? []) items.set(p.id, { id: p.id, t: p.titleAr, e: p.titleEn, p: p.lowestPriceEgp, s: p.bestOffer?.store?.nameAr ?? null, i: null, k: p.category?.slug ?? null, u: `/product/${p.id}`, b: p.brand ?? null });
} catch (e) { console.log('snapshot', e.message); }
const list = [...items.values()].filter((x) => x.t && x.p).slice(0, MAX);
console.log('products', list.length);

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const text = (x) => `passage: ${x.t}${x.e && x.e !== x.t ? ` | ${x.e}` : ''}${x.b ? ` | ${x.b}` : ''}${x.k ? ` | ${x.k}` : ''}`.slice(0, 300);
const key = (x) => createHash('sha1').update(text(x)).digest('base64').slice(0, 16);
const todo = list.filter((x) => !cache[key(x)]);
console.log('to embed', todo.length);
if (todo.length) {
  const embed = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const B = 32;
  for (let n = 0; n < todo.length; n += B) {
    const batch = todo.slice(n, n + B);
    const out = await embed(batch.map(text), { pooling: 'mean', normalize: true });
    const d = out.dims[1];
    for (let r = 0; r < batch.length; r += 1) {
      const row = out.data.slice(r * d, (r + 1) * d);
      cache[key(batch[r])] = Buffer.from(Int8Array.from(row, (v) => Math.max(-127, Math.min(127, Math.round(v * 127)))).buffer).toString('base64');
    }
    if (n % (B * 40) === 0) { console.log('embedded', n + batch.length, '/', todo.length); writeFileSync(CACHE, JSON.stringify(cache)); }
  }
  writeFileSync(CACHE, JSON.stringify(cache));
}
const DIM = 384;
const vecs = new Int8Array(list.length * DIM);
list.forEach((x, r) => { const b = Buffer.from(cache[key(x)], 'base64'); vecs.set(new Int8Array(b.buffer, b.byteOffset, b.length), r * DIM); });
writeFileSync(join(OUT, 'vecs.bin'), Buffer.from(vecs.buffer));
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ model: MODEL, dim: DIM, at: new Date().toISOString(), n: list.length, items: list.map(({ e, b, ...rest }) => rest) }));
console.log('wrote', OUT, list.length, 'products', (vecs.byteLength / 1e6).toFixed(1), 'MB');
