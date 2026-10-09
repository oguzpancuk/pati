#!/usr/bin/env bash
# End-to-end check of location-targeted ads: an ad with a target point and
# radius reaches only viewers inside that circle, never one outside it and
# never one whose location is unknown; an ad without a target stays
# nationwide.
#
#   bash backend/scripts/ad-targeting-check/run.sh
#
# Boots a throwaway backend on port 3112 against DATABASE_URL (the ordinary
# local database by default, migrations applied first) and runs checks.sh.
# The process is stopped on the way out; the dev server on 3000 is left alone.
set -uo pipefail
cd "$(dirname "$0")/../.."

PORT=3112
export API="http://localhost:$PORT/api"
export OUTBOX=/tmp/pati-ads-outbox.jsonl
: > "$OUTBOX"
# dotenv never overrides a variable that is set, so exporting the value
# backend/.env would give keeps psql and the backend on the same database.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env | tail -1)
fi
export DATABASE_URL=${DATABASE_URL:-postgresql://stray:stray@localhost:5433/stray}

cleanup() { [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null; }
trap cleanup EXIT

npm run migrate >/tmp/pati-ads-migrate.log 2>&1 || { echo "migrate failed:"; cat /tmp/pati-ads-migrate.log; exit 1; }

# The model is pinned off: nothing here needs it, and a blank key wins over
# backend/.env's real one, so no request of this harness can reach a paid API.
MAIL_OUTBOX_FILE="$OUTBOX" \
AUTH_RATE_LIMIT=200 \
GEMINI_API_KEY= \
PORT=$PORT node src/server.js >/tmp/pati-ads-api.log 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" /tmp/pati-ads-api.log || exit 1

grep -q "^ai: NOT CONFIGURED" /tmp/pati-ads-api.log || {
  echo "the backend booted with a model configured:"; grep '^ai:' /tmp/pati-ads-api.log; exit 1
}

bash scripts/ad-targeting-check/checks.sh
