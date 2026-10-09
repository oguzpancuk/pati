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
live_in() { psql_db "SELECT count(*) FROM advertisers WHERE '$1' = ANY(COALESCE(slots, ARRAY[slot])) AND active"; }
served_ids() { # jwt query-suffix [slot] [fetches]
  local slot=${3:-$SLOT}
  local n=${4:-$(( $(live_in "$slot") + 1 ))}
  local ids=""
  for _ in $(seq 1 "$n"); do
    get_auth "ads?slot=$slot$2" "$1" >/dev/null
    local id=$(j '.ad.id // empty')
    [ -n "$id" ] || continue
    ids="$ids $id"
    post_auth "ads/$id/impression" "$1" '{}' >/dev/null
  done
  echo "$ids"; }
# The water and food sheets opened in turn, n times each, as a volunteer who
# leaves both at one spot does. Prints the water ids, then "|", then the
# food ids. $3 = "named" reports each impression's slot (this release's
# clients); anything else reports none (the iOS build in the store).
alternate_ids() { # jwt opens named|legacy
  local w="" f="" id
  for _ in $(seq 1 "$2"); do
    for slot in water_popup food_popup; do
      get_auth "ads?slot=$slot" "$1" >/dev/null
      id=$(j '.ad.id // empty')
      [ -n "$id" ] || continue
      if [ "$slot" = water_popup ]; then w="$w $id"; else f="$f $id"; fi
      if [ "$3" = named ]; then post_auth "ads/$id/impression?slot=$slot" "$1" '{}' >/dev/null
      else post_auth "ads/$id/impression" "$1" '{}' >/dev/null; fi
    done
  done
  echo "$w|$f"; }
# "Each open shows the next brand": every n consecutive ids are n different
# ads, and the sequence repeats with period n.
rotates() { # ids n
  echo "$1" | awk -v n="$2" '{ ok = NF >= n
    for (i = 1; i <= NF; i++) { if (i + n <= NF && $i != $(i + n)) ok = 0
      for (k = i + 1; k < i + n && k <= NF; k++) if ($i == $k) ok = 0 }
    print (ok ? "yes" : "no: " $0) }'; }
has() { case " $1 " in *" $2 "*) echo yes ;; *) echo no ;; esac; }
times() { local c=0; for x in $1; do [ "$x" = "$2" ] && c=$((c+1)); done; echo "$c"; }

cleanup() {
  local ads="${TARGETED_ID:-0},${NATIONAL_ID:-0},${MULTI_ID:-0}"
  psql_db "DELETE FROM ad_events WHERE advertiser_id IN ($ads); DELETE FROM advertisers WHERE id IN ($ads)" >/dev/null
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

echo "== one ad in two slots (owner, 2026-10-09)"
code=$(post_auth admin/advertisers "$ADMIN_JWT" "{\"name\":\"İki Yerleşim $STAMP\",\"slots\":[\"water_popup\",\"food_popup\"],\"targetUrl\":\"https://example.com/iki\"}")
check "an ad in food and water -> 201" 201 "$code"
MULTI_ID=$(j .id)
check "…reports both slots, in the fixed order" "food_popup,water_popup" "$(j '.slots | join(",")')"
check "…and its first one as slot" "food_popup" "$(j .slot)"
code=$(post_auth admin/advertisers "$ADMIN_JWT" '{"name":"x","slots":[],"targetUrl":"https://example.com"}')
check "no slot at all -> 400" 400 "$code"
code=$(get_auth "admin/advertisers?slot=water_popup" "$ADMIN_JWT")
check "the admin list's water filter finds it" yes "$(j "[.advertisers[].id] | index($MULTI_ID) != null" | sed 's/true/yes/;s/false/no/')"
ids=$(served_ids "$FAR_JWT" "" food_popup)
check "served under the food sheet" yes "$(has "$ids" "$MULTI_ID")"
# Two full rotations of the water slot, impressions reported the way the
# store build reports them (no slot). Rotation must keep moving through the
# ad whose first slot is food: exactly twice, not stuck on it. The viewer
# has no drop and sends no location, so they are eligible for exactly the
# live nationwide water ads.
n=$(psql_db "SELECT count(*) FROM advertisers WHERE 'water_popup' = ANY(COALESCE(slots, ARRAY[slot]))
  AND active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now())
  AND target_location IS NULL")
ids=$(served_ids "$FAR_JWT" "" water_popup $((2 * n)))
check "rotation keeps moving in its second slot ($n eligible, $((2 * n)) opens)" 2 "$(times "$ids" "$MULTI_ID")"
# Food and water in turn: a shared ad's impression in one slot must not move
# the other's rotation (QA on 15d5836: water showed the same brand on every
# open), whether the client names the slot or not.
nf=$(psql_db "SELECT count(*) FROM advertisers WHERE 'food_popup' = ANY(COALESCE(slots, ARRAY[slot]))
  AND active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now())
  AND target_location IS NULL")
gcd() { local a=$1 b=$2; while [ "$b" -ne 0 ]; do set -- "$b" $(( a % b )); a=$1; b=$2; done; echo "$a"; }
rounds=$(( 2 * n * nf / $(gcd "$n" "$nf") ))  # a whole number of rotations of each
for kind in named legacy; do
  both=$(alternate_ids "$FAR_JWT" "$rounds" "$kind")
  check "food and water in turn, $kind: water shows the next brand each open" \
    yes "$(rotates "${both%|*}" "$n")"
  check "food and water in turn, $kind: so does food" yes "$(rotates "${both#*|}" "$nf")"
done
code=$(patch_auth "admin/advertisers/$MULTI_ID" "$ADMIN_JWT" '{"slots":["vet_health_record"]}')
check "moved to the health-record slot -> 200" 200 "$code"
ids=$(served_ids "$FAR_JWT" "" water_popup)
check "…no longer under the water sheet" no "$(has "$ids" "$MULTI_ID")"
ids=$(served_ids "$FAR_JWT" "" vet_health_record)
check "…served under the health-record dialog" yes "$(has "$ids" "$MULTI_ID")"
code=$(post_auth "ads/$MULTI_ID/impression?slot=vet_health_record" "$FAR_JWT" '{}')
check "an impression may name its slot" 201 "$code"
check "…and is recorded there" vet_health_record \
  "$(psql_db "SELECT slot FROM ad_events WHERE advertiser_id=$MULTI_ID ORDER BY id DESC LIMIT 1")"
code=$(post_auth "ads/$MULTI_ID/click?slot=water_popup" "$FAR_JWT" '{}')
check "…but not a slot the ad is not in -> 400" 400 "$code"

echo
[ "$FAILED" = 0 ] && echo "ad targeting: $PASS checks passed" || echo "ad targeting: FAILED ($PASS passed)"
exit "$FAILED"
