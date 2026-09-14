#!/usr/bin/env bash
# End-to-end check of the photo storage driver (src/config/storage.js)
# against a real backend pointed at a fake S3-compatible bucket.
#
#   bash backend/scripts/storage-check/run.sh
#
# Boots a throwaway backend on port 3109 (ordinary local database,
# migrations applied first) configured with S3_* pointing at the fake
# bucket on 4611, and runs checks.sh. Both processes are stopped on the way
# out; the dev server on 3000 is left alone. What the fake cannot prove —
# that Cloudflare R2 accepts the same requests — is a matter of the
# credentials and the boot log (docs/DEPLOYMENT.md).
set -uo pipefail
cd "$(dirname "$0")/../.."

PORT=3109
BUCKET_PORT=4611
export API="http://localhost:$PORT/api"
export BUCKET="http://localhost:$BUCKET_PORT"
export BUCKET_NAME=pati-storage-check
export OUTBOX=/tmp/pati-storage-outbox.jsonl
export UPLOADS=/tmp/pati-storage-uploads
: > "$OUTBOX"
rm -rf "$UPLOADS"; mkdir -p "$UPLOADS"

cleanup() {
  [ -n "${BUCKET_PID:-}" ] && kill "$BUCKET_PID" 2>/dev/null
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null
}
trap cleanup EXIT

npm run migrate >/tmp/pati-storage-migrate.log 2>&1 || { echo "migrate failed:"; cat /tmp/pati-storage-migrate.log; exit 1; }

node scripts/storage-check/fake-bucket.js "$BUCKET_PORT" "$BUCKET_NAME" >/tmp/pati-fake-bucket.log 2>&1 &
BUCKET_PID=$!

# A throwaway uploads directory, so the assertions can count files and
# clear the cache without touching the dev server's own photos. The model
# is pinned off: a blank key wins over backend/.env (dotenv never overrides
# a variable that is set), so the carer care-photo case screens nothing
# instead of sending test images to a paid API — a first run of that case
# without this line did exactly that (2026-09-14).
MAIL_OUTBOX_FILE="$OUTBOX" \
AUTH_RATE_LIMIT=200 \
GEMINI_API_KEY= \
UPLOADS_DIR="$UPLOADS" \
S3_ENDPOINT="$BUCKET" \
S3_BUCKET="$BUCKET_NAME" \
S3_ACCESS_KEY_ID=test-key \
S3_SECRET_ACCESS_KEY=test-secret \
PORT=$PORT node src/server.js >/tmp/pati-storage-api.log 2>&1 &
API_PID=$!

source scripts/check-lib.sh
wait_for_ours "$BUCKET_PORT" "$BUCKET_PID" "fake bucket" "$BUCKET/__keys" /tmp/pati-fake-bucket.log || exit 1
wait_for_ours "$PORT" "$API_PID" "backend" "http://localhost:$PORT/health" /tmp/pati-storage-api.log || exit 1

# No model may answer here (see GEMINI_API_KEY above).
grep -q "^ai: NOT CONFIGURED" /tmp/pati-storage-api.log || {
  echo "the backend booted with a model configured:"; grep '^ai:' /tmp/pati-storage-api.log; exit 1
}
# The driver must have announced itself; a disk-mode boot would make every
# assertion below vacuous.
grep -q "^photos: s3 " /tmp/pati-storage-api.log || {
  echo "the backend did not boot with the s3 driver:"; grep '^photos:' /tmp/pati-storage-api.log; exit 1
}

bash scripts/storage-check/checks.sh
