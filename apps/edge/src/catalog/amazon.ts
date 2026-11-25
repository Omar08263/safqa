// Amazon Creators API (replaced PA-API 5 in 2026): OAuth2 client credentials + catalog/v1.
// Dormant until the three secrets exist: AMAZON_CREATORS_CLIENT_ID, AMAZON_CREATORS_CLIENT_SECRET,
// AMAZON_PARTNER_TAG (Associates tag for amazon.eg). Egypt uses the EU token endpoint (credential v3.2).
// Docs: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl
import type { Env } from '../util';
import type { Extracted } from './core';

const TOKEN_URL = 'https://api.amazon.co.uk/auth/o2/token';
const API = 'https://creatorsapi.amazon/catalog/v1';
const MARKET = 'www.amazon.eg';
const RESOURCES = ['images.primary.large', 'itemInfo.title', 'itemInfo.byLineInfo', 'itemInfo.externalIds', 'itemInfo.classifications', 'offersV2.listings.price', 'offersV2.listings.availability'];

export const configured = (env: Env) => Boolean(env.AMAZON_CREATORS_CLIENT_ID && env.AMAZON_CREATORS_CLIENT_SECRET && env.AMAZON_PARTNER_TAG);
let tok: { v: string; exp: number } | null = null;
async function token(env: Env): Promise<string> {
  if (tok && tok.exp > Date.now() + 60_000) return tok.v;
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.AMAZON_CREATORS_CLIENT_ID, client_secret: env.AMAZON_CREATORS_CLIENT_SECRET, scope: 'creatorsapi::default' }) });
  if (!r.ok) throw new Error(`amazon token ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  tok = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tok.v;
}
async function call(env: Env, op: 'getItems' | 'searchItems', body: Record<string, unknown>) {
  const r = await fetch(`${API}/${op}`, { method: 'POST', headers: { authorization: `Bearer ${await token(env)}`, 'content-type': 'application/json', 'x-marketplace': MARKET }, body: JSON.stringify({ ...body, marketplace: MARKET, partnerTag: env.AMAZON_PARTNER_TAG, resources: RESOURCES }) });
  if (!r.ok) throw new Error(`amazon ${op} ${r.status}`);
  return r.json() as Promise<Record<string, any>>;
}
// biome-ignore lint/suspicious/noExplicitAny: API JSON.
function toExtracted(it: any): Extracted & { url: string } {
  const listing = it.offersV2?.listings?.[0];
  const price = listing?.price?.money?.amount ?? listing?.price?.amount ?? null;
  return {
    url: it.detailPageURL, title: it.itemInfo?.title?.displayValue ?? '', brand: it.itemInfo?.byLineInfo?.brand?.displayValue ?? null,
    gtin: it.itemInfo?.externalIds?.eans?.displayValues?.[0] ?? null, image: it.images?.primary?.large?.url ?? null, price: price ? Number(price) : null,
    currency: listing?.price?.money?.currency ?? 'EGP', inStock: listing ? !/out/i.test(String(listing.availability?.type ?? '')) : null, crumbs: [it.itemInfo?.classifications?.productGroup?.displayValue].filter(Boolean), source: 'api',
  };
}
export async function getItem(env: Env, asin: string): Promise<Extracted | null> {
  const j = await call(env, 'getItems', { itemIds: [asin], itemIdType: 'ASIN' });
  const it = j.itemsResult?.items?.[0];
  return it ? toExtracted(it) : null;
}
export async function search(env: Env, keywords: string) {
  const j = await call(env, 'searchItems', { keywords, itemCount: 10 });
  return (j.searchResult?.items ?? []).map(toExtracted);
}
