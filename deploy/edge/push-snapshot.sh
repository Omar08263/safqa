#!/usr/bin/env bash
# Push the latest recorded price snapshot to the Safqa edge API (Cloudflare Worker).
# The Worker stores it in KV, re-indexes D1 for the AI agents, detects real price
# drops and fans out Telegram + in-app alerts. Secret: SAFQA_PUSH_SECRET in
# /home/box/.safqa/edge.env (never printed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EDGE_ENV="${EDGE_ENV:-/home/box/.safqa/edge.env}"
SNAP="${1:-}"
if [ -z "$SNAP" ]; then
  # Record a fresh snapshot from the local API when it is up (daily refresh), else use the shipped one.
  SNAP="$(mktemp --suffix=.json)"
  if curl -sf --max-time 5 "${SAFQA_API:-http://localhost:8787}/api/health" >/dev/null 2>&1 && (cd "$ROOT" && node deploy/hf/record-snapshot.mjs "$SNAP" >/dev/null 2>&1); then :; else cp "$ROOT/apps/web/public/demo/snapshot.json" "$SNAP"; fi
fi
[ -f "$EDGE_ENV" ] || { echo "edge: no $EDGE_ENV, skipping push"; exit 0; }
# shellcheck disable=SC1090
set +x; source "$EDGE_ENV"
[ -f "$SNAP" ] || { echo "edge: snapshot $SNAP not found"; exit 1; }
OUT="$(curl -sS --max-time 120 -X POST "$SAFQA_EDGE_URL/api/v2/admin/snapshot" -H "x-safqa-ops: $SAFQA_PUSH_SECRET" -H 'content-type: application/json' --data-binary @"$SNAP")"
echo "edge push: $OUT"
echo "$OUT" | grep -q '"ok":true'
