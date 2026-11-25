# Bug-fix sweep — v5.2 (Nov 2026)

Scope: the short URL, sign-in that stays signed in, and a sweep for small bugs at 360 / 412 / 768 / 1024 / 1440 px with Playwright (`/workspace/url-qa/sweep.cjs`), plus Lighthouse (mobile).

## 1. Short URL
- **Before:** `https://safqa-eg-safqa.static.hf.space/index.html#/radar`. That is a long host, `index.html` and a hash route.
- **After:** `https://safqaeg.pages.dev/radar`. This is Cloudflare Pages (free), project `safqaeg`, with browser-history routes and a `_redirects` SPA fallback (`/* /index.html 200`).
  - `safqa.pages.dev` and `safqa-eg.pages.dev` already belong to other accounts, so we used the closest free name.
  - A custom domain can be attached later; see [custom-domain.md](custom-domain.md).
- Old links keep working:
  - `/index.html` → `/`
  - `#/path?q` → `/path?q`: rewritten before first paint (`index.html` inline script + `lib/clean-url.ts`).
  - The HF Space is now a redirect page (`deploy/hf/redirect.html`). It maps `#/path` to the new path and forwards Google `id_token`s and `admin.*` OAuth states. It also mirrors `demo/` + `media/` for older APKs.
- All links were moved to clean paths:
  - the canonical URL, og:url and sitemap
  - the PWA manifest and the service worker (`safqa-v6`)
  - Telegram/e-mail digests and the Hub
  - the native app and the TWA build
- The API's `ALLOWED_ORIGINS` / `SITE_URL` were updated.

## 2. "I have to sign in again" — root cause and fix
We reproduced it on the live site (`flaky.cjs`): a single aborted `/api/health` deleted the tokens. Three bugs added up:
1. On **any** error, including the network, `me()` cleared the tokens.
2. When the health check failed, the edge bridge sent the backend JWT to the **offline demo API**. The demo API answered 401, the refresh also got 401, and the tokens were deleted.
3. The refresh token rotates. When parallel 401s or two tabs refreshed at once, one of them used an already-rotated token. The server answered 401 and the session was deleted.
4. (Server, found later.) Once D1 hit the free-tier daily write cap, login and refresh failed, because both had to write the `sessions` row.

The fix:
- `lib/auth-tokens.ts` is a single token store:
  - refresh is single-flight per tab and serialised across tabs with `navigator.locks`
  - tokens sync across tabs through the `storage` event
  - tokens are cleared **only** when the server returns 401 for the current refresh token; network errors and 5xx keep the session
- **Silent refresh** runs when the access token has less than 5 min left. It is checked every 60 s, when the tab becomes visible, and when the device comes back online.
- On page load, an expired access token is refreshed before `me()`. The cached profile (`safqa.user`) renders right away.
- A backend session is never answered by the demo API. While the API is down, the user stays signed in and sees an offline state.
- **Remember me:** refresh tokens last 60 days and slide forward on every refresh. The access token lasts 15 min.
  - httpOnly cookies are not possible here: pages.dev and workers.dev are cross-site. So tokens stay in `localStorage` and rotate.
- **Write-cap resilience (edge `auth.ts`):**
  - session writes are best-effort
  - when the `sessions` INSERT fails, the server issues a signed **stateless refresh JWT** (`typ: refresh`, bound to `token_version`, so "sign out everywhere" still revokes it)
  - refresh keeps the same token when rotation can't be written
  - Google sign-in does not fail on the profile update
- Signed-out pages (alerts, watchlist, account) share `components/sign-in-gate.tsx`, which links to `/login?next=…`.

Verified with `reopen.cjs` on a persistent Chrome profile against the live API:

| Scenario | Result |
|---|---|
| Close and reopen the browser | still signed in ✓ |
| Health-check blip | session kept ✓ |
| API fully down | session kept ✓ |
| Access token expired | silent refresh, signed in ✓ |
| Two tabs refreshing at once | both signed in ✓ |

## 3. Small-bug sweep
| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | 10 px / 9 px text, unreadable on phones | ~54 route groups | raised to at least 11 px |
| 2 | Missing `<h1>` | search, alerts, watchlist, account (signed out) | sr-only h1 / sign-in gate h1 |
| 3 | Two `<h1>` | /privacy, /terms (static pages) | English title changed to h2 |
| 4 | Unnamed icon buttons | product stars, specs copy, /live send + upload | aria-labels |
| 5 | Horizontal overflow at 360 px | /ai (AI lab input row), /live (images) | `min-w-0` / `shrink-0`, `max-w-full` |
| 6 | Console error "Blocked call to navigator.vibrate" | home, /drops | haptic only after user activation |
| 7 | Footer jumps in, CLS 0.787 | every page (worst on /radar) | main area reserves the viewport → CLS 0 |
| 8 | Charts library loaded on home | / | lazy `v5-chart.tsx` |
| 9 | Fonts block first paint | all | preload + non-blocking stylesheet |
| 10 | Blank screen until JS loads | all | inline first-paint skeleton |
| 11 | Router waited for the snapshot | all | router and snapshot load in parallel |
| 12 | Wording drift ("تسجيل دخول", "حالياً", …) | smart alerts, registry, … | shared glossary + test |
| 13 | The 3 sign-in persistence bugs above | auth | see §2 |
| 14 | Write-cap login failure | edge | see §2 |

**Total: 14 issue groups (about 70 individual occurrences) found and fixed.**

Not bugs:
- networkidle timeouts on `/` and `/drops`. The live SSE stream keeps the connection open on purpose.
- Aborted requests while navigating.

### Lighthouse (mobile, simulated slow 4G)
| Page | Perf before → after | A11y | Best practices |
|---|---|---|---|
| Home | 46 → 47 (CLS 0) | 100 | 100 |
| /radar | 25 → 49 (CLS 0.787 → 0) | — | — |
| Product | 58 | 88 | — |

Perf is still capped by the JS bundle size and the 2 MB (221 KB gzip) demo snapshot. That is the next target.

Screenshots: `docs/screenshots/v5.2/`.
