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
const all = await get('/api/products/search?limit=48');
const ids = new Set([...all.items, ...deals.items, ...deals.suspicious].map((p) => p.id));
const products = {};
for (const id of ids) {
  const entry = { detail: await get(`/api/products/${id}`) };
  for (const part of ['history', 'debate', 'prediction', 'stack']) {
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

writeFileSync(
  out,
  JSON.stringify({ recordedAt: new Date().toISOString(), all: all.items, routes, products, demo, chats }),
);
console.log(`wrote ${out}: ${ids.size} products, ${chats.length} chats`);
