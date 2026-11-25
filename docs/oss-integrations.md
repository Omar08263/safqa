# Safqa v6 — open-source integrations

Every v6 system is registered in **`apps/edge/src/systems/registry.ts`** (`SYSTEMS`), has one
remote-config flag (`sys_*`, default ON until a row exists), and is visible/switchable in
**Safqa Hub → 🧩 الأنظمة** (`GET /api/v6/hub/systems`, `POST /api/v6/hub/systems/:id`).
The master AI (`apps/edge/src/brain`) senses them every tick (`Signals.systems`) and turns
problems into findings (outages, stale twins index, low accessibility score). Guarded flags can
be rolled back by «حارس» like any other feature. Public list: `GET /api/v6/systems`, page `/systems`.

Rules kept: free tiers only, no D1 writes on hot paths (D1 was capped on 2026-11-25), honest
User-Agent, no bypass of any site's bot protection, push only to people who opted in, no fake data.

| # | System (flag) | Open-source basis · license | What we built / added | Where it lives | Status |
|---|---|---|---|---|---|
| 1 | 🔔 جرس الموبايل — phone push (`sys_ntfy`) | [ntfy](https://github.com/binwiederhier/ntfy) · Apache-2.0 / GPL-2.0 (we only call the public ntfy.sh HTTP API) | Private per-user topic = HMAC(JWT_SECRET, user id) — never stored; opt-in is one `user_kv` row (`sys:ntfy`). Smart alerts (instant + digest) and owner escalations (`notifyOwner`) also ring the phone. Test push endpoint. | `apps/edge/src/systems/ntfy.ts`, `catalog/smart.ts`, `autopilot.ts` · web `src/v6/ntfy.tsx` (in /smart → التنبيهات الذكية) · Hub owner bell | Live. Opt-in saving needs D1 writes (works after the 02:00 Cairo reset). |
| 2 | 🧬 توأم المنتج — cross-store twins (`sys_twins`) | Entity-resolution approach of [dedupe](https://github.com/dedupeio/dedupe) (MIT) + [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) (MIT) embeddings already built for offline AI | Our matcher (no copied code): cosine ≥0.90 blocking on the existing int8 index, then hard guards — cross-store only, brand, variant words (Pro/Ti/XT/DDR4…), first model number, model codes (FX607VU≠FX607VJ), capacities (TB→GB, inch, W, mAh…), price ratio 0.55–1.8, stricter similarity for big gaps. 928/16,256 products matched; 256 static shards; top price gaps for the owner. | `deploy/ai/twins.py` (runs in `deploy/pages/deploy.sh`) → `/ai/twins/*.json` · web `src/v6/twins.tsx` on `/p/:id` · Hub top gaps | Live. Rebuilds on every Pages deploy (~1 s). |
| 3 | 🪧 كارت المشاركة + rich results (`sys_seo`) | Idea of [prerender](https://github.com/prerender/prerender) (MIT) + schema.org Product / Open Graph | Pages Function rewrites `<head>` of `/p/:id` with HTMLRewriter (no headless browser): real title + price, product photo for WhatsApp/Facebook/Telegram/X, canonical, `product:price:*`, JSON-LD `Product` + `Offer`/`AggregateOffer`. Reads `/api/v6/card/:id` — edge-cached 30 min, read-only (never triggers a recrawl). | `apps/web/functions/p/[id].ts` · `apps/edge/src/systems/api.ts` | Live. Deploy scripts now run wrangler from `apps/web` so the function ships. |
| 4 | 🟢 نبض صفقة — uptime/status (`sys_uptime`) | [Upptime](https://github.com/upptime/upptime) (MIT) | 6 checks (site, product page + share card, API/D1, catalog, Hub, APK release). Worker cron every 20 min → one KV blob (72 writes/day), 7-day history, incidents. Public `/status`; Hub card; brain finding on outages. The GitHub Actions version (10 min, `status-data` branch) is ready. | `apps/edge/src/systems/uptime.ts`, `/api/v6/status` · `deploy/status/probe.mjs`, `deploy/status/pulse.yml` · web `src/v6/status.tsx` | Live (Worker cron). Actions workflow **staged**: gh token lacks `workflow` scope. |
| 5 | ♿ مفتّش الجودة — quality audit (`sys_quality`) | [Lighthouse](https://github.com/GoogleChrome/lighthouse) (Apache-2.0), accessibility via [axe-core](https://github.com/dequelabs/axe-core) (MPL-2.0) | 5 key pages (home, hot, product, smart, status), mobile; scores + top failing audits → `status-data/quality/latest.json` (+90-day history). Hub shows findings; brain flags accessibility < 85. | `deploy/status/quality.mjs`, `deploy/status/pulse.yml` (daily 03:30 Cairo) | First run done from the box (perf 52 · a11y 99 · best-practices 99 · SEO 95). Daily Actions run staged (same scope issue). |

## Considered, not added (yet)

- **Semantic search / similar products**: already in Safqa (offline-AI e5 index in the browser), so v6 reuses that index for twins instead of duplicating it. A Vectorize version needs a token with Vectorize permission.
- **Privacy-first analytics (Plausible/Umami model)**: Cloudflare Web Analytics is free and cookie-less, but creating the site needs an API token with the RUM write permission (the current token can only list) or a one-time dashboard click. Then it's one `<script>` tag.
- **Analytics Engine price observations**: hooks exist (T-1); the binding needs the one-time free enable in the dashboard.
- **Novu / Knock-style notification workflows**: ntfy + Telegram + in-app cover it on the free stack; email stays off until an opted-in sender exists.
- **GrowthBook-style experiments**: flags already have percentage rollouts; measuring needs event writes, so this waits for the D1 budget redesign (T-1).

## One-time owner steps

1. `gh auth refresh -s workflow` on the box (or add the `workflow` scope to the token), then copy
   `deploy/status/pulse.yml` → `.github/workflows/pulse.yml` and un-ignore it in `.gitignore`.
   That moves uptime to 10-minute Actions probes and turns on the daily Lighthouse run.
2. Optional: enable Cloudflare Web Analytics for `safqaeg.pages.dev` (free) for the analytics system.
