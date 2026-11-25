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

## Freshness, measured honestly (Nov 25, 2026)

| Source | How | Realistic freshness |
|---|---|---|
| Kimo, Compumarts, Tradeline (Shopify) | Official `/products.json` feed: the Worker cron polls one store every 10 min for new arrivals and sweeps a deeper page in rotation | New arrivals appear in **~30 min**; the full price sweep takes **~12 h** |
| Watched / hot products (any store) | Adaptive recrawl of the product page (JSON-LD → healed selector → Workers AI) | Watched **~1 h**, very hot **~90 min**, hot **~3 h**, the rest **~6 h**; a product page also refreshes on view when its price is older than 6 h |
| 2B, Raya, Sigma, El Badr, Jumia (sitemaps) | Box crawler `deploy/catalog/crawl.ts`, a few hundred pages per run, ≥2.5 s apart | Whenever a crawl runs (manual or scheduled on the box), so **hours to days** |
| B.TECH | safqa-hunter streams its 45 MB sitemap (60,861 product URLs) and reads schema.org JSON-LD; 3,000 pages/day | **Backfill ~20 days**, then daily |
| El Araby | Sitemap (6,369 products) returns 200, but every product page returns `404 Not Found` to SafqaBot. A Magento GraphQL endpoint answers, but using it to get around their UA block would be evasion. | **Disabled.** Path: ask El Araby for a feed or permission. |
| Amazon.eg | Associates tag on outbound links (active when `AMAZON_PARTNER_TAG` is set). The Creators API needs final Associates acceptance **plus 10 qualified sales in the trailing 30 days**. Pasted links and the extension work today. Keepa has no amazon.eg. | **On demand** until API eligibility |
| noon | The noon affiliate program (affiliates.noon.com) gives links/coupons, not a feed, and its terms list UAE & KSA as territory. Partner APIs cover sellers' own catalogue only. Pasted links and the extension. | **On demand**. noon blocks bots and we never disguise the crawler. |

Budget: D1 free tier is 100k writes/day. Ingestion is capped at about 14 writes per tick, and each cron invocation stays within about 50 queries.

## Ingestion engine: safqa-hunter

[github.com/Omar08263/safqa-hunter](https://github.com/Omar08263/safqa-hunter) is a fork of Crawlee (Apache-2.0) with Safqa plugins in `safqa/`:
- an honest-UA fetch (Crawlee's fingerprinting HTTP client is not used)
- robots via `RobotsTxtFile`
- streaming sitemaps, plus Shopify and WooCommerce feeds
- a JSON-LD/OpenGraph extractor with AI self-healing
- Safqa matching and the priority scheduler
- a budget-aware sink that posts 6-item batches to `/api/v5/hunter/batch`

It runs daily at 02:40 Cairo on GitHub Actions. The workflows are staged in `safqa/ci/workflows`; enabling them needs `gh auth refresh -s workflow` once. Until then it runs from the box. See `SAFQA.md` in that repo. `deploy/catalog/crawl.ts` stays as the box fallback.

## Getting the keys (all free)

- **Amazon.eg**:
  1. Join Associates at https://affiliate-program.amazon.eg/ (you need a public site; use safqaeg.pages.dev).
  2. Set the tag with `wrangler secret put AMAZON_PARTNER_TAG`; outbound Amazon links are then tagged.
  3. After 10 qualified sales in 30 days: Associates Central → Tools → Creators API → create credentials.
  4. `wrangler secret put AMAZON_CREATORS_CLIENT_ID` / `AMAZON_CREATORS_CLIENT_SECRET`.
- **noon**: join at https://affiliates.noon.com (links/coupons). If noon ever provides an Egypt product feed, set `NOON_FEED_URL`.

## CLI

```bash
node deploy/catalog/cli.ts budget                 # real account-wide D1 usage (Cloudflare GraphQL) + Worker-metered jobs
node deploy/catalog/cli.ts status                 # live per-store freshness + ingest log
node deploy/catalog/cli.ts probe https://store.eg # adapter generator: robots, Shopify/Woo feeds, sitemap, JSON-LD -> StoreSrc snippet
node deploy/catalog/cli.ts crawl --stores 2b,raya # polite sitemap crawl + push (needs the CF env)
```

## Honest limits
- Multi-store matching only merges when brand + model + storage/RAM (or GTIN) agree, so some same products stay
  separate (≈270 cross-store groups today). Better matching needs GTINs, which most Egyptian stores don't publish.
- Sitemap stores refresh a few hundred pages per run; full coverage of B.TECH (≈60k URLs) and Raya (≈22k) takes
  many polite runs.
- Price history starts on the first crawl (Nov 2026); charts fill in over time. Nothing is backfilled or invented.
