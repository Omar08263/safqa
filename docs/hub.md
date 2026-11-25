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

## Owner toolkit — «أدواتي الذكية» (apps/edge/src/owner-tools.ts)
Only for the owner: the Google allowlist on the web Hub, or a paired device in the Hub app (tab 🧠). Users never see it, and every route goes through `needAdmin`.

| Agent | When it runs | What it does | What it can do alone (Autopilot) |
|---|---|---|---|
| 🧞 أمين (command agent) | on demand, plus every 10 min | Egyptian Arabic → whitelisted actions (flag, banner, code, agent, announce, featured, run). Rules first, Workers AI fallback that must return strict JSON. Shows a preview with before/after; one tap applies and snapshots the state; ↩️ rolls back. Every 10 min it watches applied changes and rolls one back on its own when errors reach ≥10 and >3× the baseline rate +0.2 | auto-rollback |
| 🎯 صيّاد (deal hunter) | hourly | Picks deals and verifies them: fresh <72 h, price ≤ 30-day median ×0.92, real discount 12–85%, flags inflated list prices | features up to 24/day in «صيد اليوم» (site home + app) |
| 🕵️ عين (competitor intel) | 09:00 and 21:00 | Public pages only (Yaoota, Jumia, noon, Amazon.eg, B.TECH, 2B). Respects robots.txt, honest UA `SafqaBot`, diffs against KV, AI summary | read-only |
| 📈 نمو (growth advisor) | 10:00 | Safqa analytics → KPIs + AI ideas (each idea can be sent to the command box) | from rank «مساعد»: up to 3 flag/banner tweaks a day |
| 📣 حملة (campaigns) | 12:00 | Telegram/WhatsApp/social copy + flux-1-schnell image, saved as drafts | site banner (2/day); Telegram channel post only when `campaign_telegram` is on (off by default), once a day |
| 🎙️ مدير (CEO brief) | 08:00 | Daily brief, also covers what the agents did alone; read aloud (speechSynthesis ar-EG on the web, expo-speech in the app) | — |

**Guardrails**
- Global switch: flag `owner_autopilot`. Each agent also has `enabled` + `auto`.
- Autonomy grows with rank (XP from good runs). Daily caps are listed per agent above.
- `owner_autopilot` and `campaign_telegram` can never be changed by an agent.
- Money movement, user bans/deletions and destructive actions are blocked: regex in commands and in `autoAct`. Anything outside an agent's rules escalates as a decision (apply / skip).
- Every proposal, apply, rollback and auto action goes to `ops_log` + `owner_changes` (audit page).
- AI calls count against `AI_DAILY_CALL_BUDGET`, results are cached in KV, and endpoints are rate-limited (campaign 12/day, brief 4/day).

Routes are under `/api/v2/hub/`: `owner`, `owner/autopilot`, `command`, `changes`, `changes/:id/apply|rollback`, `docs?kind=`, `growth`, `deals-hunt`, `deals-hunt/feature`, `campaign`, `brief`.

## Remote config
`GET /api/v2/config` (KV-cached 5 min) → `{ flags: { key: { on, rollout, value, platforms } } }`. The site and app bucket each install by a stable id for percentage rollouts, refresh every 5 minutes and report crashes inside `<Feature flag>` boundaries to `POST /api/v2/telemetry`. The `banner` flag carries `{ ar, level }` for a dismissible strip.

## What's New
`apps/web/src/features/changelog.json` is the single source (served by the API at `/api/v2/changelog`). Site: auto-shows once per release, `/whats-new` replays it. App: same JSON, full-screen stories, auto-shown once, «المزيد ← الجديد في صفقة». Images live in `apps/web/public/whats-new/` (generated artwork, labelled as illustrations).

## Offline AI (site)
* Semantic search + review insights: `Xenova/multilingual-e5-small` (q8, ≈118 MB, cached by the browser after the first opt-in), WebGPU with WASM fallback, in a Web Worker. Catalog vectors are precomputed by `deploy/ai/embed-catalog.mjs` (int8, `ai/index.json` + `ai/vecs.bin`).
* Chat: WebLLM `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (≈400 MB, WebGPU only), opt-in, with RAG over the local index; falls back to the cloud agent.

## Sounds — credits
All UI sounds are **original and synthesised in code** (WebAudio on the site and web Hub; `scripts/make-sfx.mjs` renders the WAVs for the apps). No samples are used. Released under **CC0 1.0** by the Safqa project. Every surface has an on/off toggle (the site also has a volume slider), honours `prefers-reduced-motion`/system reduce-motion for visuals, and the `ui_sounds` flag is a remote kill switch.
