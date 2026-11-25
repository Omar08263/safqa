# D1 write budget: the facts and the design (Nov 25, 2026)

## Verified limits (Cloudflare docs, read Nov 25, 2026)

| Resource (Workers Free) | Limit | Source |
|---|---|---|
| D1 rows written | **100,000/day per account**, all databases together; resets 00:00 UTC (02:00 Cairo) | developers.cloudflare.com/d1/platform/pricing |
| D1 rows read | 5,000,000/day | same |
| D1 databases / size | 10 per account · 500 MB each · 5 GB total | developers.cloudflare.com/d1/platform/limits |
| Index entries | Each index touched by a write is **one more written row** | D1 pricing, definition 6 |
| KV writes | **1,000/day** (reads 100k/day) | developers.cloudflare.com/kv/platform/limits |
| Analytics Engine | 100,000 data points/day written, 10,000 read queries/day, 3-month retention, 250 points per invocation | developers.cloudflare.com/analytics/analytics-engine |
| Exceeding D1 | Every write on the account fails until reset; reads keep working | D1 pricing FAQ |

## What happened on Nov 25 (measured with the GraphQL Analytics API)

The baseline was 6–268 rows/day (Nov 19–24). Nov 25 reached **129,438 rows**:

- ~45,300 came from one rescale `UPDATE catalog SET heat=…` over every row, which rewrote the row plus both heat indexes.
- ~80,000 came from the one-time 16k-product bulk insert: 4 rows per product (row, primary key and 2 heat indexes) plus the full-text search row.

Neither is a steady-state cost.

## Design decisions

| Idea | Verdict |
|---|---|
| Shard across several free D1 databases | **Doesn't help writes**: the 100k/day cap is per account. It would only help storage (500 MB per DB). Not needed yet. |
| Move hot counters to KV | **Worse**: KV free allows only 1,000 writes/day. We moved the other way: cron state went from KV to a D1 `kstate` table (WITHOUT ROWID, no index, 1 row per write), and 5-minute caches (`config:public`, `hub:deploys`, robots) went to the Cache API (free, no write quota). |
| Upsert only on actual change | **Done.** The box push already hash-diffed. Recrawls now write only `checked_at` (1 row, unindexed) when nothing visible changed, instead of the row plus 2 index rows. The hunter doesn't even send pages whose content hash is unchanged (it re-confirms every 72 h). |
| Price history as compact blobs | **Already the case.** Each offer's history is a JSON array inside the product row, appended only on change, so a price change costs 1 row plus indexes, and history adds no extra rows. |
| Write-budget guard + telemetry | **Done.** Every D1 call goes through a metering proxy (`meta.rows_written`), logged per job in `wbudget` (cron/ingest/recrawl/smart/api/hunter). Background jobs stop at **40k/day**, non-essential work (digests, AI headlines) at **70k**, and everything background stops the moment D1 reports the limit. User actions are never blocked by the guard. Shown at `/api/v5/budget`, in `/api/v5/health`, and as a card in the Hub overview. The account-wide truth (including other tools) comes from `node deploy/catalog/cli.ts budget` (Cloudflare GraphQL). Box bulk pushes are refused above 55k account rows/day. |
| Workers Analytics Engine for price time series | **Good as a side channel, not as the source of truth.** It's free with its own 100k/day quota, so every observation (changed or not) and the write telemetry can go there without touching D1. But retention is 3 months, data can be sampled at volume, and reads need the SQL API with an account token, so canonical history stays in D1. Hooks are in the code (`aePoint`); the binding needs a one-time free **Enable** in the dashboard (Workers → Analytics Engine), then uncomment `[[analytics_engine_datasets]]` in `apps/edge/wrangler.toml`. |

## Steady-state estimate (per day)

| Job | Rows |
|---|---|
| Shopify feed poller (≤14 changed products/tick × ~3 rows, 144 ticks) | ≤ 6,000 (typically far less) |
| Adaptive recrawl (6/10 min; unchanged = 1 row) | ~1,500 |
| Cron state + telemetry | ~1,500 |
| safqa-hunter: B.TECH 3,000 pages + other stores 1,600 (new ≈ 6 rows, unchanged ≈ 0–1) | ≤ ~22,000 while backfilling, then a few thousand |
| **Total** | **≤ ~30k on backfill days, ~10k after**, well below 100k |

The B.TECH backfill (61k products) is spread over about 20 days at 3,000 pages/day.
