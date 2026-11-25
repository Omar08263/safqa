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
