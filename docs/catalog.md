# Safqa v5 catalog: sources, pipeline and keys

Safqa v5 grew from about 230 hand-curated products to **16,000+ real products** from Egyptian stores. Every price
comes from a public, sanctioned source. We never disguise the crawler, rotate proxies or solve captchas.

## Sources (Nov 2026)

| Store | Method | Notes |
|---|---|---|
| Kimo Store, Compumarts, Tradeline | Shopify storefront feed `/products.json` (public, 250/page) | Full catalogue each run (≈17k items). Prices from the feed, images from Shopify CDN (`?width=` thumbnails). |
| 2B, Raya Shop, Sigma, El Badr, B.TECH, Jumia (electronics only) | `sitemap.xml` + schema.org JSON-LD / OpenGraph on product pages | robots.txt parsed (incl. `Crawl-delay`), ≥2.5 s between requests per host, a budget per run, incremental refresh (new pages first, then stale >3 days or `lastmod` moved). |
| El Araby | **disabled** | Answers HTTP 404 to every request from our honestly-identified bot. We do not evade it. |
| Amazon.eg | Amazon **Creators API** (official) | Dormant until keys exist (see below). Pasted Amazon links get an honest "needs the official API" message. |
| noon | noon affiliate feed (`NOON_FEED_URL`) | Dormant until the affiliate programme approves us. noon blocks bots and we never disguise the crawler. |
| Users | Paste-a-link (`/#/add`) and the browser extension | Worker reads the public page only if robots allows; extension sends the product the **user** is viewing, only when they press the button. Labelled "user-reported". |

Crawler identity: `SafqaBot/5.0 (+https://safqaeg.pages.dev/about; price comparison; contact via site)`.
On 403/429/503, a captcha/bot-check page, or 20 consecutive errors, the store run stops.

## Pipeline

```
box (cron-able)                         Cloudflare (free tier)
deploy/catalog/crawl.ts                 Worker safqa-api
  ├ Shopify feeds / sitemaps+JSON-LD      ├ /api/v5/search  (FTS5 trigram, strict → fuzzy, facets)
  ├ node:sqlite state (pages, ai_cat)     ├ /api/v5/deals · feed · product · compare · drops · live (SSE)
  ├ build(): match → group → categorise   ├ votes · coupons · submit · observe
  │   GTIN → brand+MPN → brand+model+     ├ cron */10: priority recrawl of hot + watched (≤4/run),
  │   storage/RAM+condition                │   refresh-on-view after 6 h, drop → alerts + Telegram
  ├ Workers AI (llama-3.1-8b) for the     └ D1: catalog (+offers JSON with per-offer price history),
  │   few titles rules can't categorise        catalog_fts, votes, coupons, drops, stores
  └ push.ts → D1 REST (≤90 KB batches, hash-skip unchanged rows)
```

Run it:

```bash
set -a; . /home/box/.cloudflare_env; set +a; unset CF_EMAIL CF_PASSWORD
node deploy/catalog/crawl.ts                    # all enabled stores, default budgets, then build + push
node deploy/catalog/crawl.ts --stores btech     # one store
node deploy/catalog/crawl.ts --no-crawl --dry   # rebuild from saved pages, print stats, no push
```

Free-tier budget: D1 allows 100k written rows/day. A first push costs ≈2 rows per new product; later pushes only
write changed rows (hash-skip), so a daily refresh of 16k products costs a few thousand rows.

## Getting the Amazon and noon keys (all free)

**Amazon Creators API** (replaces PA-API 5)
1. Join Amazon Associates for amazon.eg (or the EU/UK programme that covers EG) and get a partner tag.
2. After qualifying sales, open *Tools → Creators API* in Associates Central and create credentials
   (client id + client secret, credential version 3.x).
3. Store them as Worker secrets (never in git):
   ```bash
   cd apps/edge
   npx wrangler secret put AMAZON_CREATORS_CLIENT_ID
   npx wrangler secret put AMAZON_CREATORS_CLIENT_SECRET
   npx wrangler secret put AMAZON_PARTNER_TAG
   ```
   The Worker then answers `/api/v5/amazon/search` and pasted amazon.eg links through `creatorsapi.amazon/catalog/v1`
   (OAuth token from `api.amazon.co.uk/auth/o2/token`, `x-marketplace: www.amazon.eg`).

**noon affiliate feed**
1. Apply to noon's affiliate programme (directly or through an Arab affiliate network such as ArabClicks/Admitad).
2. Once approved, copy the product-feed URL (CSV/XML) they give you.
3. `npx wrangler secret put NOON_FEED_URL`, and set it for the box importer too (env `NOON_FEED_URL`).

## Honest limits
- Multi-store matching only merges when brand + model + storage/RAM (or GTIN) agree, so some same products stay
  separate (≈270 cross-store groups today). Better matching needs GTINs, which most Egyptian stores don't publish.
- Sitemap stores refresh a few hundred pages per run; full coverage of B.TECH (≈60k URLs) and Raya (≈22k) takes
  many polite runs.
- Price history starts on the first crawl (Nov 2026); charts fill in over time. Nothing is backfilled or invented.
