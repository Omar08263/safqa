#!/usr/bin/env bash
# One command: real store prices -> DB history -> snapshot -> static Space.
#
#   deploy/hf/refresh-live.sh
#
# 1. Makes sure Postgres, Redis and the Safqa API are up (starts them if not).
# 2. Crawls every product page in deploy/live/catalog.json once, politely, with
#    the normal adapters (robots.txt, per-host gap, honest SafqaBot UA). JSON-LD
#    is the only price source. No LLM tokens are spent (LLM_PROVIDER=mock).
# 3. Appends price_points so history builds day by day, recomputes deal scores
#    and fake-discount flags, keeps the last good price for pages that fail and
#    marks them stale.
# 4. Records the snapshot, builds the static site and uploads it to the
#    Hugging Face Space, then prints a short summary.
#
# Idempotent and safe to run from a daily routine. Log: /workspace/safqa-refresh.log
# Env: SPACE (default safqa-eg/safqa), SKIP_DEPLOY=1 to stop after the DB update,
#      HF_ENV (default /home/box/.hf_env, must export HF_TOKEN).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="${SAFQA_REFRESH_LOG:-/workspace/safqa-refresh.log}"
STATUS="${SAFQA_PRICE_STATUS:-/workspace/safqa-refresh-status.json}"
STATE_DIR="${SAFQA_STATE_DIR:-/home/box/.safqa}"
PGDATA="${SAFQA_PGDATA:-$STATE_DIR/pgdata}"
PGBIN_DIR="${SAFQA_PGBIN:-$STATE_DIR/pgsql/bin}"
API="${SAFQA_API:-http://localhost:8787}"
SPACE="${SPACE:-safqa-eg/safqa}"
HF_ENV="${HF_ENV:-/home/box/.hf_env}"
export PATH="$PGBIN_DIR:/home/box/.local/bin:/usr/local/bin:$PATH"
export COREPACK_HOME="${COREPACK_HOME:-/home/box/.cache/node/corepack}"
export SAFQA_PRICE_STATUS="$STATUS"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/refresh.lock"
if ! flock -n 9; then echo "another refresh is running; exiting" >&2; exit 0; fi
exec > >(tee -a "$LOG") 2>&1

T0=$(date +%s)
echo
echo "=== Safqa live refresh $(date '+%Y-%m-%d %H:%M:%S %Z') ==="
cd "$ROOT"

# --- Postgres (persistent data dir under $STATE_DIR, not /tmp) --------------
if [ ! -x "$PGBIN_DIR/pg_ctl" ]; then
  src="$(ls -d /tmp/safqa-tools/pgsql/*/ 2>/dev/null | head -1 || true)"
  tarball="$(ls /tmp/safqa-tools/postgresql-*.tar.gz 2>/dev/null | head -1 || true)"
  mkdir -p "$STATE_DIR/pgsql"
  if [ -n "$src" ]; then cp -a "$src". "$STATE_DIR/pgsql/";
  elif [ -n "$tarball" ]; then tar -xzf "$tarball" -C "$STATE_DIR/pgsql" --strip-components=1;
  else echo "Postgres binaries not found (expected $PGBIN_DIR)"; exit 1; fi
fi
if [ ! -f "$PGDATA/PG_VERSION" ] && [ -f /tmp/safqa-pgdata/PG_VERSION ]; then
  echo "moving Postgres data from /tmp/safqa-pgdata to $PGDATA (persistent)"
  pg_ctl -D /tmp/safqa-pgdata -m fast -w stop >/dev/null 2>&1 || true
  mv /tmp/safqa-pgdata "$PGDATA"
fi
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "initialising a new Postgres cluster in $PGDATA"
  initdb -D "$PGDATA" -U safqa --auth=trust >/dev/null
fi
if ! pg_isready -h 127.0.0.1 -p 5432 -q; then
  echo "starting Postgres"
  rm -f "$PGDATA/postmaster.pid"
  pg_ctl -D "$PGDATA" -l "$STATE_DIR/postgres.log" -o "-k /tmp -p 5432 -c listen_addresses=127.0.0.1" -w start >/dev/null
fi
psql -h 127.0.0.1 -U safqa -d postgres -tAc "select 1 from pg_database where datname='safqa'" | grep -q 1 \
  || createdb -h 127.0.0.1 -U safqa safqa
echo "postgres: up ($PGDATA)"

