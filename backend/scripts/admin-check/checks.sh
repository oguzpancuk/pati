#!/usr/bin/env bash
# The checks behind run.sh (see there). Needs API and OUTBOX from the
# environment and the shared local database (docker: stray-db).
#
# State: registers three throwaway accounts (yonetici-, kurban- and
# ikinci-<stamp>@example.com), promotes one to admin directly in the
# database, and deletes all three rows on the way out. No seeded row is
# touched.
set -uo pipefail
API=${API:-http://localhost:3111/api}
OUTBOX=${OUTBOX:-/tmp/pati-admin-outbox.jsonl}
BODY=/tmp/pati-admin-body.json
STAMP=$(date +%s)
ADMIN_MAIL="yonetici-$STAMP@example.com"
VICTIM_MAIL="kurban-$STAMP@example.com"
OTHER_MAIL="ikinci-$STAMP@example.com"
PASS_WORD=parola1234

PASS=0; FAILED=0
check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok    $1";
  else FAILED=1; echo "  FAIL  $1 — expected [$2] got [$3]"; echo "        body: $(head -c 300 $BODY)"; fi; }
post() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }
post_auth() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
del_auth() { curl -s -o "$BODY" -w '%{http_code}' -X DELETE "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d '{}'; }
get_auth() { curl -s -o "$BODY" -w '%{http_code}' "$API/$1" -H "Authorization: Bearer $2"; }
j() { jq -r "$1" "$BODY"; }
psql_db() { docker exec stray-db psql -U stray -d stray -tAc "$1"; }
last_code() { node -e 'const fs=require("fs");const l=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse).filter(m=>m.to===process.argv[2]).pop();const m=(l.subject+" "+l.text).match(/\b(\d{6})\b/);console.log(m?m[1]:"")' "$OUTBOX" "$1"; }
register() { # name email -> prints "token id"
  post auth/register "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"$PASS_WORD\"}" >/dev/null
  local t=$(j .token) id=$(j .user.id)
  post_auth auth/verify-email "$t" "{\"code\":\"$(last_code "$2")\"}" >/dev/null
  echo "$t $id"; }

echo "== three accounts, one of them an admin"
read ADMIN_JWT ADMIN_ID <<<"$(register "Yönetici" "$ADMIN_MAIL")"
read VICTIM_JWT VICTIM_ID <<<"$(register "Kurban" "$VICTIM_MAIL")"
read OTHER_JWT OTHER_ID <<<"$(register "İkinci" "$OTHER_MAIL")"
check "the three registered" yes "$([ -n "$ADMIN_ID" ] && [ -n "$VICTIM_ID" ] && [ -n "$OTHER_ID" ] && echo yes || echo no)"
psql_db "UPDATE users SET role='admin' WHERE id=$ADMIN_ID" >/dev/null
# The role rides in the JWT, so the promotion needs a fresh login.
post auth/login "{\"email\":\"$ADMIN_MAIL\",\"password\":\"$PASS_WORD\"}" >/dev/null
ADMIN_JWT=$(j .token)

echo "== only an admin may delete, and never themselves"
code=$(del_auth "admin/users/$VICTIM_ID" "$VICTIM_JWT")
check "an ordinary user -> 403" 403 "$code"
code=$(del_auth "admin/users/$ADMIN_ID" "$ADMIN_JWT")
check "the admin's own account -> 400" 400 "$code"
psql_db "UPDATE users SET role='admin' WHERE id=$OTHER_ID" >/dev/null
code=$(del_auth "admin/users/$OTHER_ID" "$ADMIN_JWT")
check "another admin -> 400" 400 "$code"
check "…and says to demote first" yes "$(grep -q "yetkisini kaldırın" "$BODY" && echo yes || echo no)"
psql_db "UPDATE users SET role='user' WHERE id=$OTHER_ID" >/dev/null
code=$(del_auth "admin/users/999999999" "$ADMIN_JWT")
check "an unknown id -> 404" 404 "$code"

# A push token first, so the assertion after the deletion is not vacuous.
code=$(post_auth notifications/device-tokens "$VICTIM_JWT" '{"platform":"ios","token":"gece-kosusu-token"}')
check "the victim registered a device token" 201 "$code"

echo "== the deletion itself"
code=$(del_auth "admin/users/$VICTIM_ID" "$ADMIN_JWT")
check "delete -> 200" 200 "$code"
check "the row survives" 1 "$(psql_db "SELECT count(*) FROM users WHERE id=$VICTIM_ID")"
check "…anonymized" "Silinmiş Üye" "$(psql_db "SELECT name FROM users WHERE id=$VICTIM_ID")"
check "…suspended, with the admin's reason" "Hesap yönetici tarafından silindi" \
  "$(psql_db "SELECT suspended_reason FROM users WHERE id=$VICTIM_ID")"
check "…not verified any more" f "$(psql_db "SELECT email_verified FROM users WHERE id=$VICTIM_ID")"
check "…and its old token is refused" 403 "$(get_auth users/me "$VICTIM_JWT")"

echo "== the device's push token goes with the account"
check "no device token survives" 0 \
  "$(psql_db "SELECT count(*) FROM device_tokens WHERE user_id=$VICTIM_ID")"

echo "== the address is free again — the point of the whole thing"
code=$(post auth/register "{\"name\":\"Yeni Sahip\",\"email\":\"$VICTIM_MAIL\",\"password\":\"$PASS_WORD\"}")
check "re-registering the freed address -> 201" 201 "$code"
NEW_ID=$(j .user.id)
check "…as a NEW account, not the tombstone" no "$([ "$NEW_ID" = "$VICTIM_ID" ] && echo yes || echo no)"

echo "== a second deletion has nothing left to free"
code=$(del_auth "admin/users/$VICTIM_ID" "$ADMIN_JWT")
check "already deleted -> 409" 409 "$code"

echo "== it is written down"
check "the audit log records it" 1 \
  "$(psql_db "SELECT count(*) FROM audit_log WHERE action='user.delete' AND target_id=$VICTIM_ID AND actor_id=$ADMIN_ID")"
check "…without the freed address in it" 0 \
  "$(psql_db "SELECT count(*) FROM audit_log WHERE action='user.delete' AND target_id=$VICTIM_ID AND details::text LIKE '%$VICTIM_MAIL%'")"

echo "== cleanup"
psql_db "DELETE FROM users WHERE id IN ($ADMIN_ID, $VICTIM_ID, $OTHER_ID, ${NEW_ID:-0})" >/dev/null
check "the throwaway accounts are gone" 0 \
  "$(psql_db "SELECT count(*) FROM users WHERE id IN ($ADMIN_ID, $VICTIM_ID, $OTHER_ID, ${NEW_ID:-0})")"

echo
if [ "$FAILED" = 0 ]; then echo "passed $PASS checks; failed=0"; else echo "passed $PASS checks; SOME FAILED"; fi
exit "$FAILED"
