#!/usr/bin/env bash
# End-to-end check of the petshop listings on the map: admin create, edit,
# hide and delete, and the public viewport route the map reads — including
# a listing leaving the map when its visibility window ends.
#
#   bash backend/scripts/petshop-check/run.sh
#
# Boots a throwaway backend on port 3112 (ordinary local database,
# migrations applied first) and runs checks.sh. The process is stopped on
# the way out; the dev server on 3000 is left alone.
set -uo pipefail
cd "$(dirname "$0")/../.."

PORT=3112
export API="http://localhost:$PORT/api"
export OUTBOX=/tmp/pati-petshop-outbox.jsonl
: > "$OUTBOX"

cleanup() { [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null; }
trap cleanup EXIT

npm run migrate >/tmp/pati-petshop-migrate.log 2>&1 || { echo "migrate failed:"; cat /tmp/pati-petshop-migrate.log; exit 1; }

# The model is pinned off: nothing here needs it, and a blank key wins over
# backend/.env's real one (dotenv never overrides a variable that is set).
MAIL_OUTBOX_FILE="$OUTBOX" \
AUTH_RATE_LIMIT=200 \
GEMINI_API_KEY= \
PORT=$PORT node src/server.js >/tmp/pati-petshop-api.log 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" /tmp/pati-petshop-api.log || exit 1

bash scripts/petshop-check/checks.sh
