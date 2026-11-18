#!/usr/bin/env bash
# Build the static demo and push it to a free Hugging Face static Space.
# Needs: a running seeded Safqa API (SAFQA_API, default http://localhost:8787),
# HF_TOKEN with write access, and the `hf` CLI (pip install -U huggingface_hub).
# Usage: SPACE=safqa-eg/safqa deploy/hf/deploy-static.sh
# Optional: VITE_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com enables Google sign-in (docs/google-sign-in.md).
set -euo pipefail
cd "$(dirname "$0")/../.."
SPACE="${SPACE:-safqa-eg/safqa}"
OUT="$(mktemp -d)"
# Public GIS client ID (not a secret). Override by exporting VITE_GOOGLE_CLIENT_ID.
export VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-700154178904-k0hi0kp5v19m775u8t1bt6m6mnfhrghc.apps.googleusercontent.com}"
# Run Vite from apps/web so .env.production is loaded. Avoid the corepack pnpm shim.
( cd apps/web && VITE_DEMO_MODE=static VITE_API_URL= ../../node_modules/.bin/vite build --outDir "$OUT" --emptyOutDir )
mkdir -p "$OUT/demo"
node deploy/hf/record-snapshot.mjs "$OUT/demo/snapshot.json"
# Store gallery images (crawled by packages/db/src/crawl-media.ts) as WebP.
python3 deploy/hf/build-media.py "$OUT" || echo "media: skipped (build-media.py failed)"
cp deploy/hf/README.static-space.md "$OUT/README.md"
hf repos create "$SPACE" --type space --space-sdk static --public --exist-ok
hf upload "$SPACE" "$OUT" . --type space --delete '*' --commit-message "Deploy Safqa static demo"
echo "Live at https://${SPACE/\//-}.static.hf.space"
