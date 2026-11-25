# Safqa security

Multi-layer defenses for the site (`safqaeg.pages.dev`), the Android app, the API Worker
(`safqa-api.safqaeg.workers.dev`) and Safqa Hub (`safqa-admin.pages.dev`). Everything runs on
free tiers. Nothing here touches other websites' bot protection: the crawler stays honest
(SafqaBot UA, robots.txt). These defenses protect **our** surfaces.

| Layer | What | Where | Status |
|---|---|---|---|
| Browser | Strict CSP (inline scripts by SHA-256 hash only, no `unsafe-inline` scripts, no `eval`), HSTS, `frame-ancestors 'none'`/`X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy, COOP | `apps/web/public/_headers` + `apps/web/csp.ts` (hashes computed at build), `apps/admin/public/_headers` | live |
| Edge front door | IP auto-ban list, per-IP flood limit (IPv6 bucketed per /64), Origin allowlist for every write (CSRF), 13 MB body cap, per-client write limit | `apps/edge/src/security/guard.ts` | live |
| Strict limiter | Exact counters in a Durable Object (memory only, no storage writes) for sign-in, refresh, pairing, 2FA codes and request nonces | `security/limiter-do.ts`, `security/ratelimit.ts` | live |
| Auth | 15-minute access tokens (`typ: access`), HS256 only (no `alg:none` / confusion), refresh tokens rotated on every use with **reuse detection** (token families), password lockout (8 wrong / 15 min per email), refresh JWTs and admin passes rejected as access tokens | `apps/edge/src/auth.ts`, `util.ts` | live (families after migration 0009) |
| Owner | Hub = admin email allowlist + Google sign-in only + **optional TOTP 2FA** (RFC 6238) with lockout (5/min strict, 8 wrong/30 min → 30-min lock) and one-time codes | `security/owner2fa.ts`, Hub → 🛡️ الأمان | live, off until the owner enables it |
| Encryption at rest | AES-256-GCM (WebCrypto) with versioned keyring, purpose-bound AAD: payment receipts (KV), AI receipt extraction (D1), 2FA secrets (KV) | `security/crypto.ts` | live for new data |
| App ↔ API | HMAC-SHA256 request signatures (method, path, timestamp, nonce, body hash), 60 s window, replay protection (strict nonce counter) | `apps/mobile/src/lib/sign.ts`, `security/signing.ts` | server live in `monitor` mode; app ships in the next APK |
| Android | HTTPS only (`usesCleartextTraffic=false` in release), tokens in Android keystore (SecureStore) | `apps/mobile/plugins/with-no-cleartext.js` | next APK |
| Intrusion detection | Failed logins, lockouts, rate-limit hits, bad/replayed signatures, refresh-token reuse, admin probing, 2FA failures, forged Telegram webhooks, CSP reports → aggregated per (kind, IP), flushed ≤ once/min as one row each; owner Telegram alerts; auto-ban on severe patterns | `security/audit.ts`, Hub → 🛡️ الأمان | live (durable log after migration 0009) |
| Supply chain | `pnpm audit` clean (sharp ≥ 0.35.5 override); gitleaks scan of full history: no real secrets (69 hits, all false positives: product slugs, storage keys, a test fixture) | root `package.json` | done |

## Honest limits

- **App signing is not authentication.** The key ships in the APK; someone who unpacks it can sign.
  It stops casual scripting, request tampering and replays. Authorization is always server-side
  (JWT, tiers, owner allowlist, limits).
- **Per-IP limits are weak against rotating egress** (VPNs such as WARP hand out a new IPv6 per
  request, across /64s). The real backstops are per-account lockout, per-user write limits and the
  strict nonce/2FA counters. Zone-level WAF/Bot Fight Mode would help but needs a custom domain (below).
- **The Workers Rate Limiting binding was measured never returning `success:false`** on this account
  (also reported in cloudflare/workers-sdk#16097). It stays configured (it costs nothing and will start
  enforcing when Cloudflare fixes it), but the strict paths go through the Durable Object.
- **D1 read-only days** (free 100k writes/day): password lockout and the durable event log pause
  (fail-open), sign-in keeps working through the stateless refresh fallback. Edge limits, Telegram
  alerts, bans (KV) and 2FA (KV) keep working.
- **Emails and Telegram chat ids are not encrypted yet** — they are lookup keys (sign-in, webhook,
  alerts). Phase 2 below adds blind indexes first.
- Certificate pinning is **not** used: Cloudflare rotates edge certificates and a pinned app would
  break for every user on rotation. TLS + HSTS + no cleartext is the safe choice.
- Style attributes still need `style-src 'unsafe-inline'` (React/Hub inline styles). Scripts are strict.

## Secrets (Worker)

Set with `wrangler secret put` (never committed). The owner copy lives in `~/.safqa/security.env` (mode 600).

| Secret | Format | Use |
|---|---|---|
| `FIELD_KEYS` | `k2:<b64url 32 B>,k1:<b64url 32 B>` | first key encrypts, all decrypt |
| `SIGNING_KEYS` | `current,previous` | app request signatures |
| `OWNER_TG_CHAT` (optional) | chat id(s) | extra destination for security alerts |
| `TRAP_SECRET` (Worker **and** Pages project `safqaeg`) | random 32 B | site honeypot Functions → `POST /api/v2/sec/beacon` |

Vars: `SIGNING_MODE` = `off` | `monitor` (default) | `enforce`.
APK build: `EXPO_PUBLIC_SAFQA_SIGNING_KEY` = the first `SIGNING_KEYS` entry
(`set -a; . ~/.safqa/security.env; set +a` before `expo prebuild`/Gradle).

### Key rotation

- **Field keys:** generate a new 32-byte key, set `FIELD_KEYS=k2:NEW,k1:OLD`, deploy. New writes use
  `k2`; old values still decrypt. Receipts expire after 90 days on their own; when nothing reports kid `k1`
  any more (`sealedKid()`), drop `k1`. Never drop a key while data sealed with it exists.
- **Signing keys:** set `SIGNING_KEYS=NEW,OLD`, ship an APK with `NEW`, and when old app versions are gone
  remove `OLD`. Switch `SIGNING_MODE=enforce` only when most active installs sign.
- **JWT_SECRET:** rotating it signs everyone out (by design). For one account use “sign out everywhere”
  (bumps `token_version`).

## Migration 0009 (run after the D1 write quota resets, 00:00 UTC = 02:00 Cairo)

```
cd apps/edge && npx wrangler d1 migrations apply safqa --remote
```

Adds `sessions.family`, `sessions.rotated_at` (reuse detection) and `sec_events` (durable intrusion log).
About 5 writes. Code runs before and after it: before, refresh rotates by delete (old behavior) and
events stay in memory/Telegram.

## Manual steps (dashboard)

`*.workers.dev` and `*.pages.dev` are Cloudflare-owned zones, so zone features (WAF managed rules,
Bot Fight Mode, rate-limiting rules, Security Level) **cannot** be enabled for them. When a custom
domain is added (see `docs/custom-domain.md`):

1. dash.cloudflare.com → the domain → **Security → Bots** → turn on **Bot Fight Mode** (free).
2. **Security → WAF → Managed rules** → enable the **Cloudflare Free Managed Ruleset**.
3. **Security → WAF → Rate limiting rules** → *Create rule* (free plan allows 1): name `auth`, if
   *URI Path* *starts with* `/api/auth/`, rate *10 requests / 10 seconds* per IP, action **Block** for 10 s.
4. **SSL/TLS → Edge Certificates** → *Always Use HTTPS* on, *Minimum TLS* 1.2, *HSTS* on.
5. Route the API through the domain (`api.<domain>` → Worker route) so these rules apply to it, and add
   the new origin to `ALLOWED_ORIGINS` and the Google OAuth client.

## Owner: turn on 2FA

Hub → 🛡️ الأمان → «تفعيل 2FA» → add the key in Google Authenticator / Aegis → type the code. From then on
each browser asks for a code after Google sign-in (the pass lasts 12 h); a newly paired Hub phone gets a
30-day pass. To turn it off you need a current code.

## Phase 2 — active defense & deception (live)

Defense and deception on **our own** endpoints only. Nothing reaches out to an attacker's
systems (no hack-back, no retaliation, no DoS); "making them powerless" = detect, trap, slow,
ban, document.

### Threat engine (`apps/edge/src/security/threat.ts`, `defense.ts`)
Every API request is scored in the guard (URL + selected headers; bodies are not scanned so
community posts can contain code):

| Signal | Points |
|---|---|
| Honeypot / decoy path (`/.env`, `/.git/*`, `/wp-login.php`, `/phpmyadmin`, `/actuator`, `/api/admin/*`, `/api/internal/*`, `/api/debug`, `/api/v1/admin/*`, robots decoys, backup files…) | 100 → instant ban + tarpit |
| Known attack tool UA (sqlmap, nikto, nuclei, wpscan, ffuf, hydra…) | 60 |
| SQLi / XSS / traversal / command-, template-, Log4Shell- or metadata-SSRF payload | 25–35, request refused (403) |
| TRACE/PROPFIND/DEBUG…, `X-Original-URL`, oversized URL | 15–30 |
| Every 8th unknown-route 404 within a minute (path scanning) | 10 |
| Credential stuffing (≥10 different emails failing from one client in 15 min) | 20 each |
| Hidden form field filled (`hp_url` on sign-in/up) | 40 (answer looks like a normal failure) |

30 points within an hour = **automatic ban, escalating 1 h → 6 h → 24 h → 7 d** for repeat
offenders. Clients are keyed by IPv4 address or IPv6 **/64**. The strike ledger lives in the
`RL_DO` Durable Object shards (`threat:0..7`, memory only); a new ban is written once to KV
`sec:bans` (capped at 300 writes/day) and takes effect at once in the isolate that saw it.

