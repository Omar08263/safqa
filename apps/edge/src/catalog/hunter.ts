// safqa-hunter sink: the open-source crawler (github.com/Omar08263/safqa-hunter, a Crawlee fork) runs on
// GitHub Actions and posts what stores publish (schema.org JSON-LD / official feeds) here in small batches.
// The Worker owns matching, history and the write budget, so the crawler never holds a Cloudflare credential:
// only a random HUNTER_TOKEN shared secret.
import * as Budget from '../infra/budget';
import { sget, sput } from '../infra/state';
import type { Env } from '../util';
import { fail, nowIso, parseJ, str } from '../util';
import { canonicalUrl, plausibleEgp, type Extracted } from './core';
import { storeFromHost, upsertOffer, type On } from './api';
import { aiExtract } from './ingest';

const MAX_BATCH = 6; // free plan: ≤50 D1 queries per invocation; an upsert costs ~2-6
const ROWS_PER_ITEM = 6; // worst case: new product = row + pk + 2 heat indexes + FTS (+ drop/event)

function authed(env: Env, req: Request) {
  const h = req.headers.get('authorization') ?? '';
  if (!env.HUNTER_TOKEN || h !== `Bearer ${env.HUNTER_TOKEN}`) fail(401, 'unauthorized', 'hunter token required');
}

export function registerHunter(on: On) {
  on('GET', '/api/v5/budget', async (c) => Budget.report(c.env));

  /** Budget-aware ingest of up to 6 items the store itself published. */
  on('POST', '/api/v5/hunter/batch', async (c) => {
    authed(c.env, c.req);
    Budget.setJob('hunter');
    const b = (await c.req.json().catch(() => ({}))) as { store?: string; items?: Record<string, unknown>[] };
    const items = (b.items ?? []).slice(0, MAX_BATCH);
    const used = await Budget.usedToday(c.env);
    const room = Math.floor((Budget.BG_CAP - used) / ROWS_PER_ITEM);
    if (room <= 0 || Budget.exhausted()) return { ok: false, budget: true, used, bgCap: Budget.BG_CAP, accepted: 0, results: [] };
    const results: { url: string; status: string; id?: string }[] = [];
    const paused = parseJ<Record<string, number>>(await sget(c.env, 'src:paused'), {}); // paused by العقل الرئيسي (bad extractor)
    if (b.store && (paused[b.store] ?? 0) > Date.now()) return { ok: false, paused: true, until: new Date(paused[b.store]!).toISOString(), accepted: 0, results };
    for (const it of items.slice(0, room)) {
      const url = canonicalUrl(str(it.url, 600));
      let host = ''; try { host = new URL(url).hostname; } catch { results.push({ url, status: 'bad_url' }); continue; }
      const store = storeFromHost(host);
      if (!store || (b.store && store !== b.store)) { results.push({ url, status: 'unknown_store' }); continue; }
      const price = Number(it.price);
      const ex: Extracted = {
        title: str(it.title, 200), brand: str(it.brand, 60) || null, price: Number.isFinite(price) ? price : null,
        listPrice: Number(it.listPrice) > price ? Number(it.listPrice) : null, currency: str(it.currency, 8) || 'EGP',
        image: str(it.image, 600) || null, inStock: it.inStock !== false, gtin: str(it.gtin, 20) || null, mpn: str(it.mpn, 40) || null,
        crumbs: Array.isArray(it.crumbs) ? (it.crumbs as unknown[]).map((x) => str(x, 60)).slice(0, 6) : [], source: 'jsonld',
      } as Extracted;
      if (!ex.title || !ex.price || !/EGP|LE|جنيه/i.test(ex.currency ?? '') || !plausibleEgp(ex.price)) { results.push({ url, status: 'rejected' }); continue; }
      const saved = await upsertOffer(c.env, ex, url, store, 'hunter');
      results.push({ url, status: saved.created ? 'created' : 'merged', id: saved.id });
    }
    return { ok: true, accepted: results.length, skippedForBudget: Math.max(0, items.length - room), used: await Budget.usedToday(c.env), bgCap: Budget.BG_CAP, results };
  });

  /** Priority plan for a store: product URLs we already track, most valuable / stalest first (watched > hot > stale). */
  on('GET', '/api/v5/hunter/plan', async (c) => {
    authed(c.env, c.req);
    const store = str(c.url.searchParams.get('store'), 40);
    const limit = Math.min(500, Number(c.url.searchParams.get('limit') ?? 200) || 200);
    const rows = (await c.env.DB.prepare(`SELECT c.url, c.heat, c.checked_at, (SELECT COUNT(*) FROM watchlist w WHERE w.product_id=c.id) AS watchers
      FROM catalog c WHERE c.store=? ORDER BY watchers DESC, c.heat DESC, c.checked_at ASC LIMIT ?`).bind(store, limit).all<{ url: string; heat: number; checked_at: string; watchers: number }>()).results;
    return { store, budget: await Budget.report(c.env), urls: rows };
  });

  /** AI self-healing: given a page's price-like text candidates, return the selector/price (Workers AI, daily-capped). */
  on('POST', '/api/v5/hunter/heal', async (c) => {
    authed(c.env, c.req);
    const b = (await c.req.json().catch(() => ({}))) as { host?: string; title?: string; candidates?: { cls: string; text: string }[] };
    const host = str(b.host, 120);
    const got = await aiExtract(c.env, host, str(b.title, 200), (b.candidates ?? []).slice(0, 30).map((x) => ({ cls: str(x.cls, 120), text: str(x.text, 120) })));
    return { host, result: got, selector: await sget(c.env, `heal:${host}`) };
  });

  /** Run report from the crawler (shown in /api/v5/health and the Hub). */
  on('POST', '/api/v5/hunter/report', async (c) => {
    authed(c.env, c.req);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const runs = parseJ<unknown[]>(await sget(c.env, 'hunter:runs'), []);
    const run = { at: nowIso(), ...Object.fromEntries(Object.entries(b).slice(0, 30).map(([k, v]) => [k.slice(0, 40), typeof v === 'object' ? JSON.stringify(v).slice(0, 2000) : v])) };
    await sput(c.env, 'hunter:runs', JSON.stringify([run, ...runs].slice(0, 50)));
    return { ok: true };
  });
}
