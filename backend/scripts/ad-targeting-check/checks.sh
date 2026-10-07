#!/usr/bin/env bash
# The checks behind run.sh (see there). Needs API, OUTBOX and DATABASE_URL
# from the environment.
#
# State: registers four throwaway accounts (reklam-*-<stamp>@example.com),
# promotes one to admin directly in the database, creates two ads in the
# water_popup slot and two care drops, and deletes all of it on the way out.
# Ads already in the database stay live throughout; the checks look only at
# whether OUR ads appear in a full rotation, so seeded brands do not matter.
set -uo pipefail
API=${API:-http://localhost:3112/api}
OUTBOX=${OUTBOX:-/tmp/pati-ads-outbox.jsonl}
BODY=/tmp/pati-ads-body.json
STAMP=$(date +%s)
PASS_WORD=parola1234
SLOT=water_popup

# The shop: Kadıköy, a 2 km circle.
SHOP_LAT=40.9903; SHOP_LNG=29.029; RADIUS=2000
# Inside it (about 600 m away) and outside it (Ankara, about 350 km).
NEAR_LAT=40.9955; NEAR_LNG=29.0310
FAR_LAT=39.9208;  FAR_LNG=32.8541

PASS=0; FAILED=0
check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok    $1";
  else FAILED=1; echo "  FAIL  $1 — expected [$2] got [$3]"; echo "        body: $(head -c 300 $BODY)"; fi; }
post() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }
post_auth() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
patch_auth() { curl -s -o "$BODY" -w '%{http_code}' -X PATCH "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
get_auth() { curl -s -o "$BODY" -w '%{http_code}' "$API/$1" -H "Authorization: Bearer $2"; }
j() { jq -r "$1" "$BODY"; }
psql_db() { psql "$DATABASE_URL" -tAc "$1"; }
last_code() { node -e 'const fs=require("fs");const l=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse).filter(m=>m.to===process.argv[2]).pop();const m=(l.subject+" "+l.text).match(/\b(\d{6})\b/);console.log(m?m[1]:"")' "$OUTBOX" "$1"; }
register() { # name email -> prints "token id"
  post auth/register "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"$PASS_WORD\"}" >/dev/null
  local t=$(j .token) id=$(j .user.id)
  post_auth auth/verify-email "$t" "{\"code\":\"$(last_code "$2")\"}" >/dev/null
  echo "$t $id"; }

# Every ad id one viewer is served over a full rotation of the slot. Each
# fetch is followed by its impression, which is what advances rotation, so
# live-ad-count + 1 fetches visit every ad the viewer is eligible for.
# $2 is the query suffix carrying the viewer's location, if any.
served_ids() { # jwt query-suffix
  local n=$(( $(psql_db "SELECT count(*) FROM advertisers WHERE slot='$SLOT' AND active") + 1 ))
  local ids=""
  for _ in $(seq 1 "$n"); do
    get_auth "ads?slot=$SLOT$2" "$1" >/dev/null
    local id=$(j '.ad.id // empty')
    [ -n "$id" ] || continue
    ids="$ids $id"
    post_auth "ads/$id/impression" "$1" '{}' >/dev/null
  done
  echo "$ids"; }
has() { case " $1 " in *" $2 "*) echo yes ;; *) echo no ;; esac; }

cleanup() {
  [ -n "${TARGETED_ID:-}" ] && psql_db "DELETE FROM ad_events WHERE advertiser_id IN (${TARGETED_ID}${NATIONAL_ID:+,$NATIONAL_ID}); DELETE FROM advertisers WHERE id IN (${TARGETED_ID}${NATIONAL_ID:+,$NATIONAL_ID})" >/dev/null
  # The three refused ads, should the validation they probe ever let one through.
  psql_db "DELETE FROM advertisers WHERE name='x' AND target_url='https://example.com'" >/dev/null
  local ids="${ADMIN_ID:-0},${NEAR_ID:-0},${FAR_ID:-0},${NONE_ID:-0}"
  psql_db "DELETE FROM care_actions WHERE user_id IN ($ids); DELETE FROM ad_events WHERE user_id IN ($ids); DELETE FROM users WHERE id IN ($ids)" >/dev/null
}
trap cleanup EXIT

echo "== four accounts: an admin, a viewer near the shop, one far away, one never located"
read ADMIN_JWT ADMIN_ID <<<"$(register "Reklam Yönetici" "reklam-admin-$STAMP@example.com")"
read NEAR_JWT NEAR_ID <<<"$(register "Yakın" "reklam-yakin-$STAMP@example.com")"
read FAR_JWT FAR_ID <<<"$(register "Uzak" "reklam-uzak-$STAMP@example.com")"
read NONE_JWT NONE_ID <<<"$(register "Konumsuz" "reklam-yok-$STAMP@example.com")"
check "the four registered" yes "$([ -n "$ADMIN_ID" ] && [ -n "$NEAR_ID" ] && [ -n "$FAR_ID" ] && [ -n "$NONE_ID" ] && echo yes || echo no)"
psql_db "UPDATE users SET role='admin' WHERE id=$ADMIN_ID" >/dev/null
post auth/login "{\"email\":\"reklam-admin-$STAMP@example.com\",\"password\":\"$PASS_WORD\"}" >/dev/null
ADMIN_JWT=$(j .token)

