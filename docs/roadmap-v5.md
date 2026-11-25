# Safqa v5 roadmap: from curated deals to Egypt's price index

Status legend: ✅ shipped in v5.0 · 🔜 next · 🧭 later. Everything stays on free tiers and respects every store's
robots.txt and bot protection (no disguised crawlers, proxies or captcha solving).

## What v5.0 shipped
| # | Feature | Where |
|---|---|---|
| 1 | ✅ 16k+ product catalog from 9 Egyptian stores (Shopify feeds + sitemap/JSON-LD) | `deploy/catalog`, D1 `catalog` |
| 2 | ✅ Cross-store matching (GTIN → brand+MPN → brand+model+storage/RAM+condition) | `apps/edge/src/catalog/core.ts` |
| 3 | ✅ Instant, typo-tolerant Arabic/English search (trigram FTS + synonyms ايفون→iphone, fuzzy fallback, facets) | `/api/v5/search`, `/api/v5/suggest` |
| 4 | ✅ 🔥 Hot deals with community hot/cold votes and Pepper-style heat (36 h half-life) | `/#/hot`, app Hot tab |
| 5 | ✅ Real price history per offer, stored in D1, charted (step chart + lowest line) | product pages |
| 6 | ✅ Buy / wait / fair forecast from real history, labelled as an estimate | product pages |
| 7 | ✅ Live price-drop feed (SSE on web, polling in the app) + home ticker | `/#/drops`, `/api/v5/live` |
| 8 | ✅ Priority recrawl of hot and watched products every 10 min, refresh-on-view after 6 h | Worker cron |
| 9 | ✅ Drop alerts to watchers (in-app + Telegram) | `saveOffers` → `alerts`, `price_events` |
| 10 | ✅ Coupons hub: community codes with worked/failed votes, plus stores' own sales (no fake codes) | `/#/coupons` |
| 11 | ✅ Paste-a-link to track any product (robots-checked, honest "blocked" messages) | `/#/add`, app |
| 12 | ✅ Browser extension v5: cross-store prices on the page you view, opt-in "share this price" | `apps/extension` |
| 13 | ✅ Personalised "Picked for you" feed from on-device interests | home |
| 14 | ✅ Compare up to 4 products incl. v5 catalog items | `/#/compare` |
| 15 | ✅ Category browser with live counts, 15 AI-assisted categories (Workers AI for leftovers) | home, `/#/hot` |
| 16 | ✅ Price-sources transparency page (store, method, last crawl, counts) | `/#/sources` |
| 17 | ✅ Native app 5.0.0: Hot tab, server search, live product screen, drops, paste-link, votes | `apps/mobile` |
| 18 | ✅ Micro-interactions: flame flicker by heat level, spinning border on hot cards, stagger-in, vote confetti + haptics, live dot, low-price pulse (reduced-motion respected) | `styles.css`, RN `Animated` |
| 19 | ✅ Amazon Creators API + noon affiliate-feed integration points (dormant until keys) | `docs/catalog.md` |

### Shipped in the v5 live-prices and smart-tools pass (Nov 25, 2026)

20. **Always-on ingestion agents**: a second Worker cron (`5-55/10`) polls the official Shopify storefront feeds (newest first) for new arrivals, plus a rotating deep sweep for price updates. Robots are checked; a store is paused 6 h on 403/429.
21. **Adaptive priority recrawl scheduler**: watched products are rechecked every 60 min, very hot every 90 min, hot every 3 h and the rest every 6 h. Products that dropped recently or move a lot are rechecked sooner, most overdue first.
22. **Self-healing extractor**: when JSON-LD and OG tags have no price, it tries a stored per-host selector, then Workers AI (≤60 calls/day). It saves a selector that worked so the next fetch is cheap.
23. **Source health and freshness dashboard**: `/api/v5/health`, the `/sources` page and `node deploy/catalog/cli.ts status`.
24. **Catalog CLI with a store-adapter generator**: `cli.ts probe <url>` checks robots.txt, Shopify `/products.json`, WooCommerce Store API, sitemaps and JSON-LD, then prints a `StoreSrc` snippet. It stops when the site refuses our honest bot.
25. **Live price UI**: SSE with a polling fallback; the ticker flashes and plays a soft sound (respects the sound toggle) when new drops arrive. The product price flips when it changes (refetched every 60 s). Reduced-motion users get no animation.
26. **Smart opt-in notifications**: a per-user interest model (watchlist, views, searches, categories and brands), deal ranking, quiet hours (Cairo time), instant or daily digest, daily cap, dedupe and AI headlines. Delivery is in-app plus Telegram. Email is not offered on the free stack, and the UI says so.
27. **Auto price tracking for everything you view**: stored on the device and synced when signed in. Home shows "Dropped since you viewed it".
28. **Deal DNA**: a 0–100 score with a grade, split into explained factors: own price history, gap to the next store, claimed discount, votes, freshness and stock.
29. **Fake-discount radar**: flags a "was" price above anything we actually recorded, or a price raised in the days before a "sale".
30. **Price-war detector**: ≥2 stores and ≥3 drops in 14 days.
31. **Cross-store basket optimizer**: an exact search over store splits (≤10 stores), including an estimated delivery fee per store, compared with buying everything from one store.
32. **Egyptian sale-season calendar and advice**: White Friday, year-end, Ramadan, Eid, back-to-school and others, shown on product pages and at `/smart?tab=seasons`. Islamic-calendar dates are approximate.

