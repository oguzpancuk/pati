#!/usr/bin/env bash
# Boots pati for a work session in one command, so no session wastes context
# rediscovering setup: local PostGIS (Docker) → migrations → backend → health
# check. `--ios` additionally builds and launches the app in the iOS simulator
# (slow; needs Xcode). Demo data is deliberately NOT seeded here — the seed
# wipes every table; run `cd backend && npm run seed` on purpose.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_CONTAINER=stray-db
DB_PORT=5433
BACKEND_URL=http://localhost:3000

# 1. Database: reuse the container if it exists, create it otherwise.
if ! docker info >/dev/null 2>&1; then
  echo "init: Docker is not running — start Docker Desktop first." >&2
  exit 1
fi
if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "init: $DB_CONTAINER already running"
elif docker ps -a --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  docker start "$DB_CONTAINER" >/dev/null && echo "init: started $DB_CONTAINER"
else
  docker run -d --name "$DB_CONTAINER" -p "$DB_PORT":5432 \
    -e POSTGRES_USER=stray -e POSTGRES_PASSWORD=stray -e POSTGRES_DB=stray \
    imresamu/postgis:16-3.4 >/dev/null && echo "init: created $DB_CONTAINER"
fi
for _ in $(seq 1 30); do
  docker exec "$DB_CONTAINER" pg_isready -U stray >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$DB_CONTAINER" pg_isready -U stray >/dev/null 2>&1 \
  || { echo "init: database did not become ready" >&2; exit 1; }

# 2. Backend: dependencies, .env, schema, dev server in the background.
[ -d backend/node_modules ] || (cd backend && npm ci)
[ -f backend/.env ] || { cp backend/.env.example backend/.env; echo "init: backend/.env created from .env.example"; }
(cd backend && npm run migrate >/dev/null) && echo "init: migrations applied"
if curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
  echo "init: backend already answering on $BACKEND_URL"
else
  # Detach into its own session: an agent's shell tool waits on (and kills)
  # its whole process group, so a plain `nohup … &` either hangs the tool
  # or dies with it. perl ships on macOS and every CI image.
  (cd backend && perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' -- \
     nohup npm run dev >/tmp/pati-backend.log 2>&1 </dev/null &)
  for _ in $(seq 1 30); do
    curl -sf "$BACKEND_URL/health" >/dev/null 2>&1 && break
    sleep 1
  done
fi
# Smoke check — fail loudly, never report a server that isn't answering.
curl -sf "$BACKEND_URL/health" | grep -q '"status":"ok"' \
  || { echo "init: backend health check FAILED (log: /tmp/pati-backend.log)" >&2; exit 1; }
echo "init: backend healthy at $BACKEND_URL"

# 3. Optional: the app in the iOS simulator.
if [ "${1:-}" = "--ios" ]; then
  [ -d mobile/node_modules ] || (cd mobile && npm ci)
  # Two traps in one line. CocoaPods dies in Ruby's unicode_normalize without
  # a UTF-8 locale ("not appropriate for ASCII-8BIT") before it even reads the
  # Podfile; and `bundle exec` is what pins CocoaPods below 1.15 (mobile/Gemfile),
  # which the RN 0.74 template says breaks the build. A bare `pod` is also
  # frequently not on PATH at all, being a gem binary.
  [ -d mobile/ios/Pods ] || (cd mobile/ios && bundle install && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install)
  (cd mobile && npm run ios)
fi
