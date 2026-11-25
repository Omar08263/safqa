// Push the built catalog into D1: merge per-offer price history with what is already there
// (the Worker cron and user submissions also add points), detect real drops, compute heat,
// and write only products that changed. FTS rows are added for new products.
import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { plausibleEgp, rowHeat } from '../../apps/edge/src/catalog/core.ts';
import { d1, sqlStr } from './cf.ts';
import type { StoreSrc } from './stores.ts';

export interface OfferIn { s: string; u: string; p: number; l: number | null; k: 0 | 1; t: string; r?: number | null; src?: string }
export interface BuiltProduct {
  id: string; mkey: string; title: string; titleAr: string | null; brand: string | null; category: string | null; image: string | null; gtin: string | null;
  cond: string; specs: Record<string, unknown>; offers: OfferIn[]; search: string;
}
interface OfferRow extends OfferIn { h: [number, number][] }

const minutes = (iso?: string) => Math.floor((iso ? Date.parse(iso) : Date.now()) / 60000);
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };

export async function pushCatalog(products: BuiltProduct[], stores: StoreSrc[], o: { db: DatabaseSync; log: (...a: unknown[]) => void }) {
  const { db, log } = o;
  db.exec('CREATE TABLE IF NOT EXISTS pushed (id TEXT PRIMARY KEY, hash TEXT NOT NULL)');
  // Existing rows (reads are cheap on the free tier; writes are the scarce resource).
  // biome-ignore lint/suspicious/noExplicitAny: D1 rows.
  const existing = new Map<string, any>();
  let after = 0;
  for (;;) {
    const res = await d1(`SELECT rowid AS rid, id, offers, price, hot, cold, drop_pct, drop_at, first_seen FROM catalog WHERE rowid > ${after} ORDER BY rowid LIMIT 3000`);
    const rows = res[0]?.results ?? [];
    for (const r of rows) existing.set(r.id, r);
    if (rows.length < 3000) break;
    after = rows[rows.length - 1].rid;
  }
  log('D1 has', existing.size, 'catalog rows');
  const getHash = o.db.prepare('SELECT hash FROM pushed WHERE id=?');
  const setHash = o.db.prepare('INSERT OR REPLACE INTO pushed (id, hash) VALUES (?,?)');
  const now = new Date().toISOString();
  const stmts: string[] = []; const after_: [string, string][] = [];
  let inserts = 0, updates = 0, drops = 0, skipped = 0;
  const seen = new Set<string>();
  for (const p of products) {
    if (seen.has(p.id)) continue; seen.add(p.id);
    const ex = existing.get(p.id);
    const prevOffers: OfferRow[] = ex ? JSON.parse(ex.offers || '[]') : [];
    const prevBy = new Map(prevOffers.map((x) => [x.u, x]));
    const merged: OfferRow[] = p.offers.map((x) => {
      const prev = prevBy.get(x.u);
      const h: [number, number][] = prev?.h ? prev.h.filter(([, v]) => plausibleEgp(v, p.category)) : [];
      if (x.k && (!h.length || h[h.length - 1]![1] !== x.p)) h.push([minutes(x.t), x.p]);
      return { ...x, h: h.slice(-240) };
    });
    // Keep offers we did not crawl this time (user submissions, API sources, Worker refreshes).
    for (const prev of prevOffers) if (!merged.some((m) => m.u === prev.u) && prev.src !== 'feed' && prev.src !== 'jsonld') merged.push(prev);
    const live = merged.filter((x) => x.k);
    const pool = live.length ? live : merged;
    const best = pool.reduce((a, b) => (b.p < a.p ? b : a));
    const pts = merged.flatMap((x) => x.h.map(([, v]) => v));
    const low = Math.min(best.p, ...pts);
    const since = minutes() - 30 * 1440;
    const med30 = median(merged.flatMap((x) => x.h.filter(([t]) => t >= since).map(([, v]) => v))) ?? best.p;
    let dropPct = ex?.drop_pct ?? null; let dropAt = ex?.drop_at ?? null;
    if (ex?.price && best.p < ex.price * 0.995 && live.length) {
      dropPct = Math.round(((ex.price - best.p) / ex.price) * 1000) / 10; dropAt = now; drops++;
      stmts.push(`INSERT INTO drops (product_id, store, old, new, pct, at) VALUES (${sqlStr(p.id)},${sqlStr(best.s)},${ex.price},${best.p},${dropPct},${sqlStr(now)})`);
    }
    const claimed = best.l && best.l > best.p ? ((best.l - best.p) / best.l) * 100 : 0;
    const ageH = dropAt ? (Date.now() - Date.parse(dropAt)) / 3600_000 : 999;
    const h = rowHeat({ hot: ex?.hot ?? 0, cold: ex?.cold ?? 0, dropPct: ageH < 24 * 7 ? dropPct : 0, vsMedian: med30 > best.p ? ((med30 - best.p) / med30) * 100 : 0, atLow: pts.length > 1 && best.p <= low, ageHours: Math.min(ageH, 72), claimed, liveStores: live.length, price: best.p });
    const row = {
      id: p.id, mkey: p.mkey, title: p.title, title_ar: p.titleAr, brand: p.brand, category: p.category, image: p.image, gtin: p.gtin, cond: p.cond,
      price: best.p, list_price: best.l, store: best.s, url: best.u, n_offers: merged.length, in_stock: live.length ? 1 : 0, offers: JSON.stringify(merged),
      low, med30, drop_pct: dropPct, drop_at: dropAt, heat: Math.max(0, h), specs: JSON.stringify(p.specs), source: [...new Set(merged.map((x) => x.src ?? ''))].join(','),
    };
    const hash = createHash('sha1').update(JSON.stringify({ ...row, heat: Math.round(row.heat / 5) })).digest('hex');
    if (ex && (getHash.get(p.id) as { hash: string } | undefined)?.hash === hash) { skipped++; continue; }
    const cols = Object.keys(row);
    stmts.push(`INSERT INTO catalog (${cols.join(',')},first_seen,updated_at,checked_at) VALUES (${cols.map((c) => sqlStr((row as Record<string, unknown>)[c])).join(',')},${sqlStr(now)},${sqlStr(now)},${sqlStr(now)})
ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(',')},updated_at=excluded.updated_at,checked_at=excluded.checked_at`);
    if (!ex) { stmts.push(`INSERT INTO catalog_fts (rowid, text) SELECT rowid, ${sqlStr(p.search.slice(0, 600))} FROM catalog WHERE id=${sqlStr(p.id)}`); inserts++; } else updates++;
    after_.push([p.id, hash]);
  }
  log(`writing: ${inserts} new, ${updates} changed, ${skipped} unchanged, ${drops} drops`);
  let buf: string[] = []; let size = 0; let sent = 0; let doneIdx = 0;
  const flush = async () => {
    if (!buf.length) return;
    await d1(buf.join(';\n'));
    sent += buf.length; buf = []; size = 0;
  };
  for (const s of stmts) {
    if (size + s.length > 90_000) { await flush(); }
    buf.push(s); size += s.length;
    if (sent && sent % 2000 < 40) { /* progress */ }
  }
  await flush();
  db.exec('BEGIN'); for (const [id, h] of after_) setHash.run(id, h); db.exec('COMMIT'); doneIdx = after_.length;
  log('D1 statements sent', sent, 'hashes saved', doneIdx);
  // Stores + meta.
  const counts = products.flatMap((p) => p.offers).reduce<Record<string, number>>((a, x) => { a[x.s] = (a[x.s] ?? 0) + 1; return a; }, {});
  const st = stores.map((s) => `INSERT INTO stores (id,name_ar,name_en,domain,kind,products,last_crawl,note) VALUES (${[s.id, s.nameAr, s.nameEn, s.domain, s.kind === 'shopify' ? 'feed' : 'sitemap+jsonld', counts[s.id] ?? 0, now, s.note ?? null].map(sqlStr).join(',')})
ON CONFLICT(id) DO UPDATE SET products=excluded.products,last_crawl=excluded.last_crawl,name_ar=excluded.name_ar,name_en=excluded.name_en,kind=excluded.kind`);
  st.push(`INSERT OR REPLACE INTO settings (key,value) VALUES ('catalog_meta', ${sqlStr(JSON.stringify({ products: products.length, offers: Object.values(counts).reduce((a, b) => a + b, 0), stores: Object.keys(counts).length, at: now }))})`);
  await d1(st.join(';\n'));
  log('stores + meta updated');
}