## Black's ideas (original, beyond what deal sites do)

| Idea | Status |
|---|---|
| Fake-discount radar | **Shipped**. It gets sharper as history builds; on Nov 25 it found 0 flags because most products have only one price point. |
| Deal DNA score | **Shipped** |
| Price-war detector | **Shipped**. It needs a few days of history before wars show up. |
| Cross-store basket optimizer | **Shipped**. Delivery fees are a user-set estimate. |
| Egyptian seasonality forecaster | **Partly done**: calendar and advice shipped. Per-category "expected % off next season" needs a full season of recorded history. |
| Savings wallet / ledger | Next. `/savings` exists; logging the real "paid vs. next-best price" at click-out is planned. |
| Group-buy alerts | Next. A per-product counter of people waiting for a target price; alert everyone at once and show the count to stores. |
| Auto coupon tester | **Not built, on purpose**. It needs checkout automation on third-party stores; we only collect coupons with community worked/failed votes. |

## Still to do (tooling)

- **Embedding matching**: Workers AI `bge-m3` embeddings in Vectorize as a fourth matching step after GTIN, MPN and model tokens, with a human-review queue for low-confidence pairs. Both are free.
- **Crawlee + Playwright** for JS-only stores, run politely: one browser, honest UA, robots, ≥2.5 s delay, no stealth plugins.
- **Instant search**: D1 FTS5 virtual table (free, already on the platform), then Meilisearch on a free host if latency needs it.
- **WooCommerce adapter** in `crawl.ts`: the CLI already detects WooCommerce stores.
- ~~B.TECH~~: solved by safqa-hunter's streaming sitemap reader (60,861 products, ~20-day budgeted backfill).
- **El Araby**: refuses SafqaBot (404 on product pages); ask them for a feed or permission.
- **Telegram deal channels**: public previews (t.me/s/…) could supply leads for Amazon.eg/noon deals, labelled "reported by channel" and verified via pasted link or the extension. Not built: third-party claims and channel terms need care.

## Phase 1 · weeks 1-4: coverage and freshness
- 🔜 Nightly box cron for the crawler (one store family per night to stay under D1's 100k writes/day).
- 🔜 Complete B.TECH (≈60k URLs) and Raya (≈22k) with polite incremental passes; add WooCommerce Store API adapter
  for WooCommerce-based Egyptian shops; generic affiliate CSV importer (noon, Jumia KOL, ArabClicks).
- 🔜 Ask El Araby for permission / a feed (they currently refuse our bot).
- 🔜 Static `catalog-lite.json` (top 3k by heat) for offline instant search on the web and app.
- 🔜 Native push (FCM) for watcher drops instead of polling.

## Phase 2 · months 2-3: smarter matching and community
- 🧭 Embedding-based matching (Workers AI `bge-m3`, Vectorize free tier) to merge same products with different titles;
  human review queue in the admin app.
- 🧭 Deal posting by users (Slickdeals/Pepper flow) with moderation by the existing autopilot agents; reputation/XP.
- 🧭 Price-drop predictions per category season (Ramadan, White Friday, back-to-school) using accumulated history.
- 🧭 "Price index" pages: median price trend per category, shareable monthly report.

## Phase 3 · months 4-6: scale and partners
- 🧭 Official partner feeds (store-submitted, Google Merchant format) with a self-serve store portal.
- 🧭 Amazon Creators API live once Associates qualifies; noon affiliate links with disclosure.
- 🧭 Move hot search to Typesense/Meilisearch Cloud free tier if D1 FTS latency grows; keep D1 as source of truth.
- 🧭 Arabic voice search in the app, barcode scan → GTIN match.
- 🧭 iOS build once an Apple developer account exists (paid: needs the owner's decision).

## Guardrails (unchanged)
Free tiers only · no payment data · no secrets in git · demo content always labelled · robots.txt and rate limits
respected · stores that block us are left alone or approached for a feed.
