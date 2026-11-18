#!/usr/bin/env node
// Record a read-only snapshot of a running, seeded Safqa API so the web app
// can run as a fully static demo (Hugging Face static Space, GitHub Pages...).
// Usage: SAFQA_API=http://localhost:8787 node deploy/hf/record-snapshot.mjs out.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const base = (process.env.SAFQA_API || 'http://localhost:8787').replace(/\/$/, '');
const out = process.argv[2] || 'apps/web/public/demo/snapshot.json';

async function get(path, init) {
  const res = await fetch(base + path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

const routes = {};
for (const path of ['/api/health', '/api/meta', '/api/deals', '/api/stores', '/api/categories', '/api/adapters', '/api/calendar']) {
  routes[path] = await get(path);
}
// Live price status written by the refresh (deploy/hf/refresh-live.sh). Served
// to the static site as /api/prices/status for the "last price update" badge.
const statusFile = process.env.SAFQA_PRICE_STATUS;
if (statusFile && existsSync(statusFile)) {
  const status = JSON.parse(readFileSync(statusFile, 'utf8'));
  routes['/api/prices/status'] = {
    updatedAt: status.updatedAt,
    timeZone: status.timeZone,
    source: status.source,
    productsWithPrice: status.productsWithPrice,
    offersUpdated: status.offersUpdated,
    offersFailed: status.offersFailed,
    perStore: status.perStore,
    stale: Object.entries(status.offers || {})
      .filter(([, offer]) => !offer.ok && offer.lastOkAt)
      .map(([offerId, offer]) => ({ offerId, lastOkAt: offer.lastOkAt, reason: offer.reason })),
  };
}
const deals = routes['/api/deals'];
const all = await get('/api/products/search?limit=500');
const ids = new Set([...all.items, ...deals.items, ...deals.suspicious].map((p) => p.id));
const products = {};
for (const id of ids) {
  const entry = { detail: await get(`/api/products/${id}`) };
  // 'stack' (coupon/bank stacking) is NOT recorded: its codes are seeded
  // examples (e.g. SAFQA50), not real offers, so the live site must not show them.
  for (const part of ['history', 'debate', 'prediction']) {
    try {
      entry[part] = await get(`/api/products/${id}/${part}`);
    } catch (error) {
      console.warn(String(error));
    }
  }
  products[id] = entry;
}

const login = await get('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'demo@safqa.app', password: 'demo1234' }),
});
const auth = { headers: { authorization: `Bearer ${login.accessToken}` } };
const demo = {
  user: login.user,
  watchlist: (await get('/api/watchlist', auth)).items,
  alerts: (await get('/api/alerts', auth)).items,
  settings: await get('/api/alerts/settings', auth),
};

const prompts = [
  'عايز سماعة كويسة بأقل من 5000 جنيه',
  'ايه أحسن عرض النهارده؟',
  'فين أرخص موبايل؟',
  'هل خصم سوني حقيقي؟',
  'Best laptop deal right now?',
  'Cheapest headphones in stock',
  'Which offers look fake?',
];
const chats = [];
for (const message of prompts) {
  chats.push({
    message,
    response: await get('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    }),
  });
}

// Store-published facts and gallery images (packages/db/src/crawl-media.ts).
const mediaPath = new URL('../live/media.json', import.meta.url);
const media = existsSync(mediaPath) ? JSON.parse(readFileSync(mediaPath, 'utf8')).products ?? {} : {};
const imageOf = (id) => (media[id]?.images?.length ? `/media/${id}/0-t.webp` : null);
for (const [id, entry] of Object.entries(products)) {
  const m = media[id];
  if (m) {
    entry.media = {
      images: m.images.map((img, i) => ({ full: `/media/${id}/${i}.webp`, thumb: `/media/${id}/${i}-t.webp`, store: img.store, src: img.src })),
      description: m.description ?? null,
      specs: m.specs ?? [],
      ratings: m.ratings ?? [],
      crawledAt: m.crawledAt,
    };
  }
  if (entry.detail) entry.detail.image = imageOf(id);
}
const withImage = (list) => list?.map((p) => ({ ...p, image: imageOf(p.id) }));
all.items = withImage(all.items);
deals.items = withImage(deals.items);
deals.suspicious = withImage(deals.suspicious);
for (const key of Object.keys(deals)) if (Array.isArray(deals[key]) && deals[key][0]?.id) deals[key] = withImage(deals[key]);

// Daily FX reference rates (free, keyless: open.er-api.com — "Rates By Exchange Rate API").
// Cached in deploy/live/fx.json so the toolbox works even if the fetch fails.
const fxPath = new URL('../live/fx.json', import.meta.url);
let fx = existsSync(fxPath) ? JSON.parse(readFileSync(fxPath, 'utf8')) : null;
try {
  const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  if (j?.result === 'success' && j.rates?.EGP) {
    fx = { base: 'USD', rates: j.rates, updatedAt: new Date(j.time_last_update_unix * 1000).toISOString(), source: 'https://www.exchangerate-api.com' };
    writeFileSync(fxPath, `${JSON.stringify(fx, null, 1)}\n`);
  }
} catch (e) {
  console.warn('fx fetch failed, using cached rates:', e?.message ?? e);
}

writeFileSync(
  out,
  JSON.stringify({ recordedAt: new Date().toISOString(), all: all.items, routes, products, demo, chats, fx }),
);
console.log(`wrote ${out}: ${ids.size} products, ${chats.length} chats`);