echo "== the admin creates a targeted ad and a nationwide one"
code=$(post_auth admin/advertisers "$ADMIN_JWT" "{\"name\":\"Kadıköy Petshop $STAMP\",\"slot\":\"$SLOT\",\"targetUrl\":\"https://example.com/petshop\",\"target\":{\"lat\":$SHOP_LAT,\"lng\":$SHOP_LNG,\"radiusMeters\":$RADIUS}}")
check "targeted ad -> 201" 201 "$code"
TARGETED_ID=$(j .id)
check "…and it reports its circle" "$SHOP_LAT $SHOP_LNG $RADIUS" "$(j '"\(.target_lat) \(.target_lng) \(.target_radius_m)"')"
code=$(post_auth admin/advertisers "$ADMIN_JWT" "{\"name\":\"Ulusal Mama $STAMP\",\"slot\":\"$SLOT\",\"targetUrl\":\"https://example.com/mama\"}")
check "nationwide ad -> 201" 201 "$code"
NATIONAL_ID=$(j .id)
check "…with no circle" "null" "$(j .target_radius_m)"

echo "== the admin form's target is validated"
code=$(post_auth admin/advertisers "$ADMIN_JWT" "{\"name\":\"x\",\"slot\":\"$SLOT\",\"targetUrl\":\"https://example.com\",\"target\":{\"lat\":999,\"lng\":29,\"radiusMeters\":2000}}")
check "a latitude of 999 -> 400" 400 "$code"
code=$(post_auth admin/advertisers "$ADMIN_JWT" "{\"name\":\"x\",\"slot\":\"$SLOT\",\"targetUrl\":\"https://example.com\",\"target\":{\"lat\":41,\"lng\":29,\"radiusMeters\":50}}")
check "a 50 m radius -> 400" 400 "$code"
code=$(post_auth admin/advertisers "$ADMIN_JWT" "{\"name\":\"x\",\"slot\":\"$SLOT\",\"targetUrl\":\"https://example.com\",\"target\":{\"radiusMeters\":2000}}")
check "a radius with no point -> 400" 400 "$code"
check "…none of the three was stored" 0 "$(psql_db "SELECT count(*) FROM advertisers WHERE name='x' AND target_url='https://example.com'")"

echo "== the viewer's location from the request"
ids=$(served_ids "$NEAR_JWT" "&lat=$NEAR_LAT&lng=$NEAR_LNG")
check "inside the circle: the targeted ad is served" yes "$(has "$ids" "$TARGETED_ID")"
check "inside the circle: the nationwide ad too" yes "$(has "$ids" "$NATIONAL_ID")"
ids=$(served_ids "$FAR_JWT" "&lat=$FAR_LAT&lng=$FAR_LNG")
check "outside the circle: the targeted ad is NOT served" no "$(has "$ids" "$TARGETED_ID")"
check "outside the circle: the nationwide ad still is" yes "$(has "$ids" "$NATIONAL_ID")"
code=$(get_auth "ads?slot=$SLOT&lat=abc&lng=29" "$NEAR_JWT")
check "a non-numeric latitude -> 400" 400 "$code"
code=$(get_auth "ads?slot=$SLOT&lat=41" "$NEAR_JWT")
check "a latitude without a longitude -> 400" 400 "$code"

echo "== a viewer who sends no location (web today, the iOS build in the store)"
ids=$(served_ids "$NONE_JWT" "")
check "never located: the targeted ad is NOT served" no "$(has "$ids" "$TARGETED_ID")"
check "never located: the nationwide ad is" yes "$(has "$ids" "$NATIONAL_ID")"
# Their last food/water drop places them. Inserted directly: the drop flow
# itself needs a photo token, and this harness is about ads.
psql_db "INSERT INTO care_actions (location, user_id, action_type, photo_url)
         VALUES (ST_SetSRID(ST_MakePoint($NEAR_LNG, $NEAR_LAT), 4326)::geography, $NONE_ID, 'water', '/uploads/x.jpg')" >/dev/null
ids=$(served_ids "$NONE_JWT" "")
check "a recent drop inside the circle: the targeted ad is served" yes "$(has "$ids" "$TARGETED_ID")"
psql_db "UPDATE care_actions SET created_at = now() - interval '31 days' WHERE user_id=$NONE_ID" >/dev/null
ids=$(served_ids "$NONE_JWT" "")
check "the only drop is 31 days old: NOT served" no "$(has "$ids" "$TARGETED_ID")"
psql_db "INSERT INTO care_actions (location, user_id, action_type, photo_url)
         VALUES (ST_SetSRID(ST_MakePoint($FAR_LNG, $FAR_LAT), 4326)::geography, $NONE_ID, 'food', '/uploads/x.jpg')" >/dev/null
ids=$(served_ids "$NONE_JWT" "&lat=$NEAR_LAT&lng=$NEAR_LNG")
check "a location in the request wins over the last drop" yes "$(has "$ids" "$TARGETED_ID")"

echo "== the admin widens the ad back to nationwide"
code=$(patch_auth "admin/advertisers/$TARGETED_ID" "$ADMIN_JWT" '{"target":null}')
check "clearing the target -> 200" 200 "$code"
check "…and the circle is gone" "null null" "$(j '"\(.target_lat) \(.target_radius_m)"')"
ids=$(served_ids "$FAR_JWT" "&lat=$FAR_LAT&lng=$FAR_LNG")
check "now served far away too" yes "$(has "$ids" "$TARGETED_ID")"
code=$(patch_auth "admin/advertisers/$TARGETED_ID" "$ADMIN_JWT" "{\"target\":{\"lat\":$SHOP_LAT,\"lng\":$SHOP_LNG,\"radiusMeters\":$RADIUS}}")
check "re-targeting through an edit -> 200" 200 "$code"
code=$(patch_auth "admin/advertisers/$TARGETED_ID" "$ADMIN_JWT" '{"headline":"Yeni başlık"}')
check "an edit that does not mention the target -> 200" 200 "$code"
check "…keeps the circle" "$RADIUS" "$(j .target_radius_m)"

echo
[ "$FAILED" = 0 ] && echo "ad targeting: $PASS checks passed" || echo "ad targeting: FAILED ($PASS passed)"
exit "$FAILED"
