#!/usr/bin/env bash
# End-to-end check of Apple/Google sign-in (S7) against a real backend.
#
#   bash backend/scripts/social-auth-check/run.sh
#
# Boots a throwaway backend on port 3101 (against the ordinary local database)
# plus the dev IdP on 4599, points the verifier's JWKS/issuer at that IdP, and
# runs checks.sh. Both extra processes are stopped on the way out; the running
# dev server on 3000 is left alone.
#
# It exercises the paths no unit test would cover on its own: account
# creation, linking an identity to an existing e-mail, the four refusals
# (wrong audience, bad signature, expired, unverified e-mail), the auth
# methods on /users/me and deletion with provider re-authentication.
set -uo pipefail
cd "$(dirname "$0")/../.."

PORT=3101
IDP_PORT=4599
export API="http://localhost:$PORT/api"
export IDP="http://localhost:$IDP_PORT"
export IDP_ISS="http://localhost:$IDP_PORT"

cleanup() {
  [ -n "${IDP_PID:-}" ] && kill "$IDP_PID" 2>/dev/null
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null
}
trap cleanup EXIT

node scripts/social-auth-check/dev-idp.js "$IDP_PORT" >/tmp/pati-dev-idp.log 2>&1 &
IDP_PID=$!

# The client ids below are fictional on purpose: what is being checked is that
# the token's audience must match whatever this deployment was configured
# with, not the ids themselves.
#
# The model is pinned off: nothing here needs it, and a blank key wins over
# backend/.env's real one (dotenv never overrides a variable that is set),
# so no request of this harness can reach a paid API (storage-check, 2026-09-14).
APPLE_CLIENT_IDS="com.oguzpancuk.pati,com.oguzpancuk.pati.web" \
APPLE_JWKS_URL="$IDP/apple/keys" APPLE_ISSUER="$IDP_ISS/apple" \
GOOGLE_CLIENT_IDS="ios-client.apps.googleusercontent.com,web-client.apps.googleusercontent.com" \
GOOGLE_WEB_CLIENT_ID="web-client.apps.googleusercontent.com" \
GOOGLE_IOS_CLIENT_ID="ios-client.apps.googleusercontent.com" \
GOOGLE_JWKS_URL="$IDP/google/keys" GOOGLE_ISSUER="$IDP_ISS/google" \
GEMINI_API_KEY= \
PORT=$PORT node src/server.js >/tmp/pati-social-check-api.log 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$IDP_PORT" "$IDP_PID" "dev IdP" "$IDP/google/keys" /tmp/pati-dev-idp.log || exit 1
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" /tmp/pati-social-check-api.log || exit 1

# No model may answer here (see GEMINI_API_KEY above).
grep -q "^ai: NOT CONFIGURED" /tmp/pati-social-check-api.log || {
  echo "the backend booted with a model configured:"; grep '^ai:' /tmp/pati-social-check-api.log; exit 1
}

bash scripts/social-auth-check/checks.sh
