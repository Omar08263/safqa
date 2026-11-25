# Safqa backend (Cloudflare edge, free tier)

Everything here runs on Cloudflare's **free plan** — no card on file. The static site on Hugging Face keeps
working on its own (snapshot + in-browser demo API) if the backend is ever down.

| Piece | URL | Code |
|---|---|---|
| API (Worker `safqa-api`) | https://safqa-api.safqaeg.workers.dev | `apps/edge` |
| Admin app (Pages `safqa-admin`, PWA) | https://safqa-admin.pages.dev | `apps/admin` |
| Admin Android app (TWA) | [safqa-admin.apk](https://github.com/Omar08263/safqa/releases/download/admin-v1.0.0/safqa-admin.apk) | `deploy/android/build-admin-twa.mjs` |
| Telegram bot | https://t.me/SafqaDealsBot | `apps/edge/src/telegram.ts` |
| Site (HF static Space) | https://safqaeg.pages.dev (`/pay`, `/live`) | `apps/web` |

## Storage
* **D1** (`safqa`): users, sessions (hashed refresh tokens), watchlist, alerts, synced per-user state (`user_kv`),
  products (indexed from the daily snapshot), community (groups, posts, comments, reviews), chat (rooms, DMs,
  messages with a per-room `seq` for polling), moderation (penalties, appeals), payments, codes + redemptions,
  agent config/logs, AI usage + cache, rate limits, announcements, Telegram links/outbox/price events, admin audit.
  Migrations: `apps/edge/migrations/000{1,2,3}_*.sql`.
* **KV**: the latest snapshot, uploaded media (images ≤ 2 MB after client compression, short videos, PDFs) and
  payment receipts. **R2 is not used** because enabling it asks for a card. Receipts are stored under
  `receipt:<paymentId>` with a **90-day TTL**, are only readable through the admin API, and are never public.

## Auth
* Email + password (PBKDF2-SHA256, 100k iterations, per-user salt) and **Google** (ID token verified against
  Google's JWKS: signature, `aud`, `iss`, `exp`, `email_verified`).
* Access token: HS256 JWT, 1 hour. Refresh token: random, 60 days, stored hashed, **rotated** on each use;
  `logout-all` bumps `token_version`.
* Admin = Google account on the `ADMIN_EMAILS` allowlist (a Worker secret, never in the repo or on the site).
  Server-side jobs use the `x-safqa-ops` header with `PUSH_SECRET` (kept in `/home/box/.safqa/edge.env`, mode 600).
* The admin app signs in through the Space (the only redirect URI Google knows) with `state=admin.<random>`;
  `apps/web/index.html` + `src/lib/admin-bounce.ts` forward that fragment to the admin origin. Adding
  `https://safqa-admin.pages.dev` as an authorized origin/redirect in Google Cloud would allow a direct login.

## Web integration (`apps/web/src/lib/edge.ts`)
The site still boots the in-browser demo API first, then `installEdgeBridge()` wraps `fetch`: `/api/auth/*`,
`/api/watchlist*`, `/api/alerts*`, `/api/chat` and `/api/push/*` go to the Worker **when `/api/health` answers**,
otherwise they stay on the demo. Old browser-only demo accounts are moved to the server the first time they log in
(same email + password, watchlist included). New pages: `#/pay` (plans + InstaPay) and `#/live` (synced chat rooms
and community feed with AI agents, uploads, reactions, rules gate). "تابعنا على تيليجرام" is on `/pay`, `/live`,
`/app` and the footer.

## AI (Workers AI, free allocation ≈ 10k neurons/day)
| Use | Model | Why |
|---|---|---|
| Agents, moderation classifier, ops assistant, Telegram | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Best Egyptian Arabic of the free models tested; follows persona + "no invented prices" |
| Fallback | `@cf/meta/llama-4-scout-17b-16e-instruct` | Good Arabic, faster |
| Receipt reading (vision) | `@cf/meta/llama-4-scout-17b-16e-instruct` | Read synthetic InstaPay receipts exactly (amount, reference, note, recipient, status) with no license prompt |

Guard rails: a daily call budget (`AI_DAILY_CALL_BUDGET=180`, 25 reserved for receipts + ops), a 30-minute
answer cache, per-user rate limits by tier, and an **offline fallback** (the rule-based agent brain from the web)
so nothing breaks when the quota is used up. Every AI message is labelled «🤖 وكيل ذكاء اصطناعي». Agents are
grounded on D1 products (all stores, 30-day median, 90-day low) and never quote a price that is not in the data.

Moderation = the site's heuristic analyzer (Arabic/Franco profanity, scams, contact info, spam) **+** an AI
classifier (applied only at confidence ≥ 0.75, cached 7 days). Penalties follow the escalation table in
`apps/web/src/lib/rules.ts`; every penalty message cites the rule numbers. Appeals are judged by an AI judge with
guard rails (grave violations are never auto-lifted) and can be overridden in the admin app.

## Payments (InstaPay, manual-first)
Tiers: مجاني 0 · فضّي 49 · ذهبي 99 · ماسي 199 EGP / month (`apps/edge/src/tiers.ts`).
1. `POST /api/v2/payments {tier, months, code?}` → amount + reference code `SFQ-XXXXXX` + the owner's official
   InstaPay QR (`/pay/instapay-qr.jpg`), address and link. Buying a lower tier while a higher one is active is refused.
2. The member transfers, writes the reference in the note, uploads the receipt image + transaction reference.
3. The vision model extracts the fields; `verifyReceipt()` scores recipient (.30), amount (.30), reference code
   (.15), date (.10), transaction ref (.10), status (.05), minus contradictions. A duplicate transaction reference
   is rejected (409). A "TEST/SAMPLE" watermark caps confidence at 0.5.
4. Confidence ≥ 0.8 with recipient + amount + status OK → **provisional** activation; otherwise **pending**.
   The owner approves / rejects / revokes / re-verifies in the admin app; revoking restores the best still-valid paid tier.
5. Codes: percent, fixed, free upgrade (N days of a tier), expiry, max uses, per-user uses, allowed tiers.
   «عندك كود؟» on `#/pay`.
Tests: `apps/edge/src/verify.test.ts`, `apps/edge/src/codes.test.ts` (`pnpm vitest run apps/edge`).

## Telegram (@SafqaDealsBot)
Webhook `POST /api/v2/telegram/webhook` (secret header derived from the bot token). Egyptian Arabic, inline menu:
/start (subscribe, or `link_<code>` to link a Safqa account from `#/pay`), /deals, /search, /settings (categories,
drop threshold %, daily digest on/off), /digest, /link, /stop, and free-text questions answered by the AI agent Saqr
with real prices. The snapshot push detects real price drops and queues alerts per user; a 9:30 Cairo digest;
an outbox drained every 10 minutes by the cron (Telegram rate-friendly). Register/refresh the webhook from the
admin app (Settings) or `POST /api/v2/admin/telegram/setup`.

## Cron (`*/10 * * * *`)
Outbox drain · AI appeal judging · hourly cleanup (expired sessions, rate rows, AI cache) and tier expiry ·
daily digest at 09:30 Africa/Cairo.

## Deploy
```bash
cd apps/edge
npx wrangler d1 migrations apply safqa --remote
npx wrangler deploy                      # secrets: JWT_SECRET, PUSH_SECRET, ADMIN_EMAILS, TELEGRAM_BOT_TOKEN
cd ../admin && npm run deploy            # Cloudflare Pages
bash deploy/edge/push-snapshot.sh        # also run by deploy/hf/refresh-live.sh after each refresh
```

## Real vs demo
* **Real:** accounts, sessions, Google sign-in, watchlist/alerts sync, `#/live` chat + community, AI agents,
  moderation + appeals, payments + receipt AI checks + admin review, codes, Telegram bot + alerts + digest, admin app.
* **Still local/demo:** the older `#/community` and `#/chat` pages (in-browser), password-reset email (no free mail
  sender is wired; users are pointed to Google sign-in), web push to closed browsers.

## Limits to know
Workers free: 100k requests/day, 10 ms CPU per request (I/O doesn't count), 50 subrequests per invocation.
D1 free: 5 GB, 5M reads/day. KV free: 100k reads, 1k writes/day (media + receipts count as writes).
Workers AI free: ~10k neurons/day ≈ 180 agent answers/day with the 70B model (cached answers are free).
