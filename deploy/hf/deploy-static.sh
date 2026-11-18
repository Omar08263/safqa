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
VITE_DEMO_MODE=static VITE_API_URL= pnpm --filter @safqa/web exec vite build --outDir "$OUT" --emptyOutDir
mkdir -p "$OUT/demo"
node deploy/hf/record-snapshot.mjs "$OUT/demo/snapshot.json"
cp deploy/hf/README.static-space.md "$OUT/README.md"
hf repos create "$SPACE" --type space --space-sdk static --public --exist-ok
hf upload "$SPACE" "$OUT" . --type space --delete '*' --commit-message "Deploy Safqa static demo"
echo "Live at https://${SPACE/\//-}.static.hf.space"
