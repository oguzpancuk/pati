#!/usr/bin/env bash
# End-to-end check of e-mail verification on registration (ADR-0004) against
# a real backend.
#
#   bash backend/scripts/email-verification-check/run.sh
#
# Boots a throwaway backend on port 3102 (against the ordinary local
# database) with the dev mail transport writing every message to an outbox
# file, plus the dev IdP on 4598 so the last step can show that a verified
# address is what makes provider sign-in link (ADR-0003). Runs checks.sh;
# both extra processes are stopped on the way out.
set -uo pipefail
cd "$(dirname "$0")/../.."

PORT=3102
IDP_PORT=4598
export API="http://localhost:$PORT/api"
export IDP="http://localhost:$IDP_PORT"
export IDP_ISS="http://localhost:$IDP_PORT"
export OUTBOX=/tmp/pati-ev-outbox.jsonl
: > "$OUTBOX"

cleanup() {
  [ -n "${IDP_PID:-}" ] && kill "$IDP_PID" 2>/dev/null
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null
}
trap cleanup EXIT

node scripts/social-auth-check/dev-idp.js "$IDP_PORT" >/tmp/pati-ev-idp.log 2>&1 &
IDP_PID=$!

# AUTH_RATE_LIMIT: the checks make more credential-shaped requests from one
# IP in a minute than the production brake allows (30 per 15 min); the
# override is honoured outside production only (app.js).
MAIL_OUTBOX_FILE="$OUTBOX" \
AUTH_RATE_LIMIT=200 \
GOOGLE_CLIENT_IDS="web-client.apps.googleusercontent.com" \
GOOGLE_WEB_CLIENT_ID="web-client.apps.googleusercontent.com" \
GOOGLE_JWKS_URL="$IDP/google/keys" GOOGLE_ISSUER="$IDP_ISS/google" \
PORT=$PORT node src/server.js >/tmp/pati-ev-api.log 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$IDP_PORT" "$IDP_PID" "dev IdP" "$IDP/google/keys" /tmp/pati-ev-idp.log || exit 1
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" /tmp/pati-ev-api.log || exit 1

bash scripts/email-verification-check/checks.sh
