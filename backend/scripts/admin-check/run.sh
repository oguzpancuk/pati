#!/usr/bin/env bash
# End-to-end check of the admin panel's account deletion — the tool support
# uses to free an address somebody registered and abandoned.
#
#   bash backend/scripts/admin-check/run.sh
#
# Boots a throwaway backend on port 3111 (ordinary local database,
# migrations applied first) and runs checks.sh. The process is stopped on
# the way out; the dev server on 3000 is left alone.
set -uo pipefail
cd "$(dirname "$0")/../.."

PORT=3111
export API="http://localhost:$PORT/api"
export OUTBOX=/tmp/pati-admin-outbox.jsonl
: > "$OUTBOX"

cleanup() { [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null; }
trap cleanup EXIT

npm run migrate >/tmp/pati-admin-migrate.log 2>&1 || { echo "migrate failed:"; cat /tmp/pati-admin-migrate.log; exit 1; }

MAIL_OUTBOX_FILE="$OUTBOX" \
AUTH_RATE_LIMIT=200 \
PORT=$PORT node src/server.js >/tmp/pati-admin-api.log 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" /tmp/pati-admin-api.log || exit 1

bash scripts/admin-check/checks.sh
