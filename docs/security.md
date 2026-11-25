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

## Phase 2 (planned)

- Blind index (`HMAC(email)`) + encrypted `users.email` / `tg_links.chat_id`, backfill in one off-peak run
  (~2 writes per row), then switch lookups.
- Return fresh tokens from password change and revoke other sessions.
- Enforce app signatures once v5.3+ dominates.
- Analytics Engine sink for security events (when the dataset is enabled).
