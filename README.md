<!-- Safqa README · hand-made SVGs in docs/assets, real screenshots in docs/screenshots -->
<div align="center">

<a href="#readme"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/hero-light.svg"><img alt="صفقة · Safqa — Know a fair price before you pay" src="docs/assets/hero-light.svg" width="100%"></picture></a>

<br/>

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/typing-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/typing-light.svg"><img alt="Safqa highlights" src="docs/assets/typing-light.svg" width="760"></picture>

<p>
<img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&labelColor=1c1915&logo=typescript&logoColor=white">
<img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&labelColor=1c1915&logo=react&logoColor=61DAFB">
<img alt="Vite 8" src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&labelColor=1c1915&logo=vite&logoColor=white">
<img alt="Tailwind 4" src="https://img.shields.io/badge/Tailwind-4-38BDF8?style=for-the-badge&labelColor=1c1915&logo=tailwindcss&logoColor=white">
<img alt="Node.js 22" src="https://img.shields.io/badge/Node.js-22-5FA04E?style=for-the-badge&labelColor=1c1915&logo=nodedotjs&logoColor=white">
<br/>
<img alt="Hono 4" src="https://img.shields.io/badge/Hono-4-E36002?style=for-the-badge&labelColor=1c1915&logo=hono&logoColor=white">
<img alt="PostgreSQL 16" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&labelColor=1c1915&logo=postgresql&logoColor=white">
<img alt="Redis BullMQ" src="https://img.shields.io/badge/Redis-BullMQ-DC382D?style=for-the-badge&labelColor=1c1915&logo=redis&logoColor=white">
<img alt="Drizzle ORM" src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge&labelColor=1c1915&logo=drizzle&logoColor=C5F74F">
<img alt="Expo 58" src="https://img.shields.io/badge/Expo-58-000020?style=for-the-badge&labelColor=1c1915&logo=expo&logoColor=white">
<br/>
<img alt="Docker ready" src="https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&labelColor=1c1915&logo=docker&logoColor=white">
<img alt="pnpm 10" src="https://img.shields.io/badge/pnpm-10-F69220?style=for-the-badge&labelColor=1c1915&logo=pnpm&logoColor=white">
<img alt="Turborepo 2" src="https://img.shields.io/badge/Turborepo-2-EF4444?style=for-the-badge&labelColor=1c1915&logo=turborepo&logoColor=white">
</p>
<p>
<a href="LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-c9840a?style=for-the-badge&labelColor=1c1915"></a>
<img alt="UI Arabic + English" src="https://img.shields.io/badge/UI-Arabic%20%2B%20English-0e6b52?style=for-the-badge&labelColor=1c1915">
<a href="https://render.com/deploy?repo=https://github.com/Omar08263/safqa"><img alt="deploy Render" src="https://img.shields.io/badge/deploy-Render-46E3B7?style=for-the-badge&labelColor=1c1915&logo=render&logoColor=46E3B7"></a>
<a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-c9840a?style=for-the-badge&labelColor=1c1915"></a>
</p>

<p><b>Safqa (صفقة, “a deal”)</b> tracks prices across Egyptian stores, spots inflated “was” prices,<br/>and has a panel of AI agents argue about every deal before you spend a pound.</p>

<p>
  <a href="https://safqaeg.pages.dev"><img alt="Open the live demo" src="https://img.shields.io/badge/%E2%96%B6%20%20live%20demo-try%20Safqa%20now-c9840a?style=for-the-badge&labelColor=1c1915&logo=huggingface&logoColor=FFD21E"></a>
</p>

<p><a href="#showcase"><b>Showcase</b></a> · <a href="#features"><b>Features</b></a> · <a href="#v3"><b>v3 app</b></a> · <a href="#how-it-works"><b>How it works</b></a> · <a href="#agent-debate"><b>Agents</b></a> · <a href="#architecture"><b>Architecture</b></a> · <a href="#quick-start"><b>Quick start</b></a> · <a href="#deploy"><b>Deploy</b></a> · <a href="#roadmap"><b>Roadmap</b></a> · <a href="#العربية"><b>العربية</b></a></p>

</div>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="showcase">🎬 Showcase</h2>

<p align="center">
  <img src="docs/screenshots/walkthrough.gif" alt="Safqa walkthrough: deals, suspicious discounts, a product with price history, the agent debate, dark mode, the Arabic shopping assistant and the English UI" width="100%">
</p>
<p align="center"><sub>Real recording of the running app: deals → inflated discounts → price history → agent debate → dark mode → assistant → English.</sub></p>

<table>
<tr><td width="50%" valign="top"><img src="docs/screenshots/home-light.webp" alt="Home, Arabic, light" width="100%"><p align="center"><sub>Deals ranked by score · Arabic RTL · light</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/home-dark.webp" alt="Home, Arabic, dark" width="100%"><p align="center"><sub>Same page in dark mode</sub></p></td></tr>
<tr><td width="50%" valign="top"><img src="docs/screenshots/product-light.webp" alt="Product page with multi-store price history" width="100%"><p align="center"><sub>Price history per store, 30-day median and 90-day low</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/debate-dark-crop.webp" alt="Agent debate transcript" width="100%"><p align="center"><sub>Agent debate: each role’s evidence and the judge’s verdict</sub></p></td></tr>
<tr><td width="50%" valign="top"><img src="docs/screenshots/suspicious-light.webp" alt="Inflated discounts section" width="100%"><p align="center"><sub>Discounts that look inflated, flagged against price history</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/assistant-dark-crop.webp" alt="Shopping assistant" width="100%"><p align="center"><sub>Shopping assistant: ask in Egyptian Arabic, get product cards back</sub></p></td></tr>
</table>

<h3 align="center">📱 On a phone</h3>

<table>
<tr>
<td width="25%"><img src="docs/screenshots/mobile-home-light.webp" alt="Mobile home" width="100%"></td>
<td width="25%"><img src="docs/screenshots/mobile-product-dark.webp" alt="Mobile product" width="100%"></td>
<td width="25%"><img src="docs/screenshots/mobile-debate-light.webp" alt="Mobile debate" width="100%"></td>
<td width="25%"><img src="docs/screenshots/mobile-search-dark.webp" alt="Mobile search filters" width="100%"></td>
</tr>
</table>

<details>
<summary><b>🖼️ More screens</b> (English UI, search, admin, watchlist, alerts, sign-in)</summary>
<br/>
<table>
<tr><td width="50%" valign="top"><img src="docs/screenshots/home-en.webp" alt="English UI" width="100%"><p align="center"><sub>English toggle, left-to-right</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/product-en.webp" alt="Product page in English" width="100%"><p align="center"><sub>Product page in English</sub></p></td></tr>
<tr><td width="50%" valign="top"><img src="docs/screenshots/search-light.webp" alt="Search with filters" width="100%"><p align="center"><sub>Search: store, category, discount, price range, hide fake discounts</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/admin-dark.webp" alt="Admin page" width="100%"><p align="center"><sub>/admin: store adapters, crawl heat, debates, LLM providers and free-tier notes</sub></p></td></tr>
<tr><td width="50%" valign="top"><img src="docs/screenshots/watchlist-light.webp" alt="Watchlist" width="100%"><p align="center"><sub>Watchlist with target prices</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/alerts-dark.webp" alt="Alerts" width="100%"><p align="center"><sub>Alert channels and rules</sub></p></td></tr>
<tr><td width="50%" valign="top"><img src="docs/screenshots/login-light.webp" alt="Sign in" width="100%"><p align="center"><sub>Email sign-in with the demo account</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/suspicious-dark.webp" alt="Inflated discounts, dark" width="100%"><p align="center"><sub>Inflated discounts in dark mode</sub></p></td></tr>
</table>
</details>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="features">✨ Features</h2>

