#!/usr/bin/env bash
# Boot local Postgres + Redis, then the Safqa API (which also serves the web app).
set -euo pipefail

DATA="${PGDATA:-/tmp/pgdata}"
RUN_DIR=/tmp/pgrun
mkdir -p "$RUN_DIR"

if [ ! -s "$DATA/PG_VERSION" ]; then
  echo "[safqa] initdb"
  initdb -D "$DATA" -U safqa --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/tmp/initdb.log 2>&1 \
    || { cat /tmp/initdb.log; exit 1; }
fi
pg_ctl -D "$DATA" -o "-c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=$RUN_DIR" \
  -l /tmp/postgres.log -w start
createdb -h 127.0.0.1 -U safqa safqa 2>/dev/null || true
echo "[safqa] postgres up"

redis-server --bind 127.0.0.1 --port 6379 --save "" --appendonly no --daemonize yes \
  --dir /tmp --logfile /tmp/redis.log
echo "[safqa] redis up"

export DATABASE_URL="${DATABASE_URL:-postgres://safqa@127.0.0.1:5432/safqa}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
if [ -z "${AUTH_SECRET:-}" ]; then
  AUTH_SECRET="$(openssl rand -hex 32)"
  export AUTH_SECRET
  echo "[safqa] generated ephemeral AUTH_SECRET (sessions reset on restart)"
fi
if [ -n "${SPACE_HOST:-}" ]; then
  export WEB_ORIGIN="${WEB_ORIGIN:-https://$SPACE_HOST}"
  export API_PUBLIC_URL="${API_PUBLIC_URL:-https://$SPACE_HOST}"
fi

cd /app/apps/api
exec /app/node_modules/.bin/tsx src/index.ts
