# Competitive research: how deal sites ingest and show products in near real time

_Research for Safqa v5, November 2026. Sources are linked inline. Our hard rules stay the same: free tiers only,
honest `SafqaBot` user agent, robots.txt respected, polite per-host rate limits, no proxy rotation, no captcha
solving, no disguised browsers, demo data always labelled._

## 1. What the others do

### Egypt and the region
| Site | How products get in | What we take from it |
|---|---|---|
| **Yaoota** (Egypt, KSA, UAE) | Its own crawler ("machine") over ~100–120 vetted Egyptian stores out of ~500; prices "updated as soon as the store changes them"; later partnerships paid per click/transaction ([MEO interview](https://meobserver.org/middle-east/interiews/2017/05/07/yaoota-com-answers-all-your-shopping-queries/), [Forbes ME](https://www.forbesmiddleeast.com/leadership/entrepreneurship/egyptian-startup-yaootas-wild-ride-to-deliver-bargains-online)). Claims 2M+ listings. | Store vetting (no "high copy" sellers), store-quality score, buying guides next to prices. |
| **Pricena** (UAE/KSA/Egypt) | Crawls partner stores daily, "no feed required" ([Pricena](https://ae.pricena.com/news-reviews/en/2014/09/everything-need-know-pricena/), [vendors](https://ae.pricena.com/en/vendors)). | Daily full pass is the baseline; anything better is a differentiator. |
| **Buyhatke** (India) | Central crawlers **plus** its browser extension sends price snapshots when users visit supported stores; Amazon cut its affiliate ID for showing price graphs on Amazon ([how they earn](https://buyhatke.com/how-we-earn), [review](https://techsprohub.com/buyhatke-price-tracker/)). | User-side capture is the legitimate way to cover sites that block crawlers; never overlay competing graphs on Amazon pages if we want an Amazon affiliate tag. |
| **Waffarha** (Egypt) | Not a price engine: a vouchers/offers marketplace with merchant-supplied deals. | A coupons hub works best as merchant- or community-supplied, with expiry and "worked for me" votes. |

### Global
| Site | Ingestion | Freshness | Lesson |
|---|---|---|---|
| **camelcamelcamel** | Amazon Product Advertising API; queues per locale split into **tracked** (has a price watch) and **untracked**; new products discovered from user searches and the browser extension ([how price checking works](https://camelcamelcamel.com/blog/how-our-price-checking-system-works/), [SE Daily interview](https://softwareengineeringdaily.com/wp-content/uploads/2019/05/SED837-CamelCamelCamel.pdf)). Batches up to 10–20 items per API call. | Tracked hourly → untracked every few hours/daily. | **Priority recrawl by user interest** and batching. |
| **Keepa** | Same idea, bigger. Tracked products refreshed at least hourly, others several times a day; the API refreshes on demand when data is older than ~1 h ([Keepa API](https://keepa.com/api-docs/product.html)). | ≤1 h for watched. | **Refresh-on-view** with a staleness threshold. |
| **PriceRunner / idealo** | Merchant **feeds** (CSV/XML/JSON) with EAN/GTIN + MPN; idealo fetches feeds about every 30 minutes; offers without an identifier land in an "open catalog" ([PriceRunner feed spec](https://www.pricerunner.com/info/getting-started), [idealo CSV](https://idealo.github.io/csv-importer/en/csv/), [idealo FAQ](https://partner.idealo.com/de/idealo-academy/faqs/faq-angebote)). | 30 min for feed merchants. | **Feeds first**, crawl second; match by GTIN → MPN → title; keep unmatched offers visible as their own products. |
| **Slickdeals / Pepper (hotukdeals, mydealz)** | Community posts + editors + bots (Slickdeals "Scout" scans retailers for drops). **Temperature = hot − cold votes**; thresholds promote to Hot / Super-hot / Frontpage after an editor checks price history ([hotukdeals](https://atolls.com/our-brands/hotukdeals/), [how Slickdeals works](https://slickdeals.net/corp/how-slickdeals-works/)). | Live feed. | **Heat** = votes plus a time decay; bot-found drops plus community votes. |
| **Honey** | Extension: coupon codes tried at checkout, crowd-sourced success rates. | — | Coupon success rate shown honestly ("worked 3 of 5 times"). |

## 2. Tools surveyed (GitHub)
| Need | Options | Decision |
|---|---|---|
| Crawl framework | **Crawlee** (JS/Python: request queue, autoscaled pool, per-domain concurrency, but also fingerprint/stealth features), **Scrapy** (AutoThrottle, `ROBOTSTXT_OBEY`, HTTP cache, item pipelines), Playwright pipelines | A small Node crawler built on the same ideas: a persistent request queue (frontier), per-host token bucket honouring `Crawl-delay`, conditional GET (ETag/Last-Modified), HTTP cache, retries with backoff. **No headless browser or stealth**: every source we use serves JSON feeds or server-rendered JSON-LD, so a browser would only add load and temptation to disguise. |
| Structured data | **extruct** (Python: JSON-LD, microdata, OpenGraph), `metascraper`, schema.org `Product`/`Offer`/`AggregateOffer` | Our own JSON-LD + OpenGraph + microdata-price extractor (`packages/adapters/src/jsonld.ts` extended), mirrored in the Worker for on-demand refresh. |
| Feeds | Shopify storefront `/products.json` (public, paginated, 250/page), WooCommerce Store API `/wp-json/wc/store/products`, Google Merchant/idealo-style CSV, affiliate networks (Admitad/ArabClicks/Impact XML/CSV) | Shopify + WooCommerce Store API adapters, a generic affiliate-feed importer, and the **Amazon PA-API 5** client (dormant until keys exist). |
| Matching / entity resolution | **dedupe** (active learning), **Splink** (Fellegi–Sunter), **recordlinkage**, RapidFuzz token-set ratio | A deterministic cascade suited to electronics: GTIN → brand+MPN → brand+model key (with storage/RAM/colour guards) → token-set similarity within a brand+category block. Cheap enough to run on every ingest. |
| Search | **Meilisearch**, **Typesense** (typo tolerance, Arabic works), Algolia | Both need an always-on server; there is no free host for one that we can rely on. We get the same UX with **D1 FTS5 `trigram`** (substring + typo-ish matching) on Arabic-normalised text, plus a **client-side index** (MiniSearch-style, fuzzy=1, prefix) shipped with the static Space for instant, offline search. |
| Real-time updates | WebSockets, SSE, polling with ETag | **SSE** endpoint on the Worker (`/api/v5/live`) with an ETag'd polling fallback (`/api/v5/drops?since=`). |

## 3. Architecture chosen for v5
```
            box (daily + on demand)                          Cloudflare (free)
 ┌──────────────────────────────────────┐        ┌─────────────────────────────────────────┐
 │ deploy/catalog/crawl.mjs             │ ingest │ Worker safqa-api  /api/v5/*             │
 │  sources: Shopify feeds, sitemaps +  │──────▶│  D1: catalog, offers, price_points,      │
 │  JSON-LD, PA-API (if keys), CSV feeds│ batches│      catalog_fts (trigram), votes,       │
 │  frontier in node:sqlite (lastmod,   │        │      coupons, submissions, drop events   │
 │  etag, next_due, priority)           │        │  Cron */10: priority recrawl of hot +    │
 │  match + normalise + categorise      │        │      watched offers (JSON-LD), drops →   │
 │  (rules → Workers AI for leftovers)  │        │      Telegram/alerts                     │
 └──────────────────────────────────────┘        │  SSE /api/v5/live, polling fallback     │
                                                  │  On-demand: /api/v5/submit (paste a URL) │
 static Space (HF): app shell + catalog-lite      └─────────────────────────────────────────┘
 index for instant/offline search; talks to the Worker for everything live.
```

**Freshness tiers (camelcamelcamel/Keepa model):**
1. **Hot** (watched by someone, voted, viewed in the last day, or dropped recently): rechecked by the Worker cron roughly every 1–3 hours.
2. **Warm** (has history, in stock): every 24 h from the box crawl.
3. **Cold** (out of stock, or unchanged for 30 days): weekly.
4. **Refresh on view**: opening a product whose freshest offer is older than 6 h queues it at top priority.

**Price history** is stored per offer per change (plus one heartbeat point a day), so charts are real and D1 writes
stay well under the free 100k/day.

**Deal heat** = community temperature (hot − cold) + price signal (drop vs 30-day median, all-time low) with a time
decay, like Pepper's temperature but seeded by real price data so the feed is useful with few users.

**Prediction** ("buy now / wait") is a transparent statistical estimate from the product's own history (position in
its 90-day range, trend, recent volatility, typical drop interval). It is labelled as an estimate, never a promise.

**Amazon and Noon**: Amazon via the official **PA-API 5** once an Associates account qualifies (keys in Worker
secrets); Noon via its affiliate programme feed once approved. Until then, a user can paste a link: the Worker reads
the public page if it answers normally and robots allows; if it is blocked we say so honestly and suggest the browser
extension, which reads the product from the page the **user** is already viewing. We never retry with a disguised
client.