**CGNAT safety:** Egyptian mobile carriers put many users behind one IP, so a banned IP is
still let through for a *clean* request that carries a genuinely signed access token. Attack
requests from a banned client get the tarpit regardless of token. Typos on one account never
add strike points (the per-account lockout handles those).

**Tarpit:** decoy pages (fake WordPress login, fake `.env`, fake admin JSON) slow-dripped one
chunk every 2 s for ~40 s, max 25 concurrent per isolate (then plain 403). It costs us no CPU
while waiting and only answers requests made *to us*.

### Site honeypots (Pages Functions, `apps/web/functions/*`)
`/wp-login.php`, `/xmlrpc.php`, `/wp-admin/*`, `/phpmyadmin/*`, `/admin-backup/*`,
`/old-admin/*`, `/db-export/*`, `/internal-panel/*` serve a slow decoy and report the client IP
to the API (`x-safqa-trap: TRAP_SECRET`) → same ledger, instant API-wide ban. `robots.txt`
lists the decoys as `Disallow` (polite crawlers never come); `_redirects` sends `/.env`,
`/.git/*`, `/.aws/*`, `/backup.sql` to the API trap.

### Alerts
Telegram to the owner (direct send, no D1 outbox), tiered: 🔴 حرج (trap hit, auto-ban,
refresh-token reuse, 2FA lock, credential stuffing — sent at once), 🟠 عالي (exploit attempt,
scanner, forged webhook, admin probing — sent at once), 🟡 متوسط (minute batch). One alert per
(kind, client) per 30 min, max 30/hour per isolate. Attacker-controlled text is HTML-escaped.