<table>
<tr><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icons/chart-dark.svg"><img src="docs/assets/icons/chart-light.svg" width="44" height="44" alt=""></picture><h3>Price history that tells the truth</h3><p>Every offer becomes a time series. The score (0–100) rewards a real drop versus the 30-day median and a touch of the 90-day low.</p></td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icons/shield-dark.svg"><img src="docs/assets/icons/shield-light.svg" width="44" height="44" alt=""></picture><h3>Fake-discount radar</h3><p>A struck-through “was” price far above the selling history costs 30 points and gets an <b>inflated</b> badge. The judge can never call it <code>buy_now</code>.</p></td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icons/agents-dark.svg"><img src="docs/assets/icons/agents-light.svg" width="44" height="44" alt=""></picture><h3>Five-role AI debate</h3><p>Historian, market analyst, trust analyst and skeptic call typed tools, then a judge returns a score, <code>buy_now</code> / <code>wait</code> / <code>skip</code>, and an Arabic explanation.</p></td></tr>
<tr><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icons/doc-dark.svg"><img src="docs/assets/icons/doc-light.svg" width="44" height="44" alt=""></picture><h3>MarkItDown page cleaning</h3><p>A full Noon page goes from 530,311 to 12,490 characters (97.6% smaller) before any model reads it. JSON-LD stays the only price source.</p></td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icons/zap-dark.svg"><img src="docs/assets/icons/zap-light.svg" width="44" height="44" alt=""></picture><h3>Free-tier LLM router</h3><p>A load balancer across Groq, Gemini, NVIDIA NIM, OpenRouter, Ollama and a mock, with 30 s timeouts, hedged requests and 60 s circuit breakers.</p></td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icons/bell-dark.svg"><img src="docs/assets/icons/bell-light.svg" width="44" height="44" alt=""></picture><h3>Alerts everywhere</h3><p>Watchlist targets, alert rules, Server-Sent Events, Web Push, Expo push and Telegram. Each channel says <code>not_configured</code> until you set it up.</p></td></tr>
<tr><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icons/lang-dark.svg"><img src="docs/assets/icons/lang-light.svg" width="44" height="44" alt=""></picture><h3>Arabic first, English too</h3><p>RTL by default, an English toggle, Egyptian-Arabic copy, a bilingual product matcher, dark mode and a PWA shell.</p></td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icons/phone-dark.svg"><img src="docs/assets/icons/phone-light.svg" width="44" height="44" alt=""></picture><h3>Web, mobile, extension</h3><p>A Vite + React site, an Expo Router app on the same typed API client, and an unpacked browser extension that shows history on store pages.</p></td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icons/globe-dark.svg"><img src="docs/assets/icons/globe-light.svg" width="44" height="44" alt=""></picture><h3>A polite crawler</h3><p><code>SafqaBot/0.1</code> reads <code>robots.txt</code>, waits 5 s per host (8 s on amazon.eg) and stops on a captcha or 403/429. No impersonation, no captcha solver.</p></td></tr>
</table>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="v2">🎨 Web v2: 106 features</h2>

<p align="center"><img src="apps/web/public/brand/safqa-logo-4k.png" alt="Safqa logo" width="420"></p>

The web app now has a <b>numbered feature catalogue at <code>/features</code></b>. It lists 106 features in 9 groups, and every entry links to the page where you can try it: discovery 14, price intelligence 16, money tools 13, watching 9, compare & share 13, account 12, gamification 5, accessibility 11, app & offline 13. Some entries are small UX touches (copy link, toasts, skeletons); the list counts them honestly.

- <b>Sign-in</b>: email register, login and logout-all; a password-reset flow; a profile page (avatar, rename, change password, delete account). Google sign-in uses Google Identity Services when <code>VITE_GOOGLE_CLIENT_ID</code> is set, otherwise the button says it isn't configured. See <a href="docs/google-sign-in.md">docs/google-sign-in.md</a>.
- <b>Design</b>: a new logo (SVG plus 4096 px PNGs in <code>apps/web/public/brand/</code>) and a glass/mesh design system. It has scroll reveals, page transitions, count-ups, confetti and skeletons, and respects <code>prefers-reduced-motion</code>.
- <b>Tools</b>: compare up to 4 products with an indexed chart, installment / VAT / currency / true-cost / unit-price calculators, a budget and savings tracker, collections shared by link, a sales calendar with <code>.ics</code> export, market insights, achievements, a ⌘K command palette, keyboard shortcuts, QR share, CSV export and an offline service worker.

<table>
<tr><td width="50%"><img src="docs/screenshots/v2-home.webp" alt="v2 home" width="100%"></td><td width="50%"><img src="docs/screenshots/v2-features.webp" alt="Features catalogue" width="100%"></td></tr>
<tr><td width="50%"><img src="docs/screenshots/v2-product-charts.webp" alt="Product charts" width="100%"></td><td width="50%"><img src="docs/screenshots/v2-compare.webp" alt="Compare" width="100%"></td></tr>
<tr><td width="50%"><img src="docs/screenshots/v2-dashboard.webp" alt="Dashboard" width="100%"></td><td width="50%"><img src="docs/screenshots/v2-tools.webp" alt="Tools" width="100%"></td></tr>
<tr><td width="50%"><img src="docs/screenshots/v2-insights.webp" alt="Insights" width="100%"></td><td width="50%"><img src="docs/screenshots/v2-home-dark.webp" alt="Dark home" width="100%"></td></tr>
</table>
<table><tr>
<td width="25%"><img src="docs/screenshots/v2-mobile-features.webp" alt="Mobile features" width="100%"></td>
<td width="25%"><img src="docs/screenshots/v2-mobile-product.webp" alt="Mobile product" width="100%"></td>
<td width="25%"><img src="docs/screenshots/v2-mobile-home-dark.webp" alt="Mobile dark" width="100%"></td>
<td width="25%"><img src="docs/screenshots/v2-mobile-settings.webp" alt="Mobile settings" width="100%"></td>
</tr></table>

In the static demo, accounts, watchlist, collections and reset codes live in your browser's localStorage. The reset code appears on screen because the demo has no mail server.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="v5">🔥 Safqa v5: Egypt's live price index</h2>

**16,000+ real products and 16,200+ offers from 8 Egyptian stores.** Every price comes from an official store feed or the store's own published schema.org data, with an honest crawler: robots.txt respected, rate-limited, no disguise. Live at **[safqaeg.pages.dev](https://safqaeg.pages.dev)** · [Android APK v5.0.0](https://github.com/Omar08263/safqa/releases/download/v5.0.0/safqa.apk)

