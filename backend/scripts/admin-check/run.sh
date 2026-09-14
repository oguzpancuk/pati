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

# The model is pinned off: nothing here needs it, and a blank key wins over
# backend/.env's real one (dotenv never overrides a variable that is set),
# so no request of this harness can reach a paid API (storage-check, 2026-09-14).
MAIL_OUTBOX_FILE="$OUTBOX" \
AUTH_RATE_LIMIT=200 \
GEMINI_API_KEY= \
PORT=$PORT node src/server.js >/tmp/pati-admin-api.log 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" /tmp/pati-admin-api.log || exit 1

# No model may answer here (see GEMINI_API_KEY above).
grep -q "^ai: NOT CONFIGURED" /tmp/pati-admin-api.log || {
  echo "the backend booted with a model configured:"; grep '^ai:' /tmp/pati-admin-api.log; exit 1
}

bash scripts/admin-check/checks.sh
