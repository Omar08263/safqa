# Contributing to Safqa · المساهمة في صفقة

Thanks for helping. Safqa is a pnpm + Turborepo monorepo (Node 22, pnpm 10).

## Set up

```bash
cp .env.example .env
pnpm install
docker compose up --build   # Postgres, Redis, API, worker
pnpm dev:web                # http://localhost:47321
```

Demo account: `demo@safqa.app` / `demo1234`. `LLM_PROVIDER=mock` runs the agent debate without any API key.

## Before you open a pull request

```bash
pnpm lint
pnpm typecheck
pnpm test
```

- Keep pull requests small and focused, with a clear description of the change.
- Add or update a test when you change parsing, scoring, or the debate.
- Arabic copy lives in `packages/shared/src/i18n.ts`. Keep the Arabic and English keys in sync.

## Store adapters

Follow "Add a store adapter" in the README. In short:

- Start a new adapter as `stub` and promote it only with a checked-in HTML fixture and a test.
- JSON-LD (`parseJsonLdOffer`) is the only source of price and title. MarkItDown text is context for the agents and never sets a price.
- Respect `robots.txt` and the per-host delay. Never add browser impersonation, captcha solving, or any other way around a block. A blocked page must stay a `BlockedBySite` error.

## Commits

Use short, imperative commit messages (for example `Add Raya JSON-LD fixture`). Never commit `.env` files, API keys, or tokens.

---

<div dir="rtl">

شكرًا إنك عايز تساعد. شغّل المشروع بالأوامر اللي فوق، وقبل أي Pull Request شغّل `pnpm lint` و `pnpm typecheck` و `pnpm test`. أي متجر جديد يبدأ `stub` لحد ما يبقى ليه ملف HTML واختبار. السعر بييجي من JSON-LD بس، وممنوع أي التفاف على حماية المواقع. ومتحطش أي مفاتيح أو باسوردات في الكود.

</div>
