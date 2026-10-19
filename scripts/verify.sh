#!/usr/bin/env bash
# The single gate: exits non-zero on the first failure.
set -euo pipefail
cd "$(dirname "$0")/.."
step() { echo; echo "==> $*"; }
step "typecheck";        npm run typecheck
step "lint";             npm run lint
step "unit tests";       npm test
step "database tests";   bash scripts/db-start.sh >/dev/null; npm run test:db
step "production build"; npm run build
step "bundle budget";    npx tsx scripts/check-bundle-size.ts
step "no secrets in browser bundles"; npx tsx scripts/check-bundle-secrets.ts
step "e2e tests";        E2E_SKIP_BUILD=1 npm run test:e2e
step "week simulation";  npm run simulate:week
echo; echo "verify: all checks passed"
