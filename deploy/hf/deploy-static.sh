#!/usr/bin/env bash
# Build the site, deploy it to Cloudflare Pages (https://safqaeg.pages.dev, clean URLs),
# and turn the old Hugging Face static Space into a redirect to it. The Space keeps
# demo/snapshot.json + media/ so app builds that still point at it keep working.
# Needs: a running seeded Safqa API (SAFQA_API, default http://localhost:8787),
# HF_TOKEN with write access, and the `hf` CLI (pip install -U huggingface_hub).
# Usage: SPACE=safqa-eg/safqa deploy/hf/deploy-static.sh
# Optional: VITE_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com enables Google sign-in (docs/google-sign-in.md).
set -euo pipefail
cd "$(dirname "$0")/../.."
SPACE="${SPACE:-safqa-eg/safqa}"
# Cloudflare Pages credentials (never printed).
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "$HOME/.cloudflare_env" ]; then set -a; . "$HOME/.cloudflare_env"; set +a; fi
OUT="$(mktemp -d)"
# Public GIS client ID (not a secret). Override by exporting VITE_GOOGLE_CLIENT_ID.
export VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-700154178904-k0hi0kp5v19m775u8t1bt6m6mnfhrghc.apps.googleusercontent.com}"
# Run Vite from apps/web so .env.production is loaded. Avoid the corepack pnpm shim.
( cd apps/web && VITE_DEMO_MODE=static VITE_API_URL= ../../node_modules/.bin/vite build --outDir "$OUT" --emptyOutDir )
mkdir -p "$OUT/demo"
node deploy/hf/record-snapshot.mjs "$OUT/demo/snapshot.json"
# Store gallery images (crawled by packages/db/src/crawl-media.ts) as WebP.
python3 deploy/hf/build-media.py "$OUT" || echo "media: skipped (build-media.py failed)"
# 1) Cloudflare Pages (the real site).
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  A="$HOME/.safqa/pages-assets/ai"; if [ -f "$A/index.json" ]; then python3 deploy/ai/twins.py "$A" || true; mkdir -p "$OUT/ai/twins" && cp "$A/index.json" "$A/vecs.bin" "$OUT/ai/" && cp "$A/twins/"*.json "$OUT/ai/twins/" 2>/dev/null || true; fi
  # From apps/web so the v6 Pages Functions (share cards on /p/:id) ship too.
  ( cd apps/web && npx -y wrangler@4 pages deploy "$OUT" --project-name "${PAGES_PROJECT:-safqaeg}" --branch main --commit-dirty=true )
  mkdir -p "$HOME/.safqa/pages-assets" && cp -r "$OUT/demo" "$HOME/.safqa/pages-assets/" && { [ -d "$OUT/media" ] && cp -r "$OUT/media" "$HOME/.safqa/pages-assets/" || true; }
else
  echo "pages: skipped (no CLOUDFLARE_API_TOKEN; run: set -a; . ~/.cloudflare_env; set +a)"
fi
# 2) Old HF Space → redirect + data mirror.
HFOUT="$(mktemp -d)"
cp deploy/hf/redirect.html "$HFOUT/index.html"
cp -r "$OUT/demo" "$HFOUT/"
[ -d "$OUT/media" ] && cp -r "$OUT/media" "$HFOUT/"
[ -d "$OUT/.well-known" ] && cp -r "$OUT/.well-known" "$HFOUT/"
cp deploy/hf/README.static-space.md "$HFOUT/README.md"
hf repos create "$SPACE" --type space --space-sdk static --public --exist-ok
hf upload "$SPACE" "$HFOUT" . --type space --delete '*' --commit-message "Safqa moved to safqaeg.pages.dev (redirect + data mirror)"
echo "Live at https://safqaeg.pages.dev (old https://${SPACE/\//-}.static.hf.space redirects there)"