# --- Redis --------------------------------------------------------------------
redis_up() { (exec 3<>/dev/tcp/127.0.0.1/6379) 2>/dev/null; }
if ! redis_up; then
  echo "starting Redis"
  if ! docker info >/dev/null 2>&1; then
    (sudo -n /usr/local/bin/dockerd --config-file /etc/docker/daemon.json >"$STATE_DIR/dockerd.log" 2>&1 &) || true
    for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
  docker start safqa-redis >/dev/null 2>&1 \
    || docker run -d --name safqa-redis --restart unless-stopped --network host redis:7-alpine >/dev/null
  for _ in $(seq 1 20); do redis_up && break; sleep 1; done
fi
redis_up && echo "redis: up" || echo "redis: DOWN (continuing; API caching off)"

# --- Schema + demo account ------------------------------------------------------
(cd packages/db && npx tsx src/cli.ts migrate) | tail -1
if ! psql -h 127.0.0.1 -U safqa -d safqa -tAc "select 1 from users where email='demo@safqa.app'" | grep -q 1; then
  echo "creating demo account (seed; its fake products are removed by the refresh)"
  (cd packages/db && LLM_PROVIDER=mock npx tsx src/cli.ts seed) | tail -1
fi

# --- API --------------------------------------------------------------------------
api_ok() { curl -fsS -m 5 "$API/api/health" >/dev/null 2>&1; }
if ! api_ok; then
  echo "starting Safqa API on $API"
  (cd apps/api && LLM_PROVIDER=mock SEED_ON_BOOT=false nohup npx tsx src/index.ts >"$STATE_DIR/api.log" 2>&1 &)
  for _ in $(seq 1 60); do api_ok && break; sleep 1; done
fi
api_ok && echo "api: up ($API)" || { echo "API did not start; see $STATE_DIR/api.log"; exit 1; }

# --- Crawl real prices --------------------------------------------------------------
(cd packages/db && npx tsx src/refresh-live.ts "$STATUS")
# Store gallery images, descriptions and specs (re-read weekly per product).
(cd packages/db && npx tsx src/crawl-media.ts) || echo "media crawl failed (keeping previous media.json)"
T1=$(date +%s)

# --- Snapshot + deploy ------------------------------------------------------------------
DEPLOY_LINE="skipped (SKIP_DEPLOY=1)"
if [ "${SKIP_DEPLOY:-0}" != "1" ]; then
  sleep 1
  # shellcheck disable=SC1090
  set +x; source "$HF_ENV"
  DEPLOY_OUT="$(SPACE="$SPACE" SAFQA_API="$API" bash deploy/hf/deploy-static.sh 2>&1)" || { echo "$DEPLOY_OUT" | tail -20; exit 1; }
  echo "$DEPLOY_OUT" | grep -vE '^\s*$' | grep -viE 'token' | tail -6
  COMMIT_URL="$(echo "$DEPLOY_OUT" | grep -oE 'https://huggingface.co/spaces/[^ ]+/commit/[0-9a-f]+' | tail -1 || true)"
  DEPLOY_LINE="${COMMIT_URL:-uploaded} -> https://${SPACE/\//-}.static.hf.space"
fi
# --- Edge API: real-time data for agents, Telegram deal alerts, watchlist alerts --------
EDGE_LINE="$(bash deploy/edge/push-snapshot.sh 2>&1 | tail -1)" || EDGE_LINE="edge push FAILED: $EDGE_LINE"

# --- Summary ------------------------------------------------------------------------------
T2=$(date +%s)
node -e '
const s = require(process.argv[1]);
const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }).format(new Date(s.updatedAt));
console.log("\n--- summary ---");
console.log(`prices as of: ${when} (Africa/Cairo)`);
console.log(`products with a real price: ${s.productsWithPrice}/${s.productsInCatalog} (${s.productsChanged} changed this run)`);
console.log(`offers updated: ${s.offersUpdated}/${s.offersTried}; failed: ${s.offersFailed}`);
for (const [store, n] of Object.entries(s.perStore)) console.log(`  ${store.padEnd(10)} ok ${n.ok}  failed ${n.failed}`);
for (const f of s.failures) console.log(`  FAIL ${f.store} ${f.product}: ${f.reason}${f.stale ? " (kept last price, stale)" : ""}`);
' "$STATUS"
echo "deploy: $DEPLOY_LINE"
echo "$EDGE_LINE"
echo "time: crawl+db $((T1 - T0))s, snapshot+build+deploy $((T2 - T1))s, total $((T2 - T0))s"
