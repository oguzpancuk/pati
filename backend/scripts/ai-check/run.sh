#!/usr/bin/env bash
# End-to-end check of the photo check and photo matching (ADR-0005) against
# a real backend.
#
#   bash backend/scripts/ai-check/run.sh
#
# Boots a throwaway backend on port 3103 (against the ordinary local
# database, migrations applied first) whose Anthropic calls go to the fake
# API on 4600, and runs checks.sh. Both processes are stopped on the way
# out; the dev server on 3000 is left alone.
#
# What the fake cannot prove — that the real model reads a real photo the
# way we hope — is the job of live-sample.js, which needs ANTHROPIC_API_KEY.
set -uo pipefail
cd "$(dirname "$0")/../.."

PORT=3103
FAKE_PORT=4600
export API="http://localhost:$PORT/api"
export FAKE="http://localhost:$FAKE_PORT"
export OUTBOX=/tmp/pati-ai-outbox.jsonl
: > "$OUTBOX"

cleanup() {
  [ -n "${FAKE_PID:-}" ] && kill "$FAKE_PID" 2>/dev/null
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null
}
trap cleanup EXIT

npm run migrate >/tmp/pati-ai-migrate.log 2>&1 || { echo "migrate failed:"; cat /tmp/pati-ai-migrate.log; exit 1; }

node scripts/ai-check/fake-anthropic.js "$FAKE_PORT" >/tmp/pati-fake-anthropic.log 2>&1 &
FAKE_PID=$!

# The key is a placeholder: the SDK refuses to start without one, and the
# fake only checks that a key header is present.
MAIL_OUTBOX_FILE="$OUTBOX" \
AUTH_RATE_LIMIT=200 \
ANTHROPIC_API_KEY="test-key" \
ANTHROPIC_BASE_URL="$FAKE" \
PORT=$PORT node src/server.js >/tmp/pati-ai-check-api.log 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$FAKE_PORT" "$FAKE_PID" "fake Anthropic" "$FAKE/last" /tmp/pati-fake-anthropic.log || exit 1
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" /tmp/pati-ai-check-api.log || exit 1

bash scripts/ai-check/checks.sh
