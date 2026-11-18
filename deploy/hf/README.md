# Hugging Face deploy

Live demo: https://safqa-eg-safqa.static.hf.space (Space: https://huggingface.co/spaces/safqa-eg/safqa)

## Static Space (free, what runs now)

Hugging Face only hosts Docker and Gradio Spaces on a PRO plan, but static Spaces are free.
The static demo is the normal web app built with `VITE_DEMO_MODE=static`:

- `apps/web/src/lib/demo-api.ts` answers every `/api/*` call in the browser from
  `demo/snapshot.json`, recorded from a real seeded API by `record-snapshot.mjs`.
- Login (`demo@safqa.app` / `demo1234`), register, watchlist, alerts, and settings are
  emulated per browser in localStorage. Admin and live events are off.
- Routes use `#/` URLs, because static hosting has no SPA rewrite.

Redeploy: start a seeded API (`SEED_ON_BOOT=true`), then
`SAFQA_API=http://localhost:8787 HF_TOKEN=... deploy/hf/deploy-static.sh`.

## Single container (full backend: any Docker host, or a Docker Space on HF PRO)

`Dockerfile` + `start.sh` run PostgreSQL, Redis, and the API in one container on port 7860.
The API also serves the built web app on the same origin when `WEB_DIST_DIR` is set
(`apps/api/src/static.ts`). Build from the repo root:

    docker build -f deploy/hf/Dockerfile -t safqa-hf . && docker run -p 7860:7860 safqa-hf

For a Docker Space, copy `deploy/hf/Dockerfile` to the Space root and use `README.docker-space.md`
as its README. Data is ephemeral and reseeded on every boot.

## Live prices (daily refresh)

`deploy/hf/refresh-live.sh` is the one command that turns the static Space into a
real price tracker. It starts Postgres/Redis/API if needed, reads every product
page listed in `deploy/live/catalog.json` once (robots.txt respected, honest
`SafqaBot` user agent, JSON-LD only, no LLM), appends a `price_points` row per
offer so history grows day by day, recomputes deal scores and fake-discount
flags, records the snapshot, builds and uploads the Space, and prints a summary.
A store page that fails keeps its last good price and is shown as stale. The
site shows "آخر تحديث للأسعار" (Cairo time) from the snapshot.

Stores that answer the honest bot today: B.TECH, 2B, and some Amazon.eg pages.
Noon drops connections from any self-identified bot, so its offers stay empty
until a partner feed or a store that allows bots replaces them. Log:
`/workspace/safqa-refresh.log`; status JSON: `/workspace/safqa-refresh-status.json`.