### Hub «🛡️ الأمان»
Live attack feed (polled every 10 s), trap hits, top offenders (bans, reasons, last paths,
one-tap release), active tarpits, and the security agents.

### Security AI agents (`security/agents.ts`, brain team «الأمن»)
Registered as ops agents (XP/ranks/toggles in the Hub) and members of the brain's 🔐 team:

| Agent | Every | Does |
|---|---|---|
| 🧠 محلّل التهديدات (`sec_analyst`) | 60 min | classifies the last hour (SQLi/XSS/scan/trap…), spots campaigns (same class from ≥3 sources) |
| 📈 راصد الشذوذ (`sec_anomaly`) | 30 min | attacks/hour vs 48 h baseline (z-score) → brain finding `attack_spike` |
| 🪤 صيّاد الفخاخ (`sec_trap`) | 60 min | trap hits: random bot scan vs targeted attack |
| 🩹 مستشار الترقيع (`sec_patch`) | 120 min | exploit attempts on **real** routes → fix checklist + GitHub issue draft, routed through the brain (issues are never auto-filed; owner approves) |

Rules first; at most one Workers AI call per run and **12 per day** in total (shared free
budget respected via `llm(...,'ops')`). Agents never ban or contact anyone. State: one KV doc
`sec:agents` (one write per run).

### Other hardening in Phase 2
- **SRI**: every `/assets/*.js|css` in the site's `index.html` carries `integrity="sha384-…"`
  (computed at build, `apps/web/csp.ts`). The Hub is deliberately not SRI-pinned (its files
  are edited in place; a stale hash would lock the owner out).
- Permissions-Policy denies hid/midi/sensors/display-capture/idle/XR/topics; `Origin-Agent-Cluster`.
- CORS: disallowed origins get **no** `Access-Control-Allow-Origin` at all.
- `security.txt` on site, Hub and API; API `robots.txt` with decoys.
- **SSRF**: paste-a-link refuses IP literals, internal names, odd ports, credentials and our own
  hosts, and re-validates every redirect hop (`security/outbound.ts`).
- **Open redirect**: `?next=` after sign-in accepts same-site paths only (no `//host`, `/\host`).
  Google OAuth uses a fixed redirect URI (`/auth/callback`), nothing user-controlled.
- **Cache poisoning**: edge-cached API responses (`catalog/api.ts cached()`) are keyed by URL
  only and are built from URL parameters only (no header/cookie/auth input) → audited safe.
- **innerHTML audit**: Hub renders go through `esc()`; the site's only
  `dangerouslySetInnerHTML` is the agent avatar SVG built from static agent definitions (no user input).
- **Tokens vs cookies**: the API uses bearer tokens in `Authorization`, not cookies, so CSRF
  doesn't apply and there are no cookie flags to set; tokens are short-lived (15 min access),
  refresh tokens rotate with reuse detection.

### GitHub (Omar08263/safqa and Omar08263/safqa-hunter)
Applied via API: secret scanning + push protection, Dependabot alerts + security updates,
private vulnerability reporting, CodeQL default setup, default `GITHUB_TOKEN` = read-only,
rulesets that block force-push/deletion of the default branch and deletion/rewrite of
release tags, `CODEOWNERS`, `dependabot.yml` (weekly).
Not enabled on purpose: required PRs/status checks and signed commits (the autonomous agents
push to `main`; turning these on would stop deploys). GHAS-only features (custom patterns,
validity checks) need a paid plan.

## Later

- Blind index (`HMAC(email)`) + encrypted `users.email` / `tg_links.chat_id`, backfill in one off-peak run
  (~2 writes per row), then switch lookups.
- Return fresh tokens from password change and revoke other sessions.
- Enforce app signatures once v5.3+ dominates.
- Analytics Engine sink for security events (when the dataset is enabled).
