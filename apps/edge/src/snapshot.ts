// Latest price snapshot (the same JSON the static site ships), kept in KV and
// indexed into D1 for agent retrieval. The daily refresh pushes it here.
import type { Env } from './util';
import { nowIso } from './util';

// biome-ignore lint/suspicious/noExplicitAny: snapshot mirrors API schemas.
export type Snap = { recordedAt: string; all: any[]; routes: Record<string, any>; products: Record<string, any>; demo?: any; chats?: any[]; fx?: any };
let mem: { snap: Snap; at: number } | null = null;

export async function loadSnapshot(env: Env): Promise<Snap | null> {
  if (mem && Date.now() - mem.at < 5 * 60_000) return mem.snap;
  const snap = await env.KV.get<Snap>('snapshot:latest', 'json');
  if (snap) mem = { snap, at: Date.now() };
  return snap;
}

export interface Drop { id: string; title: string; category: string | null; old: number; price: number; pct: number; store: string | null }
export async function storeSnapshot(env: Env, snap: Snap): Promise<{ products: number; drops: Drop[] }> {
  if (!snap?.all?.length || !snap.products) throw new Error('invalid snapshot');
  const before = new Map((await env.DB.prepare('SELECT id, price FROM products').all<{ id: string; price: number | null }>()).results.map((r) => [r.id, r.price]));
  const drops: Drop[] = [];
  for (const p of snap.all) {
    const old = before.get(p.id);
    const now = p.lowestPriceEgp ?? p.bestOffer?.priceEgp;
    if (old && now && now < old) drops.push({ id: p.id, title: p.titleAr, category: p.category?.slug ?? null, old, price: now, pct: ((old - now) / old) * 100, store: p.bestOffer?.store?.nameAr ?? null });
  }
  await env.KV.put('snapshot:latest', JSON.stringify(snap));
  mem = { snap, at: Date.now() };
  const stmts = [env.DB.prepare('DELETE FROM products')];
  for (const p of snap.all) {
    const o = p.bestOffer ?? {};
    const d = snap.products[p.id]?.detail;
    const offers = ((d?.offers ?? []) as any[]).filter((x) => x.priceEgp).sort((a, b) => a.priceEgp - b.priceEgp).slice(0, 5).map((x) => ({ store: x.store?.nameAr ?? x.store?.nameEn, price: Math.round(x.priceEgp), inStock: x.inStock, condition: x.condition, fake: x.fakeDiscount || undefined }));
    const cheapest = ((d?.offers ?? []) as any[]).filter((x) => x.priceEgp && x.inStock !== false && x.condition === 'new').sort((a, b) => a.priceEgp - b.priceEgp)[0];
    const search = `${p.titleAr} ${p.titleEn} ${p.brand ?? ''} ${p.model ?? ''} ${p.category?.nameAr ?? ''} ${p.category?.nameEn ?? ''} ${p.category?.slug ?? ''}`
      .toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    stmts.push(
      env.DB.prepare('INSERT INTO products (id,title_ar,title_en,brand,category,price,store,deal_score,discount,url,search,updated_at,offers,median30,min90) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(p.id, p.titleAr, p.titleEn, p.brand ?? null, p.category?.slug ?? null, p.lowestPriceEgp ?? o.priceEgp ?? null, cheapest?.store?.nameAr ?? o.store?.nameAr ?? null, o.dealScore ?? 0, o.discountPct ?? null, cheapest?.url ?? o.url ?? null, search, snap.recordedAt ?? nowIso(), JSON.stringify(offers), d?.median30 ?? null, d?.min90 ?? null),
    );
  }
  await env.DB.batch(stmts);
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('snapshot_meta',?)").bind(JSON.stringify({ recordedAt: snap.recordedAt, products: snap.all.length, pushedAt: nowIso() })).run();
  return { products: snap.all.length, drops };
}

/** Same search semantics as the static demo API. */
export function searchSnapshot(snap: Snap, params: URLSearchParams) {
  const needle = params.get('q')?.trim().toLowerCase();
  const category = params.get('category');
  const items = [];
  for (const base of snap.all) {
    if (category && base.category?.slug !== category) continue;
    if (needle && !`${base.titleAr} ${base.titleEn} ${base.brand ?? ''} ${base.model ?? ''}`.toLowerCase().includes(needle)) continue;
    items.push(base);
  }
  items.sort((a, b) => (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0));
  return { items: items.slice(0, Number(params.get('limit') ?? 60)) };
}