- **Hot deals with heat and votes**, cross-store matching (GTIN → MPN → model tokens), real price history in D1, and a live "just dropped" feed (SSE) with price-flip animations and soft sounds.
- **Always-on ingestion agents** on Worker cron: new Shopify arrivals in ~30 min, an adaptive recrawl scheduler (watched ~1 h, hot ~90 min–3 h), a self-healing AI extractor, and a [source health dashboard](https://safqaeg.pages.dev/sources).
- **[Smart tools](https://safqaeg.pages.dev/smart)**: Deal DNA score, fake-discount radar, price-war detector, cross-store cheapest-basket optimizer, Egyptian sale-season calendar, and opt-in smart alerts (quiet hours, digest or instant).
- **Auto-tracking** of everything you view ("dropped since you viewed it"), paste-a-link for any store, and a browser extension that shows cross-store prices on store pages.
- Docs: [catalog and freshness](docs/catalog.md) · [v5 roadmap and Black's ideas](docs/roadmap-v5.md) · [competitive research](docs/competitive-research.md)

<p align="center">
<img src="docs/screenshots/v5/product-dna.webp" width="60%" alt="Product page with Deal DNA">
<img src="docs/screenshots/v5/smart-mobile.webp" width="24%" alt="Smart tools on mobile">
</p>
<p align="center">
<img src="docs/screenshots/v5/sources-health.webp" width="60%" alt="Sources and freshness">
<img src="docs/screenshots/v5/hot-mobile.webp" width="24%" alt="Hot deals on mobile">
</p>

<h2 id="v4">✨ Safqa v4: native app, real backend, one design</h2>

<p align="center">
<a href="https://github.com/Omar08263/safqa/releases/download/v5.0.0/safqa.apk"><img alt="Download the native Android app" src="https://img.shields.io/badge/Android-Native%20app%20v5.0.0-3DDC84?style=for-the-badge&labelColor=1c1915&logo=android&logoColor=3DDC84"></a>
<a href="https://safqaeg.pages.dev/plans"><img alt="Plans" src="https://img.shields.io/badge/Plans-4%20tiers-F5B524?style=for-the-badge&labelColor=1c1915"></a>
<a href="https://t.me/SafqaDealsBot"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-@SafqaDealsBot-229ED9?style=for-the-badge&labelColor=1c1915&logo=telegram&logoColor=white"></a>
</p>

<table><tr>
<td width="33%"><img src="docs/screenshots/v4-phone-home.webp" alt="Phone home with greeting and bottom bar" width="100%"></td>
<td width="33%"><img src="docs/screenshots/v4-phone-plans.webp" alt="Plans on phone" width="100%"></td>
<td width="33%"><img src="docs/screenshots/v4-phone-radar.webp" alt="Deal radar on phone" width="100%"></td>
</tr></table>
<table><tr>
<td width="36%"><img src="docs/screenshots/v4-tablet-home.webp" alt="Tablet layout with side rail" width="100%"></td>
<td width="64%"><img src="docs/screenshots/v4-desktop-home.webp" alt="Desktop" width="100%"><img src="docs/screenshots/v4-desktop-plans.webp" alt="Plans comparison on desktop" width="100%"></td>
</tr></table>

- **Native Android app** (`apps/mobile`, Expo SDK 58 / React Native 0.88, no WebView): deals, search, product with price chart, watchlist with local notifications, radar, tools, settings, onboarding. Reads the live backend first, then the static snapshot, and caches for offline. Email sign-in, tier from the server, watchlist sync. Build: `deploy/mobile/build-apk.sh` (keystore stays outside the repo).
- **Real catalog: 229 products** with real prices from B.TECH, 2B, Raya and Amazon.eg (sitemaps + JSON-LD, robots.txt respected, honest `SafqaBot` user agent, one request per 3 s per host). Noon blocks bots and is not crawled. `deploy/hf/refresh-live.sh` runs the crawl, media, snapshot and deploy in about 7 minutes.
- **One design across devices:** separate phone (auto-hiding 5-item bottom bar), tablet (side rail) and desktop layouts picked by width + pointer; square white product tiles; a type scale; Latin digits everywhere.
- **New 4K logo** (SVG master, light/dark PNGs, favicons, PWA + Android adaptive icons) and **4 tiers** (🌱 مجاني · 🥈 فضّي 49 · 👑 ذهبي 99 · 💎 ماسي 199 ج.م/شهر via InstaPay at `#/pay`) with 4K badges, sounds and effects.
- **Feel:** animated first-visit tour, WebAudio sounds (muted by default), haptics, undo toasts, friendly Egyptian Arabic microcopy, a Cairo-time greeting and a real 404. Checklist: [docs/polish.md](docs/polish.md).
- **WhatsApp + Telegram:** `wa.me` share links everywhere, a «get deals» section, and `deploy/telegram/post-deals.ts` (posts the top real deals; dry-run without a token). A WhatsApp bot needs the paid Business API, so it is not offered.
- QA: `deploy/qa/shots.cjs` screenshots every route at 360/390/412/768/1024/1440 and flags horizontal overflow and page errors.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="v3">🚀 Safqa v3: a real shopping app</h2>

<p align="center">
<a href="https://github.com/Omar08263/safqa/releases/download/v5.0.0/safqa.apk"><img alt="Download the Android APK" src="https://img.shields.io/badge/Android-Download%20APK-3DDC84?style=for-the-badge&labelColor=1c1915&logo=android&logoColor=3DDC84"></a>
<a href="https://safqaeg.pages.dev/app"><img alt="Install the PWA" src="https://img.shields.io/badge/PWA-Install-5A0FC8?style=for-the-badge&labelColor=1c1915&logo=pwa&logoColor=white"></a>
<a href="https://safqaeg.pages.dev/toolbox"><img alt="402 offline tools" src="https://img.shields.io/badge/Toolbox-402%20offline%20tools-d99a1b?style=for-the-badge&labelColor=1c1915"></a>
</p>

v3 takes the best ideas from Amazon, Noon, AliExpress, Google Shopping, Keepa, CamelCamelCamel, Honey, PriceSpy and Reddit/Discord, and builds them on Safqa's real data.

<table>
<tr><td width="50%" valign="top"><img src="docs/screenshots/v3-product.webp" alt="Product page with the real store photo gallery" width="100%"><p align="center"><sub><b>Product pages like Amazon and Noon.</b> Real store photos (zoom, fullscreen, swipe), store description and specs, price badges, and a sticky buy bar.</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/v3-product-ai.webp" alt="AI summary, description and specs" width="100%"><p align="center"><sub><b>ملخص ذكي (AI summary).</b> Deterministic and offline. Pros, cons and a verdict built from the store's specs and the recorded price history, with its basis and confidence shown.</sub></p></td></tr>
<tr><td width="50%" valign="top"><img src="docs/screenshots/v3-community.webp" alt="Community feed" width="100%"><p align="center"><sub><b>Community.</b> Posts with photos and video, reactions, groups, XP, ranks, badges and a leaderboard. Seeded members are labelled <i>عضو تجريبي</i> (demo member).</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/v3-chat.webp" alt="Chat rooms and DMs" width="100%"><p align="center"><sub><b>Chat.</b> Rooms and DMs. AI agents answer from real prices and hand over when their shift ends.</sub></p></td></tr>
<tr><td width="50%" valign="top"><img src="docs/screenshots/v3-agents.webp" alt="Agents HQ" width="100%"><p align="center"><sub><b>Agents HQ.</b> 28 clearly labelled AI bots in 7 teams. Each has a procedural 4K avatar, a personality, a shift and a task. Mood follows real signals.</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/v3-rules.webp" alt="Rules and moderation" width="100%"><p align="center"><sub><b>Rules and moderation.</b> Rules are accepted before posting. Automatic checks cite the rule broken, an escalation table sets the penalty, and appeals and a public log are included.</sub></p></td></tr>
<tr><td width="50%" valign="top"><img src="docs/screenshots/v3-radar.webp" alt="Deal radar" width="100%"><p align="center"><sub><b>Deal radar (Keepa/CamelCamelCamel style).</b> Real drops, the lowest recorded price, suspicious discounts and gaps between stores. Alerts use catchy Arabic headlines, animated banners and browser notifications. The email digest is opt-in only.</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/v3-toolbox.webp" alt="Toolbox" width="100%"><p align="center"><sub><b>Toolbox.</b> 402 offline tools: installment true cost, appliance power cost on Egypt's tariff tiers, FX at cached daily rates, unit price, size guides, warranty and return dates, and converters (feddan and qirat included).</sub></p></td></tr>
<tr><td width="50%" valign="top"><img src="docs/screenshots/v3-agent.webp" alt="Agent profile" width="100%"><p align="center"><sub>Agent profile: personality, current task, issues, log, a 4K avatar download, and a chat box.</sub></p></td><td width="50%" valign="top"><img src="docs/screenshots/v3-app.webp" alt="Get the app" width="100%"><p align="center"><sub><b>/app.</b> The Android app (a TWA in v3; native since v4), PWA install, a QR code and live release info from GitHub.</sub></p></td></tr>
</table>

<table><tr>
<td width="25%"><img src="docs/screenshots/v3-m-product.webp" alt="Mobile product" width="100%"></td>
<td width="25%"><img src="docs/screenshots/v3-m-community.webp" alt="Mobile community" width="100%"></td>
<td width="25%"><img src="docs/screenshots/v3-m-toolbox.webp" alt="Mobile toolbox" width="100%"></td>
<td width="25%"><img src="docs/screenshots/v3-m-app.webp" alt="Mobile app page" width="100%"></td>
</tr></table>

<details><summary><b>What is real and what is demo</b></summary>

| Real | Demo or local |
| --- | --- |
| Prices, offers and price history: a daily polite crawl of B.TECH, 2B and Amazon.eg | Community posts, chat, reviews and uploads stay in **your browser** (localStorage and IndexedDB). The free static site has no shared database. |
| Product photos, descriptions, specs and store ratings, crawled from the store pages (`packages/db/src/crawl-media.ts`) and credited to each store | Seeded members and posts are labelled <i>تجريبي</i> (demo) |
| Deal signals (drops, lows, fake discounts, store gaps) | AI agents are offline rule engines over real data. They are labelled as bots and are not people. |
| FX rates: a daily cached reference rate from open.er-api.com, with its date shown | Price history started on 2026-11-18, so verdicts sharpen every day |

No fake coupons, no invented bank offers, no fake reviews.
</details>

<details><summary><b>Android app (TWA)</b></summary>

`deploy/android/build-twa.mjs` uses Bubblewrap core to build a signed Trusted Web Activity (`space.hf.safqa.twa`, minSdk 24). It verifies with
[`/.well-known/assetlinks.json`](https://safqaeg.pages.dev/.well-known/assetlinks.json), so the app opens full-screen without a URL bar. Google sign-in, notifications and offline mode run in Chrome, as on the web. The keystore stays outside the repo. Releases are on [GitHub Releases](https://github.com/Omar08263/safqa/releases/latest).
</details>

<h2 id="backend">🛰️ Real backend: Cloudflare edge (free tier)</h2>

Accounts, sync, the live community and chat, real AI agents, moderation, **InstaPay payments with AI receipt checks**, discount codes and the Telegram bot run on a free Cloudflare Worker + D1 + KV + Workers AI. The static site falls back to its snapshot if the backend is down.

| | |
|---|---|
| API | https://safqa-api.safqaeg.workers.dev |
| Admin (owner only, Google + allowlist) | https://safqa-admin.pages.dev · [Android APK](https://github.com/Omar08263/safqa/releases/download/admin-v1.0.0/safqa-admin.apk) |
| Telegram | [@SafqaDealsBot](https://t.me/SafqaDealsBot) — deals, price-drop alerts, daily digest, AI price answers in Egyptian Arabic |
| On the site | [`/pay`](https://safqaeg.pages.dev/pay) plans + InstaPay · [`/live`](https://safqaeg.pages.dev/live) live community |

Details, models, payment flow, limits and what is still demo: **[docs/backend.md](docs/backend.md)**.

<h2 id="how-it-works">⚙️ How it works</h2>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/pipeline-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/pipeline-light.svg"><img alt="Crawl, JSON-LD price, MarkItDown, agent debate, score and alert" src="docs/assets/pipeline-light.svg" width="100%"></picture></p>

1. **Crawl.** The worker ticks every minute. Hot products are fetched hourly, warm ones every 6 hours, cold ones every 48 hours, with BullMQ priority in that order. Unchanged HTML (sha256) writes no new price point.
2. **Parse.** `parseJsonLdOffer` reads schema.org `Product` data. It is the only place a price or title comes from.
3. **Clean.** `htmlToLlmMarkdown` strips the chrome, starts at the H1 and calls the MarkItDown CLI. The text is stored on the offer as page context for the agents. It can never overwrite the JSON-LD price.
4. **Debate.** When a crawl changes the page hash, the `safqa-debate` queue runs the five-role debate. A fresh transcript is reused for six hours while the price fingerprint is unchanged.
5. **Score and alert.** The deal score, the fake-discount flag and the verdict reach the web, mobile and extension clients over the typed API and SSE.

<details>
<summary><b>📉 MarkItDown, measured on a real Noon page</b></summary>
<br/>

| | Characters | ≈ Tokens |
| --- | ---: | ---: |
| Raw Noon HTML | 530,311 | ~132,578 |
| After `htmlToLlmMarkdown` | 12,490 | ~3,123 |
| **Saved** | **97.6%** | |

Numbers come from `packages/adapters/src/markitdown.test.ts` (“MarkItDown on the full Noon capture”), which also checks that the title and the price survive the cleaning.

</details>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="agent-debate">🧠 Agent debate</h2>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/agents-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/agents-light.svg"><img alt="Historian, market, trust and skeptic feed the judge" src="docs/assets/agents-light.svg" width="100%"></picture></p>

The historian, market analyst, trust analyst and skeptic each call typed tools (`get_price_history`, `get_seasonality`, `get_ratings`) before they speak. The skeptic must call the history tool itself, so it can disagree with the historian. The judge calls no tools. It reads the transcript and returns JSON: a score, `buy_now` / `wait` / `skip`, and explanations in Arabic and English. A fake discount can never be `buy_now`.

> **Example.** Inflated washer list price: the historian cites median ≈ current, the skeptic says `STANCE=challenge`, and the judge returns `skip`.

<details>
<summary><b>🔀 The LLM router, providers and free tiers</b> (full notes)</summary>
<br/>

Five roles share one transcript and a tool loop. The historian, market analyst, trust analyst, and skeptic each call typed tools (`get_price_history`, `get_seasonality`, `get_ratings`) before they speak. The judge does not call tools. It reads what the others said and returns a score, `buy_now` / `wait` / `skip`, and an Arabic explanation. The skeptic is required to call the history tool itself, so it can disagree with the historian.

The debate router spreads calls across every configured free model. Fast roles (historian, market, trust, skeptic, assistant) prefer Groq. The judge prefers Gemini, then a Nemotron `:free` model. Gemini stays on the AI Studio free tier. Checked on 10 Nov 2026 against [Gemini pricing](https://aistudio.google.com/docs/pricing): `gemini-3.8-flash` input and output are free of charge. The OpenAI-compatible base URL is `https://generativelanguage.googleapis.com/v1beta/openai/`.

`gemini-3.8-flash` often answers HTTP 503 when demand is high. On 503 or 429 Safqa opens that model's circuit for 60 seconds and picks another live model. Inside Gemini the order is `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3-flash-preview`, `gemini-2.5-flash` (`GEMINI_MODELS` replaces it). `gemini-3-flash-preview` is the one confirmed working when 3.8 is overloaded.

The router is a load balancer, not only a fallback list. It spreads the debate across configured models at once: historian, market, and trust run in parallel, each on a different healthy endpoint. Fast roles prefer Groq (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `openai/gpt-oss-20b`). Qwen is that Groq model, not a separate provider. The judge prefers Gemini, then Nemotron: NVIDIA NIM `nvidia/nemotron-3-ultra-550b-a55b` when `NVIDIA_API_KEY` is set, and the OpenRouter `:free` ids `nvidia/nemotron-3-ultra-550b-a55b:free` and `nvidia/nemotron-3.5-super-vl:free`. `openrouter/free` stays in the pool but is deprioritized because it often lands on gemma-4 and returns 429. OpenRouter's free tier on this account is 50 requests/day. Groq's free plan is about 1,000 requests/day per model. Each call aborts after `LLM_TIMEOUT_MS` (30s). Fast roles also send a hedged request to a second provider if the first is still running after `LLM_HEDGE_MS` (8s). A timeout, 429, or 503 opens that model's circuit for 60 seconds. `/admin` shows the circuit, latency, and quota for each model.

NVIDIA NIM is `https://integrate.api.nvidia.com/v1`. Developer Program trial access is for prototyping, not production (API Trial Terms, 19 Sep 2025). The verified model on this key is `nvidia/nemotron-3-ultra-550b-a55b`. Two other NIM ids are listed by the catalog and are not routed: `deepseek-ai/deepseek-v4.1-flash` (timed out past 100s) and `moonshotai/kimi-k2.6` (HTTP 404 on this account). Mistral is not in the pool; it needs a paid plan. DeepSeek's own API stays an optional paid slot via `DEEPSEEK_API_KEY`.

Get a key:

1. Open [Google AI Studio API keys](https://aistudio.google.com/apikey) and sign in.
2. Create an API key in a Google Cloud project. Leave billing off if you want the free tier.
3. Put the key in `GEMINI_API_KEY` (`GOOGLE_API_KEY` is accepted only when `GEMINI_API_KEY` is empty).
4. Open [your project's rate limits](https://aistudio.google.com/rate-limit). Google does not publish one fixed free quota, and the rate-limit page says the numbers are not guaranteed. A free project read on 21 Oct 2026 showed **5 requests/minute, 250,000 input tokens/minute, and 20 requests/day** for Gemini 3.8 Flash. Set `GEMINI_RPM` and `GEMINI_RPD` to what your project shows. Safqa queues calls to stay inside the per-minute cap, retries HTTP 429 with `Retry-After` or exponential backoff, and moves to the next provider when the daily cap is already used.

A debate is several calls, so 20 requests/day is about two debates. `gemini-3.5-flash-lite` is also free of charge on that pricing page and, on the same AI Studio reading, had a larger daily cap. Set `GEMINI_MODEL` if you want it.

| Role | Preferred models | Daily cap |
| --- | --- | --- |
| Fast roles | Groq `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `openai/gpt-oss-20b` | `GROQ_RPD` per model, default 1,000 |
| Judge | Gemini chain, then NVIDIA NIM `nvidia/nemotron-3-ultra-550b-a55b`, then OpenRouter Nemotron `:free` | `GEMINI_RPD` shared, default 20; `OPENROUTER_RPD` shared, default 50 |
| Last | Ollama, then mock | none |

`LLM_ROLE_SKEPTIC=xai:grok-4.7` pins that role while the model is healthy. Grok has no free tier; `grok-4.7` needs `XAI_API_KEY` and prepaid credit. The same pin works for `openai`, `anthropic`, `groq`, `nvidia`, `deepseek`, `together`, and `cohere`. A 429, 503, or 30s timeout opens that model's circuit for 60 seconds and the next call uses another endpoint. `LLM_PROVIDER=mock` never calls the network.

Other free or trial access, same date: Groq's free plan (about 30 requests/minute and 1,000 requests a day per model), NVIDIA NIM trial endpoints for Developer Program members (prototyping only), Cohere trial keys (about 1,000 calls/month, not for production). OpenAI chat and the official DeepSeek API have no standing free tier. Together starts with a credit purchase. Anthropic gives new accounts a small unpublished credit, then charges. Mistral needs a paid plan and is not called. The admin page lists which keys are set, the model each role will call, and this free-tier note. It never shows the key itself.

Debates are stored and shown on the product page as نقاش الوكلاء. A fresh transcript is reused for six hours while the price fingerprint is unchanged. The worker queue `safqa-debate` runs the same function after a crawl that actually changed the page hash.

Example, inflated washer list price: the historian cites median ≈ current, the skeptic says `STANCE=challenge`, and the judge returns `skip`.

The shopping assistant is the same provider and `search_products`. Ask in Egyptian Arabic; the reply includes product cards.

```mermaid
flowchart LR
  UI[Web and mobile] --> API
  API --> Debate[packages/agents]
  Worker[safqa-debate queue] --> Debate
  Debate --> Tools[Typed catalog tools]
  Tools --> DB[(Postgres)]
  Debate --> Router[Health, EWMA, quota]
  Router --> Groq[Groq fast roles]
  Router --> Gemini[Gemini judge]
  Router --> Nemotron[Nemotron judge fallback]
  Router --> Ollama
  Router --> Mock
  Debate --> Grok["xAI grok-4.7 when asked"]
  Debate --> Transcript[deal_debates]
```

Speed: `GET /api/deals` is cached in Redis for 30 seconds and sent with `Cache-Control`. A local run of 40 requests measured about 1.4 ms p50 and 8.4 ms p95. A cached debate read was about 7 ms. Crawl jobs carry BullMQ priority (hot, then warm, then cold). Unchanged HTML (sha256) does not write a new price point. `WORKER_CONCURRENCY` is per process; more worker containers share the queue. Search is limited to 24 cards and deal cards use `content-visibility`.

Also in this pass: a buy-now versus wait forecast, bank-code and coupon stacking, a retail calendar (11.11, White Friday, Ramadan), a watchlist digest, a Telegram webhook, an unpacked browser extension in `apps/extension`, affiliate tag rewriting, an admin page, and JSON logs plus an optional OTLP span export.

The crawler sends `SafqaBot/0.1`, reads `robots.txt`, and waits between requests to a host (5s, 8s for amazon.eg). A captcha or HTTP 403/429 stops that URL. There is no browser impersonation and no captcha solver. Amazon.eg is a best-effort JSON-LD adapter with a Creators API seam in `packages/adapters/src/providers/amazon-creators.ts`.

</details>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="architecture">🏗️ Architecture</h2>

One TypeScript monorepo, three running parts: an API and crawl worker, an Arabic-first website, and an Expo app. They share Zod schemas and one API client, so a watchlist edit on the web shows up on mobile for the same account.

```mermaid
flowchart LR
  subgraph clients
    Web["apps/web<br/>Vite + React"]
    Mobile["apps/mobile<br/>Expo Router"]
  end
  Client["packages/api-client"]
  Web --> Client
  Mobile --> Client
  Client --> API["apps/api<br/>Hono + OpenAPI"]
  API --> DB[("PostgreSQL<br/>price_points")]
  API --> Redis[(Redis)]
  API -. SSE .-> Client
  Worker["apps/worker<br/>BullMQ"] --> Redis
  Worker --> DB
  Worker --> Adapters["packages/adapters"]
  Adapters --> Sites["Store pages or a future official API"]
  Shared["packages/shared<br/>scores, matcher, i18n"]
  API --> Shared
  Worker --> Shared
  Web --> Shared
  Mobile --> Shared
```

| Piece | Role |
| --- | --- |
| `packages/shared` | Deal score, fake-discount detector, Arabic/English matcher, Zod contracts, copy |
| `packages/adapters` | One adapter interface, JSON-LD parser, 10 store adapters, robots.txt, per-host gaps |
| `packages/db` | Drizzle schema, SQL migrate, seed, queries. `price_points` is hypertable-ready |
| `packages/notify` | Web Push, Expo push, Telegram. Each channel reports `not_configured` until its env is set |
| `packages/api-client` | Typed client plus an SSE subscriber used by web and mobile |
| `apps/api` | REST, OpenAPI at `/docs`, auth, watchlist, alerts, `GET /api/events` |
| `apps/worker` | Minute tick. Hot products hourly, warm every 6 hours, cold every 48 hours |
| `apps/web` | Arabic RTL by default, English toggle, dark mode, PWA shell |
| `apps/mobile` | Same deals, search, product chart, watchlist, Expo push registration |

<details>
<summary><b>🗂️ Repository layout</b></summary>

```text
safqa/
├── apps/
│   ├── api/         Hono + OpenAPI, auth, watchlist, alerts, SSE, debate & assistant routes
│   ├── worker/      BullMQ crawl scheduler (hot / warm / cold) and the safqa-debate queue
│   ├── web/         Vite + React 19 + Tailwind 4, TanStack Router & Query, Recharts
│   ├── mobile/      Expo Router app on the shared API client
│   └── extension/   Unpacked MV3 browser extension (price history on store pages)
├── packages/
│   ├── shared/      deal score, fake-discount detector, matcher, i18n, Zod contracts
│   ├── adapters/    store adapters, JSON-LD parser, MarkItDown cleaner, robots.txt
│   ├── agents/      debate roles, typed tools, LLM router with circuits and quotas
│   ├── db/          Drizzle schema, migrations, seed, queries
│   ├── notify/      Web Push, Expo push, Telegram
│   ├── api-client/  typed client + SSE subscriber
│   └── obs/         JSON logs and optional OTLP spans
├── docs/            README art (hand-written SVGs) and screenshots
├── Dockerfile · docker-compose.yml · render.yaml
└── turbo.json · pnpm-workspace.yaml · biome.json · vitest.config.ts
```

</details>

<h3>🧰 Tech stack</h3>

<p align="center">
  <img src="https://skillicons.dev/icons?i=ts,react,vite,tailwind,nodejs,postgres,redis,docker,pnpm&theme=dark" alt="TypeScript, React, Vite, Tailwind, Node.js, PostgreSQL, Redis, Docker, pnpm">
</p>

| Layer | Tools |
| --- | --- |
| Web | React 19, Vite 8, Tailwind CSS 4, TanStack Router + Query, Radix, Recharts, PWA shell |
| Mobile | Expo 58, Expo Router, React Native 0.88, Expo push |
| API | Node 22, Hono 4 with Zod OpenAPI (`/docs`), jose JWT + refresh tokens, Server-Sent Events |
| Data | PostgreSQL 16 (TimescaleDB-ready `price_points`), Drizzle ORM, Redis cache |
| Jobs | BullMQ worker with hot / warm / cold priorities |
| AI | Multi-provider router (Groq, Gemini, NVIDIA NIM, OpenRouter, Ollama, mock), MarkItDown 0.1.7 |
| Tooling | pnpm 10 workspaces, Turborepo, Biome, Vitest, Docker, Render Blueprint |

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="quick-start">🚀 Quick start</h2>

Requirements: Node 22, pnpm 10, Docker.

```bash
cp .env.example .env
pnpm install
docker compose up --build
```

That starts TimescaleDB (Postgres 16), Redis, the API on port 8787, and the worker. The API migrates and seeds on boot (`SEED_ON_BOOT=true` in Compose).

In other terminals:

```bash
pnpm dev:web      # http://localhost:47321
pnpm dev:mobile   # Expo, port 47323
```

`pnpm dev` runs the API, worker, and website together when Postgres and Redis are already up (for example from Compose, or from a local install).

Demo account: `demo@safqa.app` / `demo1234`.

OpenAPI: http://localhost:8787/docs

Without Docker, point `DATABASE_URL` and `REDIS_URL` at your own Postgres 16 and Redis, then:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

If TimescaleDB is not installed, migration keeps `price_points` as a normal table. The primary key is `(offer_id, captured_at)`, which is what `create_hypertable` needs. Turn the extension on later and re-run migrate.

<details>
<summary><b>✅ Checks</b></summary>
<br/>

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm sync:check   # web client writes a watch, mobile client reads it, SSE fires
```

</details>

<details>
<summary><b>🧩 Add a store adapter</b></summary>
<br/>

1. Add a draft in `packages/adapters/src/registry.ts` with `createHtmlAdapter`.
2. Set `status` to `stub` until you have a fixture that proves the parse, then `best-effort`, then `structured` only when the source is an official feed.
3. Put an HTML fixture in `packages/adapters/src/fixtures` and assert `adapter.parse` in `jsonld.test.ts`.
4. If the site publishes schema.org `Product`, you are done: the shared JSON-LD parser fills `Offer`.
5. If it does not, do not invent a bypass. Prefer the merchant's affiliate or catalog API behind the `CatalogAwait` hook (see Amazon). A blocked response must stay a `BlockedBySite` error.
6. Re-seed (the store row is copied from the registry) or insert the store. Set `minIntervalMs` from the site's crawl-delay, never below a few seconds.

`NormalizedOffer` is `{ store, url, title, brand?, model?, ean?, priceEGP, listPriceEGP?, inStock, image?, rating? }`.

After a fetch, JSON-LD (`parseJsonLdOffer`) is the only price/title extractor. MarkItDown is a sidecar CLI (`MARKITDOWN_BIN`, default `markitdown`) that turns the page into compact markdown for the debate: the worker always requests it, stores it on the offer, and `runDebate` receives `formatProductLlmContexts()` as `pageContext`. A price that appears only in the markdown never overrides JSON-LD. The production image installs MarkItDown 0.1.7 in `/opt/markitdown`. If the CLI is missing, the crawl continues without page text.

</details>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="deploy">☁️ Deploy</h2>

<p align="center">
  <a href="https://render.com/deploy?repo=https://github.com/Omar08263/safqa"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="44"></a>
</p>

- **Live demo (free Hugging Face static Space):** <https://safqaeg.pages.dev>. It is the normal web app built with `VITE_DEMO_MODE=static`, answering `/api/*` in the browser from a snapshot recorded from a seeded API. Sign-in, watchlist and alerts are emulated per browser; admin and live events are off. See [`deploy/hf`](deploy/hf/README.md), which also has a single-container image (Postgres, Redis and the API on port 7860).
- **Free Render demo:** `render.yaml` at the repo root provisions a free web API (Docker), a free static site, free Postgres, and free Key Value. After pushing to GitHub, open `https://dashboard.render.com/blueprint/new?repo=https://github.com/Omar08263/safqa`, connect GitHub if asked, and click Apply. The public site URL is the `safqa-web` service; demo login is `demo@safqa.app` / `demo1234`. Free Postgres expires after 30 days, free web services spin down after 15 minutes idle, and the background worker is not included (workers are not free). `LLM_PROVIDER=mock` so no model keys are required.
- **Web (other hosts):** Vercel (or any static host). Build command `pnpm --filter @safqa/web build`, output `apps/web/dist`. Set `VITE_API_URL` to the public API origin. The service worker registers in production builds.
- **API and worker:** a small VPS (Hetzner or similar). Copy the repo, set a real `AUTH_SECRET`, and run `docker compose up -d`. Put Caddy or nginx in front of port 8787 for TLS. Do not publish Postgres or Redis.
- **Backups:** `pg_dump` the volume nightly. `price_points` grows with every observation; a hypertable plus a retention policy is the next step once Timescale is on.
- **Push:** generate VAPID keys for Web Push. Telegram and Expo stay off until `TELEGRAM_BOT_TOKEN` / a device token exist. Google login needs the three `GOOGLE_*` variables. Apple is a route that returns `oauth_not_configured` until the p8 client secret is implemented.

<details>
<summary><b>🔎 What is real, and what is still a stub</b></summary>
<br/>

Real in this foundation: schema and seed, deal score, fake-discount flags, bilingual matcher, JSON-LD parser, robots and rate limits, email auth with refresh tokens, Google OAuth when configured, watchlist, alert rules, SSE, Expo and Telegram and Web Push senders, website, and Expo screens.

Stub or best-effort, on purpose: live HTML for stores that block bots (amazon.eg, and several others), six adapters marked `stub` because they have no verified selectors, Amazon request signing, and Sign in with Apple's client-secret JWT. The worker will not evade a block. Sample prices are seeded so the UI does not depend on a live crawl.

</details>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="roadmap">🗺️ Roadmap</h2>

- [x] Ten store adapters with JSON-LD by default; stubs clearly labeled
- [x] Deal score, fake-discount flags, Arabic/English matcher
- [x] Five-role agent debate with a free-tier LLM router
- [x] MarkItDown page context for the agents
- [x] Web, Expo app and browser extension on one typed API
- [ ] Official feeds: Amazon Creators API, then Noon and Jumia affiliate catalogs
- [ ] A checked-in HTML fixture and test for every promoted adapter
- [ ] URL discovery from allowed `robots.txt` sitemaps
- [ ] Adapter manifests to grow from 10 stores to 100+
- [ ] Nightly EAN and fuzzy-title matching jobs
- [ ] Per-domain error rates, a kill switch per adapter, Postgres backups

<details>
<summary><b>The full plan: 10 stores to 100+</b></summary>
<br/>

1. **Now.** Ten adapters. JSON-LD is the default. Stubs are labeled. Seed data runs the product without live crawling.
2. **Official feeds.** Amazon Creators API, then Noon and Jumia affiliate catalogs. HTML stays a fallback only when the partner API is not configured.
3. **Fixture contracts.** Each promoted adapter gets a checked-in HTML fixture and a test. A parser change that drops a price fails CI.
4. **Sitemaps, not crawls of search pages.** Discover URLs from `robots.txt` sitemaps the site allows. Users can also paste a product URL.
5. **Adapter manifests.** Most of the next 90 stores should be data: domain, interval, currency, status. Custom code only when JSON-LD is absent and a public API exists.
6. **Matching jobs.** Nightly EAN and fuzzy title passes (Arabic and English) merge new listings onto canonical products. Dubizzle stays `used` and never wins “best new price”.
7. **Operations.** Per-domain error rates, a kill switch per adapter, and Postgres backups. Do not raise rate limits to get past a block.

</details>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<h2 id="العربية" align="right">🇪🇬 العربية</h2>

<div dir="rtl" align="right">

**صفقة** بتتابع أسعار المتاجر المصرية (نون، أمازون مصر، جوميا، كارفور وغيرهم)، وبترسم تاريخ السعر لكل عرض، وبتكشف الخصم المضخّم لما سعر «كان» يبقى بعيد عن تاريخ البيع، وبتخلّي خمس وكلاء ذكاء اصطناعي يتناقشوا على كل صفقة قبل ما تدفع.

**الجديد في v3:** صفحات منتجات زي أمازون ونون بصور ومواصفات حقيقية من المتاجر وملخص ذكي، مجتمع ودردشة بنقاط ورتب وشارات، قوانين وإشراف تلقائي بتظلمات، مقر لـ٢٨ وكيل ذكي (بوتات واضحة)، رادار عروض بتنبيهات للتخفيضات الحقيقية بس، صندوق عدة فيه ٤٠٢ أداة شغالة من غير نت، و[تطبيق أندرويد](https://github.com/Omar08263/safqa/releases/download/v5.0.0/safqa.apk) — كله مجاني ومن غير بيانات مزيفة: المحتوى التجريبي مكتوب عليه «تجريبي».

<table>
<tr>
<td width="33%" valign="top"><b>📈 تاريخ السعر</b><br/>انخفاض حقيقي عن وسيط آخر ٣٠ يوم يرفع الدرجة، والاقتراب من أقل سعر في ٩٠ يوم بيضيف نقاط.</td>
<td width="33%" valign="top"><b>🛡️ كاشف الخصم المضخّم</b><br/>سعر «كان» بعيد عن تاريخ البيع يخصم ٣٠ نقطة ويتعلّم «خصم مضخّم».</td>
<td width="33%" valign="top"><b>🧠 نقاش الوكلاء</b><br/>المؤرخ ومحلل السوق ومحلل الثقة والمشكّك بيجيبوا الأدلة، والقاضي بيقول: اشتري دلوقتي، استنى، أو سيبها.</td>
</tr>
<tr>
<td width="33%" valign="top"><b>📄 تنضيف الصفحة بـ MarkItDown</b><br/>صفحة نون كاملة بتصغر ٩٧٫٦٪ قبل ما أي موديل يقراها، والسعر المعتمد يفضل من JSON-LD.</td>
<td width="33%" valign="top"><b>🔔 تنبيهات</b><br/>قائمة مراقبة بسعر مستهدف، وإشعارات على المتصفح والموبايل وتليجرام.</td>
<td width="33%" valign="top"><b>📱 ويب وموبايل وإضافة متصفح</b><br/>نفس الحساب ونفس البيانات على كل الأجهزة، عربي أولًا مع وضع داكن.</td>
</tr>
</table>

**الجديد في v4:** سيرفر حقيقي ببلاش على Cloudflare: حسابات متزامنة، مجتمع ودردشة مباشرة، وكلاء ذكاء اصطناعي حقيقيين بيردوا بأسعار حقيقية، إشراف تلقائي، **اشتراكات بإنستاباي** بمراجعة الإيصال بالذكاء الاصطناعي وأكواد خصم («عندك كود؟»)، [بوت تيليجرام](https://t.me/SafqaDealsBot) لتنبيهات التخفيضات، ولوحة إدارة لصاحب الموقع. التفاصيل في [docs/backend.md](docs/backend.md).

<details>
<summary><b>📚 التفاصيل الكاملة بالعربي</b> (المعمارية، التشغيل، إضافة متجر، الخطة، النشر)</summary>
<br/>

#### المعمارية

المخطط فوق يوضّح نفس المسار: الويب والموبايل بيستخدموا عميل واحد (`packages/api-client`)، والـ API بيحفظ في Postgres وبيبعت التغييرات على Redis كـ Server-Sent Events. العامل (`apps/worker`) بيجدول الزيارات وبيحترم `robots.txt`.

الدرجة من ١٠٠ بتقارن السعر الحالي بوسيط ٣٠ يوم وأقل سعر في ٩٠ يوم. لو السعر المشطوب بعيد عن تاريخ البيع، العرض يتعلّم «خصم مضخّم» وينقص ٣٠ نقطة.

النقاش بين خمس وكلاء: مؤرخ السعر، محلل السوق، محلل الثقة، المعارض، والحكم. كل واحد بيطلب أدوات typed قبل ما يتكلم، والحكم بيقرأ الكلام ده وبيطلع توصية بالعربي. المؤرخ ومحلل السوق ومحلل الثقة بيشتغلوا في نفس الوقت، كل واحد على موديل سليم مختلف. الأدوار السريعة بتفضّل Groq (`openai/gpt-oss-120b` و `qwen/qwen3.8-27b` و `openai/gpt-oss-20b`)، وQwen من Groq مش مزود لوحده. الحكم بيفضّل Gemini، وبعده NVIDIA NIM `nvidia/nemotron-3-ultra-550b-a55b` لو `NVIDIA_API_KEY` موجود، ثم Nemotron المجاني على OpenRouter. لو الطلب عدّى ٣٠ ثانية، أو رجع 503 أو 429، صفقة بتقفل دائرة الموديل ٦٠ ثانية. الأدوار السريعة بتبعت طلب تاني لمزود ثاني لو الأول لسه شغال بعد ٨ ثواني. Mistral مش في التجمع لأنه محتاج خطة مدفوعة. DeepSeek الرسمي اختياري ومدفوع عبر `DEEPSEEK_API_KEY`. سلسلة Gemini: `gemini-3.8-flash` ثم `gemini-3.7-flash` ثم `gemini-3-flash-preview` ثم `gemini-2.5-flash`، وتتظبط بـ `GEMINI_MODELS`. المفتاح من [aistudio.google.com/apikey](https://aistudio.google.com/apikey) ويتحط في `GEMINI_API_KEY` من غير ما تفعّل الفوترة. الحدود الحية للمشروع في [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit). صفقة بتستنى عشان متتجاوزش الطلبات في الدقيقة، وبتعيد المحاولة لو رجع 429، ولو الحصة اليومية خلصت بتكمل للي بعد كده. `openrouter/free` موجود بس متأخر لأن gemma-4 بيرجع 429 كتير. الحصة المجانية لـ OpenRouter على الحساب ده ٥٠ طلب في اليوم. لو مفيش مفتاح، Ollama ثم النموذج المحلي. Grok (`grok-4.7`) جاهز لو حطيت `LLM_ROLE_SKEPTIC=xai:grok-4.7` مع `XAI_API_KEY`، ومفيش طبقة مجانية لـ xAI. صفحة الإدارة بتعرض حالة كل مفتاح ودائرة كل موديل من غير ما تكتب السر. النقاش بيتخزن ويظهر في صفحة المنتج تحت «نقاش الوكلاء». المساعد في `/assistant` بيرد بالعامية وبعد ما يبحث في الكتالوج.

`XAI_API_KEY` اختياري للتشغيل المحلي. `ADMIN_TOKEN` مطلوب لصفحة الإدارة. تليجرام و Web Push و Expo و Google و أمازون كرييتورز كلهم اختياريين. الزحف لسه بيحترم robots.txt ومفيش حل للكابتشا.

#### التشغيل المحلي

```bash
cp .env.example .env
pnpm install
docker compose up --build
pnpm dev:web
pnpm dev:mobile
```

الموقع: http://localhost:47321  
الواجهة البرمجية: http://localhost:8787/docs  
الحساب التجريبي: `demo@safqa.app` / `demo1234`

من غير Docker: ظبّط `DATABASE_URL` و `REDIS_URL` ثم `pnpm db:migrate && pnpm db:seed` وبعدين `pnpm dev:api` و `pnpm dev:worker` و `pnpm dev:web`.

#### إضافة متجر

في `packages/adapters/src/registry.ts` ضيف محوّل بـ `createHtmlAdapter`. خلّي الحالة `stub` لحد ما يبقى عندك ملف HTML مثبت في الاختبارات. لو الموقع بينشر schema.org Product، المحلل العام بيكفي. لو الموقع بيرفض البوت، متكتبش التفاف. اربط واجهة الشراكة الرسمية في `CatalogAwait` زي أمازون.

بعد الجلب، التحليل الأساسي للسعر والعنوان هو JSON-LD (`parseJsonLdOffer`). العامل بيطلب MarkItDown بعد كل جلب، بيخزّن النص على العرض، والنقاش بياخد السياق ده عن طريق `pageContext`. `htmlToLlmMarkdown` بتنضّف الهيدر والصور وبتبدأ من الـ H1 وبعدين بتستدعي أداة MarkItDown كأمر سطر (`MARKITDOWN_BIN`، الافتراضي `markitdown`) من غير ما تدمج بايثون جوه التطبيق. صورة Docker بتسطّب MarkItDown 0.1.7 في `/opt/markitdown`. السعر المعتمد يفضل من JSON-LD، والنص ما بيقدرش يغيّره.

#### من ١٠ متاجر لأكتر من ١٠٠

الأساس هو محوّل بيانات (دومين، مهلة، عملة، حالة) مش كود خاص لكل موقع. الترقية بتتم لما يبقى في فيكستر واختبار، أو عقد رسمي. خرائط الموقع المسموح بيها في robots.txt هي مصدر الروابط، مش صفحات البحث. إعلانات دوبيزل بتفضل «مستعمل» وما بتكسبش أحسن سعر جديد.

#### النشر

للتجربة المجانية على Render: بعد رفع المستودع، افتح `https://dashboard.render.com/blueprint/new?repo=https://github.com/Omar08263/safqa` واضغط Apply. رابط الموقع هو خدمة `safqa-web`. الدخول التجريبي `demo@safqa.app` / `demo1234`. قاعدة Postgres المجانية تنتهي بعد ٣٠ يوم، والخدمة بتنام بعد ١٥ دقيقة من غير زيارات، والعامل الخلفي مش مشمول لأن الخطة المجانية ما فيهاش workers.

بدائل أخرى: الويب على Vercel مع `VITE_API_URL`. الـ API والعامل على VPS صغير بـ Docker. سيب Postgres و Redis جوه الشبكة الداخلية، وغير `AUTH_SECRET`، واعمل نسخة احتياطية بـ `pg_dump`.

</details>

</div>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/divider-light.svg"><img alt="" src="docs/assets/divider-light.svg" width="100%"></picture></p>

<div align="center">

<h3>🤝 Contributing · 🔐 Security · 📄 License</h3>

<p>Read <a href="CONTRIBUTING.md">CONTRIBUTING.md</a> before opening a pull request, report vulnerabilities privately as described in <a href="SECURITY.md">SECURITY.md</a>,<br/>and use Safqa under the <a href="LICENSE">MIT License</a>.</p>

<p><sub>Prices in the screenshots come from the seeded demo data, not a live crawl. Store names belong to their owners; Safqa is not affiliated with any store.</sub></p>

<p><a href="#readme">⬆ Back to top</a></p>

<img src="docs/assets/divider-light.svg" width="60%" alt="">

<p><b>صفقة</b> · اعرف السعر العادل قبل ما تدفع</p>

</div>
