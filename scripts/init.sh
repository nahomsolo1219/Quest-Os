#!/usr/bin/env bash
# One-shot local setup: install, start Postgres, migrate + seed (with demo data), start the dev server.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || cp .env.example .env.local
npm ci
bash scripts/db-start.sh
npm run db:reset
if [ "${QM_NO_DEV:-}" = "1" ]; then echo "Setup complete (dev server not started)."; exit 0; fi
exec npm run dev
