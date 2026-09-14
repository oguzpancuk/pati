#!/usr/bin/env bash
# End-to-end check of messaging (ROADMAP P6 item 4) against a real backend.
#
#   bash backend/scripts/messaging-check/run.sh
#
# Boots a throwaway backend on port 3104 (ordinary local database,
# migrations applied first, mail in dev mode so verification codes land in
# the log, auth rate limit raised for the registrations) and runs
# checks.sh. The dev server on 3000 is left alone. A fresh process also
# resets the in-memory message limiters, which the harness exhausts after
# a few runs against a long-lived backend.
set -uo pipefail
cd "$(dirname "$0")/../.."

PORT=3104
export API="http://localhost:$PORT/api"
export LOG=/tmp/pati-messaging-api.log

cleanup() { [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null; }
trap cleanup EXIT

npm run migrate >/tmp/pati-messaging-migrate.log 2>&1 || { echo "migrate failed:"; cat /tmp/pati-messaging-migrate.log; exit 1; }

# The model is pinned off: nothing here needs it, and a blank key wins over
# backend/.env's real one (dotenv never overrides a variable that is set),
# so no request of this harness can reach a paid API (storage-check, 2026-09-14).
AUTH_RATE_LIMIT=200 \
RESEND_API_KEY= \
GEMINI_API_KEY= \
PORT=$PORT node src/server.js >"$LOG" 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" "$LOG" || exit 1

# No model may answer here (see GEMINI_API_KEY above).
grep -q "^ai: NOT CONFIGURED" "$LOG" || {
  echo "the backend booted with a model configured:"; grep '^ai:' "$LOG"; exit 1
}

bash scripts/messaging-check/checks.sh
