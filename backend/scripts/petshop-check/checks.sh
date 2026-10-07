#!/usr/bin/env bash
# The checks behind run.sh (see there). Needs API and OUTBOX from the
# environment and the shared local database (docker: stray-db; without the
# container, psql against DATABASE_URL — a cloud thread has no docker).
#
# State: registers two throwaway accounts (petshop-yonetici- and
# petshop-uye-<stamp>@example.com), promotes one to admin directly in the
# database, creates listings named "Test Pet <stamp> …", and deletes all of
# it on the way out. No seeded row is touched.
set -uo pipefail
API=${API:-http://localhost:3112/api}
OUTBOX=${OUTBOX:-/tmp/pati-petshop-outbox.jsonl}
BODY=/tmp/pati-petshop-body.json
STAMP=$(date +%s)
ADMIN_MAIL="petshop-yonetici-$STAMP@example.com"
USER_MAIL="petshop-uye-$STAMP@example.com"
PASS_WORD=parola1234
PREFIX="Test Pet $STAMP"

PASS=0; FAILED=0
check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok    $1";
  else FAILED=1; echo "  FAIL  $1 — expected [$2] got [$3]"; echo "        body: $(head -c 300 $BODY)"; fi; }
post() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }
post_auth() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
patch_auth() { curl -s -o "$BODY" -w '%{http_code}' -X PATCH "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
del_auth() { curl -s -o "$BODY" -w '%{http_code}' -X DELETE "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d '{}'; }
get() { curl -s -o "$BODY" -w '%{http_code}' "$API/$1"; }
get_auth() { curl -s -o "$BODY" -w '%{http_code}' "$API/$1" -H "Authorization: Bearer $2"; }
j() { jq -r "$1" "$BODY"; }
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx stray-db; then
  psql_db() { docker exec stray-db psql -U stray -d stray -tAc "$1"; }
else
  psql_db() { psql "${DATABASE_URL:-postgresql://stray:stray@localhost:5433/stray}" -tAc "$1"; }
fi
last_code() { node -e 'const fs=require("fs");const l=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse).filter(m=>m.to===process.argv[2]).pop();const m=(l.subject+" "+l.text).match(/\b(\d{6})\b/);console.log(m?m[1]:"")' "$OUTBOX" "$1"; }
register() { # name email -> prints "token id"
  post auth/register "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"$PASS_WORD\"}" >/dev/null
  local t=$(j .token) id=$(j .user.id)
  post_auth auth/verify-email "$t" "{\"code\":\"$(last_code "$2")\"}" >/dev/null
  echo "$t $id"; }
iso() { node -e 'console.log(new Date(Date.now() + Number(process.argv[1]) * 86400000).toISOString())' -- "$1"; }
# Is listing $1 in the public answer for the viewport in $BODY?
has() { jq --argjson id "$1" 'any(.[]; .id == $id)' "$BODY"; }

# Kadıköy, and a viewport around Istanbul that holds it.
LAT=40.9875; LNG=29.027
ISTANBUL="minLat=40.8&maxLat=41.3&minLng=28.5&maxLng=29.5"
ANKARA="minLat=39.8&maxLat=40.1&minLng=32.6&maxLng=33.0"
WORLD="minLat=-85&maxLat=85&minLng=-180&maxLng=180"

echo "== two accounts, one of them an admin"
read ADMIN_JWT ADMIN_ID <<<"$(register "Petshop Yönetici" "$ADMIN_MAIL")"
read USER_JWT USER_ID <<<"$(register "Petshop Üye" "$USER_MAIL")"
check "both registered" yes "$([ -n "$ADMIN_ID" ] && [ -n "$USER_ID" ] && echo yes || echo no)"
psql_db "UPDATE users SET role='admin' WHERE id=$ADMIN_ID" >/dev/null
post auth/login "{\"email\":\"$ADMIN_MAIL\",\"password\":\"$PASS_WORD\"}" >/dev/null
ADMIN_JWT=$(j .token)

listing() { # name startsInDays endsInDays -> JSON body
  printf '{"name":"%s","address":"Moda Cd. 12, Kadıköy","phone":"0216 555 12 34","openingHours":"Her gün 09:00–21:00","websiteUrl":"https://example.com/pet","lat":%s,"lng":%s,"startsAt":"%s","endsAt":"%s"}' \
    "$1" "$LAT" "$LNG" "$(iso "$2")" "$(iso "$3")"; }

echo "== only an admin writes listings"
check "no token -> 401" 401 "$(post admin/petshops "$(listing "$PREFIX yetkisiz" -1 30)")"
check "an ordinary user -> 403" 403 "$(post_auth admin/petshops "$USER_JWT" "$(listing "$PREFIX yetkisiz" -1 30)")"
check "a listing without a name -> 400" 400 "$(post_auth admin/petshops "$ADMIN_JWT" "$(listing "" -1 30)")"
check "…in Turkish" "Dükkân adı zorunludur" "$(j .error)"
check "a javascript: link -> 400" 400 \
  "$(post_auth admin/petshops "$ADMIN_JWT" "{\"name\":\"$PREFIX x\",\"lat\":$LAT,\"lng\":$LNG,\"websiteUrl\":\"javascript:alert(1)\"}")"
check "nothing was written by the refusals" 0 \
  "$(psql_db "SELECT count(*) FROM petshops WHERE name LIKE '$PREFIX%'")"

echo "== three listings: inside, after and before their window"
check "live listing -> 201" 201 "$(post_auth admin/petshops "$ADMIN_JWT" "$(listing "$PREFIX açık" -1 30)")"
LIVE=$(j .id)
check "…and the admin list calls it listed" true "$(j .listed)"
check "…stored where it was put" "$LAT $LNG" "$(j '.location.coordinates | "\(.[1]) \(.[0])"')"
check "expired listing -> 201" 201 "$(post_auth admin/petshops "$ADMIN_JWT" "$(listing "$PREFIX bitti" -40 -10)")"
EXPIRED=$(j .id)
check "…not listed" false "$(j .listed)"
check "future listing -> 201" 201 "$(post_auth admin/petshops "$ADMIN_JWT" "$(listing "$PREFIX yakında" 2 32)")"
FUTURE=$(j .id)
check "…not listed" false "$(j .listed)"
check "the admin list has all three" 3 \
  "$(get_auth admin/petshops "$ADMIN_JWT" >/dev/null; jq --arg p "$PREFIX" '[.petshops[] | select(.name | startswith($p))] | length' "$BODY")"

echo "== the public map route"
check "signed out, Istanbul viewport -> 200" 200 "$(get "petshops?$ISTANBUL")"
check "…shows the live listing" true "$(has "$LIVE")"
check "…not the expired one" false "$(has "$EXPIRED")"
check "…not the one whose window has not opened" false "$(has "$FUTURE")"
check "…with the card's fields" "0216 555 12 34|Her gün 09:00–21:00|https://example.com/pet" \
  "$(jq -r --argjson id "$LIVE" '.[] | select(.id == $id) | "\(.phone)|\(.opening_hours)|\(.website_url)"' "$BODY")"
check "…and nothing of the admin's (window, hidden flag)" "false" \
  "$(jq --argjson id "$LIVE" '.[] | select(.id == $id) | has("hidden") or has("ends_at") or has("starts_at")' "$BODY")"
get "petshops?$ANKARA" >/dev/null
check "an Ankara viewport does not show it" false "$(has "$LIVE")"
get "petshops?$WORLD" >/dev/null
check "a whole-world viewport does" true "$(has "$LIVE")"
check "a viewport without corners -> 400" 400 "$(get "petshops?minLat=40")"
check "a junk corner -> 400" 400 "$(get "petshops?minLat=abc&maxLat=41&minLng=28&maxLng=29")"

echo "== hide and show"
check "hide -> 200" 200 "$(patch_auth "admin/petshops/$LIVE" "$ADMIN_JWT" '{"hidden":true}')"
check "…the admin list says not listed" false "$(j .listed)"
check "…the other fields survive a partial edit" "0216 555 12 34" "$(j .phone)"
get "petshops?$ISTANBUL" >/dev/null
check "…and the map drops it" false "$(has "$LIVE")"
check "show again -> 200" 200 "$(patch_auth "admin/petshops/$LIVE" "$ADMIN_JWT" '{"hidden":false}')"
get "petshops?$ISTANBUL" >/dev/null
check "…and it is back" true "$(has "$LIVE")"

echo "== edits are validated as a whole"
check "an end before the start -> 400" 400 \
  "$(patch_auth "admin/petshops/$LIVE" "$ADMIN_JWT" "{\"endsAt\":\"$(iso -5)\"}")"
check "…in Turkish" "Bitiş tarihi başlangıçtan sonra olmalıdır" "$(j .error)"
check "clearing the phone -> 200" 200 "$(patch_auth "admin/petshops/$LIVE" "$ADMIN_JWT" '{"phone":null}')"
check "…cleared" null "$(j .phone)"
check "moving it to Ankara -> 200" 200 "$(patch_auth "admin/petshops/$LIVE" "$ADMIN_JWT" '{"lat":39.92,"lng":32.85}')"
get "petshops?$ANKARA" >/dev/null
check "…the Ankara viewport shows it now" true "$(has "$LIVE")"
check "an unknown id -> 404" 404 "$(patch_auth "admin/petshops/999999999" "$ADMIN_JWT" '{"hidden":true}')"
check "a junk id -> 404" 404 "$(patch_auth "admin/petshops/abc" "$ADMIN_JWT" '{"hidden":true}')"

echo "== the free month runs out"
# The window is what ends a listing, not a person: the end moved into the
# past, as the clock would move it, and the map stops showing the shop
# while the row stays for the admin to extend.
psql_db "UPDATE petshops SET starts_at = now() - interval '31 days', ends_at = now() - interval '1 minute' WHERE id=$LIVE" >/dev/null
get "petshops?$WORLD" >/dev/null
check "an ended window leaves the map" false "$(has "$LIVE")"
get_auth admin/petshops "$ADMIN_JWT" >/dev/null
check "…the row is still in the admin list, not listed" false \
  "$(jq --argjson id "$LIVE" '.petshops[] | select(.id == $id) | .listed' "$BODY")"
check "extending it -> 200" 200 "$(patch_auth "admin/petshops/$LIVE" "$ADMIN_JWT" "{\"endsAt\":\"$(iso 30)\"}")"
get "petshops?$WORLD" >/dev/null
check "…and it is on the map again" true "$(has "$LIVE")"

echo "== delete"
check "an ordinary user cannot -> 403" 403 "$(del_auth "admin/petshops/$FUTURE" "$USER_JWT")"
check "the admin can -> 200" 200 "$(del_auth "admin/petshops/$FUTURE" "$ADMIN_JWT")"
check "…gone" 0 "$(psql_db "SELECT count(*) FROM petshops WHERE id=$FUTURE")"
check "a second delete -> 404" 404 "$(del_auth "admin/petshops/$FUTURE" "$ADMIN_JWT")"

echo "== it is written down"
check "create, update and delete are in the audit log" "petshop.create petshop.delete petshop.update" \
  "$(psql_db "SELECT string_agg(DISTINCT action, ' ' ORDER BY action) FROM audit_log WHERE target_type='petshop' AND actor_id=$ADMIN_ID")"

echo "== cleanup"
psql_db "DELETE FROM petshops WHERE name LIKE '$PREFIX%'" >/dev/null
psql_db "DELETE FROM audit_log WHERE actor_id IN ($ADMIN_ID, $USER_ID)" >/dev/null
psql_db "DELETE FROM users WHERE id IN ($ADMIN_ID, $USER_ID)" >/dev/null
check "the throwaway listings and accounts are gone" "0 0" \
  "$(psql_db "SELECT count(*) FROM petshops WHERE name LIKE '$PREFIX%'") $(psql_db "SELECT count(*) FROM users WHERE id IN ($ADMIN_ID, $USER_ID)")"

echo
if [ "$FAILED" = 0 ]; then echo "passed $PASS checks; failed=0"; else echo "passed $PASS checks; SOME FAILED"; fi
exit "$FAILED"
