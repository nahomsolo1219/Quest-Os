#!/usr/bin/env bash
# Starts a local Postgres 16 for development and tests on port 54329 and creates
# the databases `questmeals`, `questmeals_test`, `questmeals_e2e` (Playwright) and `questmeals_sim` (week simulation).
# Order: Docker (postgres:16-alpine) -> local Postgres binaries (pg_ctl) -> PGlite socket server.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${QM_PG_PORT:-54329}"
mkdir -p .data

ready() { PGPASSWORD=postgres psql -h localhost -p "$PORT" -U postgres -d postgres -tAc "select 1" >/dev/null 2>&1; }
wait_ready() { for _ in $(seq 1 60); do ready && return 0; sleep 1; done; echo "Postgres did not become ready" >&2; return 1; }
create_dbs() {
  for db in questmeals questmeals_test questmeals_e2e questmeals_sim; do
    PGPASSWORD=postgres psql -h localhost -p "$PORT" -U postgres -d postgres -tAc "select 1 from pg_database where datname='$db'" | grep -q 1 \
      || PGPASSWORD=postgres psql -h localhost -p "$PORT" -U postgres -d postgres -c "create database $db" >/dev/null
  done
}

if command -v psql >/dev/null 2>&1 && ready; then
  echo "Postgres already running on port $PORT"; create_dbs; exit 0
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker ps -a --format '{{.Names}}' | grep -q '^questmeals-pg$'; then
    docker start questmeals-pg >/dev/null
  else
    docker run -d --name questmeals-pg -e POSTGRES_PASSWORD=postgres -p "$PORT":5432 postgres:16-alpine >/dev/null
  fi
  echo "Started Postgres in Docker (questmeals-pg) on port $PORT"
  wait_ready; create_dbs; exit 0
fi

PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$PG_BIN" ] && [ -x "$PG_BIN/pg_ctl" ]; then
  DATA_DIR="$PWD/.data/pg"
  RUN_AS=()
  if [ "$(id -u)" = "0" ]; then RUN_AS=(su postgres -s /bin/bash -c); chown -R postgres "$PWD/.data" 2>/dev/null || true; fi
  run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
  if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
    echo postgres > .data/pgpass && [ "$(id -u)" = "0" ] && chown postgres .data/pgpass
    run "$PG_BIN/initdb -D '$DATA_DIR' -U postgres --pwfile='$PWD/.data/pgpass' -A md5" >/dev/null
  fi
  run "$PG_BIN/pg_ctl -D '$DATA_DIR' -o '-p $PORT -k /tmp' -l '$DATA_DIR/log' start" >/dev/null
  echo "Started local Postgres ($PG_BIN) on port $PORT"
  wait_ready; create_dbs; exit 0
fi

echo "No Docker or local Postgres found; starting PGlite socket server on port $PORT (single connection, dev only)"
nohup npx pglite-server --db=.data/pglite --port="$PORT" > .data/pglite.log 2>&1 &
sleep 3
echo "PGlite started. Note: PGlite serves one database; set DATABASE_URL_TEST to the same URL."
