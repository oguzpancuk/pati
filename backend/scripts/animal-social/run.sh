#!/usr/bin/env bash
# End-to-end check of the animal profile's social layer (ROADMAP P6,
# track C): photo likes, follow, the care-photo step (match and miss), the
# carers-only refusals, the add-animal door, the inbox, the animal badges
# and the device tokens — against a real backend.
#
#   bash backend/scripts/animal-social/run.sh
#
# Boots a throwaway backend on port 3107 (against the ordinary local
# database, migrations applied first) whose Gemini calls go to the fake API
# on 4607 (scripts/ai-check/fake-gemini.js), and runs checks.sh. Both
# processes are stopped on the way out; the dev server on 3000 is left
# alone. checks.sh registers five throwaway accounts and two throwaway
# animals and removes them again (its header says exactly what it deletes);
# the seeded test1@stray.test is the one standing account it uses.
set -uo pipefail
cd "$(dirname "$0")/../.."

PORT=3107
FAKE_PORT=4607
export API="http://localhost:$PORT/api"
export FAKE="http://localhost:$FAKE_PORT"
export OUTBOX=/tmp/pati-animal-social-outbox.jsonl
export FIXTURES=/tmp/pati-animal-social-fixtures
: > "$OUTBOX"

cleanup() {
  [ -n "${FAKE_PID:-}" ] && kill "$FAKE_PID" 2>/dev/null
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null
}
trap cleanup EXIT

npm run migrate >/tmp/pati-animal-social-migrate.log 2>&1 || { echo "migrate failed:"; cat /tmp/pati-animal-social-migrate.log; exit 1; }

# Two plain JPEGs stand in for the "fresh photos": the fake decides the
# verdicts, so what they show does not matter, only that sharp can read them.
mkdir -p "$FIXTURES"
node -e "
const sharp = require('sharp');
Promise.all([
  sharp({ create: { width: 640, height: 480, channels: 3, background: '#c87d3a' } }).jpeg().toFile('$FIXTURES/a.jpg'),
  sharp({ create: { width: 640, height: 480, channels: 3, background: '#3a7dc8' } }).jpeg().toFile('$FIXTURES/b.jpg'),
])" || exit 1

node scripts/ai-check/fake-gemini.js "$FAKE_PORT" >/tmp/pati-animal-social-fake.log 2>&1 &
FAKE_PID=$!

MAIL_OUTBOX_FILE="$OUTBOX" \
AUTH_RATE_LIMIT=200 \
GEMINI_API_KEY="test-key" \
AI_BASE_URL="$FAKE" \
PORT=$PORT node src/server.js >/tmp/pati-animal-social-api.log 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$FAKE_PORT" "$FAKE_PID" "fake Gemini" "$FAKE/last" /tmp/pati-animal-social-fake.log || exit 1
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" /tmp/pati-animal-social-api.log || exit 1

bash scripts/animal-social/checks.sh
