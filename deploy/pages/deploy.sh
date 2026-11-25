#!/usr/bin/env bash
# Build the web app and deploy it to Cloudflare Pages (free): https://safqaeg.pages.dev
# Clean history URLs (/login, /product/x): public/_redirects serves index.html for every path.
# Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (e.g. `set -a; . ~/.cloudflare_env; set +a`).
# Price snapshot + gallery images: recorded from a running API (SAFQA_API, default
# http://localhost:8787) when it is up, otherwise copied from ASSETS_DIR (demo/, media/),
# otherwise downloaded from the live site.
# Usage: deploy/pages/deploy.sh            (production)
#        BRANCH=preview deploy/pages/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PROJECT="${PAGES_PROJECT:-safqaeg}"
BRANCH="${BRANCH:-main}"
SITE="${SITE_URL:-https://safqaeg.pages.dev}"
ASSETS_DIR="${ASSETS_DIR:-$HOME/.safqa/pages-assets}"
OUT="${OUT:-$(mktemp -d)}"
export VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-700154178904-k0hi0kp5v19m775u8t1bt6m6mnfhrghc.apps.googleusercontent.com}"
( cd apps/web && VITE_DEMO_MODE=static VITE_API_URL= ../../node_modules/.bin/vite build --outDir "$OUT" --emptyOutDir )
mkdir -p "$OUT/demo"
if curl -sf "${SAFQA_API:-http://localhost:8787}/api/health" >/dev/null 2>&1; then
  node deploy/hf/record-snapshot.mjs "$OUT/demo/snapshot.json"
  python3 deploy/hf/build-media.py "$OUT" || echo "media: skipped"
elif [ -f "$ASSETS_DIR/demo/snapshot.json" ]; then
  cp -r "$ASSETS_DIR/demo/." "$OUT/demo/"
  [ -d "$ASSETS_DIR/media" ] && cp -r "$ASSETS_DIR/media" "$OUT/"
else
  curl -sf "$SITE/demo/snapshot.json" -o "$OUT/demo/snapshot.json"
fi
# Offline-AI catalog index (deploy/ai/embed-catalog.mjs → $ASSETS_DIR/ai): semantic search in the browser.
if [ -f "$ASSETS_DIR/ai/index.json" ]; then mkdir -p "$OUT/ai" && cp "$ASSETS_DIR/ai/index.json" "$ASSETS_DIR/ai/vecs.bin" "$OUT/ai/"; else echo "ai index: missing (run deploy/ai/embed-catalog.mjs)"; fi
# 🧬 v6 cross-store twins (static shards from the same index; ~1s with numpy).
if [ -f "$ASSETS_DIR/ai/index.json" ]; then python3 deploy/ai/twins.py "$ASSETS_DIR/ai" || echo "twins: skipped"; fi
if [ -d "$ASSETS_DIR/ai/twins" ]; then mkdir -p "$OUT/ai/twins" && cp "$ASSETS_DIR/ai/twins/"*.json "$OUT/ai/twins/"; fi
# Keep a copy for the next deploy.
mkdir -p "$ASSETS_DIR" && cp -r "$OUT/demo" "$ASSETS_DIR/" && { [ -d "$OUT/media" ] && cp -r "$OUT/media" "$ASSETS_DIR/" || true; }
# Run from apps/web so wrangler bundles apps/web/functions (v6 share cards on /p/:id).
( cd apps/web && npx -y wrangler@4 pages deploy "$OUT" --project-name "$PROJECT" --branch "$BRANCH" --commit-dirty=true )
echo "Live at $SITE"
