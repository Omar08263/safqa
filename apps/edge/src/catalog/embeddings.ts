// Embeddings sink (RESEARCH-AI-MODELS §6): the hunter runner computes int8 vectors + matches
// offline and posts them here in small batches; the Worker only stores/serves them.
// Additive only: new routes, new tables (migrations/0011_embeddings.sql). Auth is the existing
// hunter mechanism (Bearer HUNTER_TOKEN, constant-time) — no new auth system.
//
// Registration (needs Omar's go-ahead under the "additive only" rule, since it touches index.ts):
//   import { registerEmbeddings } from './catalog/embeddings';
//   registerEmbeddings(on);
// Until then this file is inert and nothing existing changes.

import * as Budget from '../infra/budget';
import type { Env } from '../util';
import { b64, fail, nowIso, str, timingSafeEqual } from '../util';
import type { On } from './api';

const MAX_EMBEDDINGS = 50; // free plan: ≤50 D1 queries per invocation; one batch() call covers all rows
const MAX_MATCHES = 200;
const MAX_DIMS = 4096;

function authed(env: Env, req: Request) {
  const h = req.headers.get('authorization') ?? '';
  const want = `Bearer ${env.HUNTER_TOKEN ?? ''}`;
  const n = Math.max(want.length, h.length, 64);
  const ok = timingSafeEqual(h.padEnd(n, '\0'), want.padEnd(n, '\0')) && h.length === want.length;
  if (!env.HUNTER_TOKEN || !ok) fail(401, 'unauthorized', 'hunter token required');
}

function decodeVec(v: unknown): Uint8Array | null {
  if (typeof v !== 'string' || !v) return null;
  try {
    const bin = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function registerEmbeddings(on: On) {
  /** Receive embedding vectors + pairwise matches computed by the hunter runner. */
  on('POST', '/api/v5/hunter/embeddings', async (c) => {
    authed(c.env, c.req);
    Budget.setJob('embeddings');
    if (Budget.exhausted()) return { ok: false, budget: true, exhausted: true, embeddings: 0, matches: 0 };
    const b = (await c.req.json().catch(() => ({}))) as {
      embeddings?: Record<string, unknown>[];
      matches?: Record<string, unknown>[];
    };
    const stmts: D1PreparedStatement[] = [];
    let nEmb = 0;
    let nMatch = 0;
    let rejected = 0;
    const at = nowIso();

    for (const e of (b.embeddings ?? []).slice(0, MAX_EMBEDDINGS)) {
      const productId = str(e.product_id, 80);
      const model = str(e.model, 80);
      const dims = Number(e.dims);
      const vec = decodeVec(e.vec_b64 ?? e.vec);
      if (!productId || !model || !Number.isInteger(dims) || dims <= 0 || dims > MAX_DIMS || !vec || vec.byteLength !== dims) {
        rejected++;
        continue;
      }
      const scale = Number(e.scale);
      stmts.push(
        c.env.DB.prepare(
          'INSERT INTO product_embeddings_v1 (product_id, model, dims, vec, scale, text_hash, updated_at) VALUES (?,?,?,?,?,?,?) ' +
            'ON CONFLICT(product_id, model) DO UPDATE SET dims=excluded.dims, vec=excluded.vec, scale=excluded.scale, text_hash=excluded.text_hash, updated_at=excluded.updated_at',
        ).bind(productId, model, dims, vec, Number.isFinite(scale) ? scale : null, str(e.text_hash, 80) || null, at),
      );
      nEmb++;
    }

    for (const m of (b.matches ?? []).slice(0, MAX_MATCHES)) {
      let aId = str(m.a_id, 80);
      let bId = str(m.b_id, 80);
      const score = Number(m.score);
      const method = str(m.method, 40);
      if (!aId || !bId || aId === bId || !Number.isFinite(score) || score < -1 || score > 1 || !method) {
        rejected++;
        continue;
      }
      if (bId < aId) [aId, bId] = [bId, aId]; // canonical order: one row per unordered pair
      stmts.push(
        c.env.DB.prepare(
          'INSERT INTO product_matches_v1 (a_id, b_id, score, method, created_at) VALUES (?,?,?,?,?) ' +
            'ON CONFLICT(a_id, b_id) DO UPDATE SET score=excluded.score, method=excluded.method, created_at=excluded.created_at',
        ).bind(aId, bId, score, method, at),
      );
      nMatch++;
    }

    if (stmts.length) await c.env.DB.batch(stmts);
    return { ok: true, embeddings: nEmb, matches: nMatch, rejected, used: await Budget.usedToday(c.env), bgCap: Budget.BG_CAP };
  });

  /** Read stored vectors (optionally for one product / one model). Hunter-authenticated. */
  on('GET', '/api/v5/hunter/embeddings', async (c) => {
    authed(c.env, c.req);
    const productId = str(c.url.searchParams.get('product_id'), 80);
    const model = str(c.url.searchParams.get('model'), 80);
    const limit = Math.min(200, Number(c.url.searchParams.get('limit') ?? 50) || 50);
    const where: string[] = [];
    const binds: string[] = [];
    if (productId) { where.push('product_id=?'); binds.push(productId); }
    if (model) { where.push('model=?'); binds.push(model); }
    const sql = `SELECT product_id, model, dims, vec, scale, text_hash, updated_at FROM product_embeddings_v1${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT ?`;
    const rows = (await c.env.DB.prepare(sql).bind(...binds, limit).all<{
      product_id: string; model: string; dims: number; vec: ArrayBuffer; scale: number | null; text_hash: string | null; updated_at: string;
    }>()).results;
    return {
      items: rows.map((r) => ({
        product_id: r.product_id, model: r.model, dims: r.dims,
        vec_b64: b64(new Uint8Array(r.vec)), scale: r.scale, text_hash: r.text_hash, updated_at: r.updated_at,
      })),
    };
  });

  /** Read stored matches (optionally for one product, above a score floor). Hunter-authenticated. */
  on('GET', '/api/v5/hunter/matches', async (c) => {
    authed(c.env, c.req);
    const productId = str(c.url.searchParams.get('product_id'), 80);
    const minScore = Number(c.url.searchParams.get('min_score') ?? 0) || 0;
    const limit = Math.min(500, Number(c.url.searchParams.get('limit') ?? 100) || 100);
    const rows = productId
      ? (await c.env.DB.prepare(
          'SELECT a_id, b_id, score, method, created_at FROM product_matches_v1 WHERE (a_id=? OR b_id=?) AND score>=? ORDER BY score DESC LIMIT ?',
        ).bind(productId, productId, minScore, limit).all<{ a_id: string; b_id: string; score: number; method: string; created_at: string }>()).results
      : (await c.env.DB.prepare(
          'SELECT a_id, b_id, score, method, created_at FROM product_matches_v1 WHERE score>=? ORDER BY score DESC LIMIT ?',
        ).bind(minScore, limit).all<{ a_id: string; b_id: string; score: number; method: string; created_at: string }>()).results;
    return { items: rows };
  });
}
