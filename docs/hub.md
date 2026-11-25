# Safqa Hub, Autopilot and the v5 "future" layer

## Surfaces
| Surface | URL / file | Notes |
|---|---|---|
| Site (PWA) | https://safqaeg.pages.dev | `deploy/pages/deploy.sh` (also copies the offline-AI index from `~/.safqa/pages-assets/ai`) |
| Safqa Hub (web PWA) | https://safqa-admin.pages.dev | `apps/admin/public` — static, no build. `cd apps/admin && npm run deploy` |
| Safqa Hub (Android) | `apps/hub` (Expo) | `deploy/hub/build-apk.sh` → `dist/safqa-hub.apk`; GitHub release `hub-v1.0.0` |
| App (Android) | `apps/mobile` (Expo) | `deploy/mobile/build-apk.sh` |
| API | https://safqa-api.safqaeg.workers.dev | Cloudflare Worker `apps/edge` (D1 + KV + Workers AI, cron every 10 min) |

## Login
* Web Hub: Google only, the owner allow-list (`ADMIN_EMAILS` on the Worker). Same session as the old admin.
* Android Hub: the Google-authed owner taps **📱 ربط تطبيق Hub** on the web Hub → one-time 8-digit code (5 min, hashed in D1, rate-limited 8/10 min per IP) → the app claims it at `POST /api/v2/hub/pair/claim` and keeps the tokens in the Android keystore (SecureStore). Every pairing is written to the audit log. Deep link: `safqahub://pair?code=…`.

## Autopilot (apps/edge/src/autopilot.ts)
Seven agents run on the cron and escalate only real decisions (`escalations`, unique per kind+ref):

| Agent | Job | Acts alone when |
|---|---|---|
| 🛡️ حارس haris | client error telemetry → incident | ≥8 errors from ≥3 users in 15 min on a guarded flag → **auto-rollback** of the flag + owner alert |
| ⚖️ ميزان mizan | community sweep (existing guard rules) | always (reversible) |
| 🔭 كشّاف kashaf | catalog freshness | marks `recrawl_requested`; escalates when the snapshot is stale |
| 📡 رادار radar | price anomalies | flags suspects; escalates big ones |
| 🏦 أمين الخزنة khazna | InstaPay receipts | auto-approves only at rank **expert** with AI confidence ≥ 0.9 (legend ≥ 0.85); otherwise escalates |
| 🎨 منسّق monasseq | curation headline | 1 AI call/day |
| 📜 راوي rawi | daily report 22:00 Cairo | 1 AI call/day (falls back to a template) |

Ranks: 🌱 trainee 0 → 🔧 assistant 50 → ⭐ pro 200 → 💎 expert 600 → 👑 legend 1500 XP. +1 per successful run, +10 when the owner agrees with a suggestion, −5 when the owner overrides it. The owner can pin a rank, grant XP, pause or run any agent from either Hub. The AI budget (180 calls/day, Workers AI free tier) is shared; agents degrade to rules when it runs out.

## Remote config
`GET /api/v2/config` (KV-cached 5 min) → `{ flags: { key: { on, rollout, value, platforms } } }`. The site and app bucket each install by a stable id for percentage rollouts, refresh every 5 minutes and report crashes inside `<Feature flag>` boundaries to `POST /api/v2/telemetry`. The `banner` flag carries `{ ar, level }` for a dismissible strip.

## What's New
`apps/web/src/features/changelog.json` is the single source (served by the API at `/api/v2/changelog`). Site: auto-shows once per release, `/whats-new` replays it. App: same JSON, full-screen stories, auto-shown once, «المزيد ← الجديد في صفقة». Images live in `apps/web/public/whats-new/` (generated artwork, labelled as illustrations).

## Offline AI (site)
* Semantic search + review insights: `Xenova/multilingual-e5-small` (q8, ≈118 MB, cached by the browser after the first opt-in), WebGPU with WASM fallback, in a Web Worker. Catalog vectors are precomputed by `deploy/ai/embed-catalog.mjs` (int8, `ai/index.json` + `ai/vecs.bin`).
* Chat: WebLLM `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (≈400 MB, WebGPU only), opt-in, with RAG over the local index; falls back to the cloud agent.

## Sounds — credits
All UI sounds are **original and synthesised in code** (WebAudio on the site and web Hub; `scripts/make-sfx.mjs` renders the WAVs for the apps). No samples are used. Released under **CC0 1.0** by the Safqa project. Every surface has an on/off toggle (the site also has a volume slider), honours `prefers-reduced-motion`/system reduce-motion for visuals, and the `ui_sounds` flag is a remote kill switch.
