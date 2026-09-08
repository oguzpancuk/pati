#!/usr/bin/env bash
# The checks behind run.sh (see there). Needs API, FAKE, OUTBOX, FIXTURES
# from the environment and the shared local database (docker: stray-db).
set -uo pipefail
API=${API:-http://localhost:3107/api}
FAKE=${FAKE:-http://localhost:4607}
OUTBOX=${OUTBOX:-/tmp/pati-animal-social-outbox.jsonl}
FIXTURES=${FIXTURES:-/tmp/pati-animal-social-fixtures}
ANIMAL=${ANIMAL:-11992}
BODY=/tmp/pati-animal-social-body.json
psql_db() { docker exec stray-db psql -U stray -d stray -tAc "$1"; }

PASS=0; FAILED=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok    $1"; else FAILED=1; echo "  FAIL  $1 — expected [$2] got [$3]"; echo "        body: $(head -c 300 $BODY)"; fi; }
post() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
del() { local b="${3:-}"; [ -z "$b" ] && b='{}'; curl -s -o "$BODY" -w '%{http_code}' -X DELETE "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$b"; }
get() { curl -s -o "$BODY" -w '%{http_code}' "$API/$1" -H "Authorization: Bearer $2"; }
control() { curl -s -o /dev/null -X POST "$FAKE/control" -H 'Content-Type: application/json' -d "$1"; }
j() { jq -r "$1" "$BODY"; }
care_photos() { # animal token nphotos
  if [ "$3" = 1 ]; then curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/animals/$1/care-photos" -H "Authorization: Bearer $2" -F "photos=@$FIXTURES/a.jpg;type=image/jpeg";
  else curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/animals/$1/care-photos" -H "Authorization: Bearer $2" -F "photos=@$FIXTURES/a.jpg;type=image/jpeg" -F "photos=@$FIXTURES/b.jpg;type=image/jpeg"; fi; }
last_code() { # e-mail → the 6-digit code from the outbox
  node -e 'const fs=require("fs");const l=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse).filter(m=>m.to===process.argv[2]).pop();const m=(l.subject+" "+l.text).match(/\b(\d{6})\b/);console.log(m?m[1]:"")' "$OUTBOX" "$1"; }
register() { # name email → token, and prints "token id"
  curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"parola1234\"}" >/dev/null
  local t=$(j .token) id=$(j .user.id)
  post auth/verify-email "$t" "{\"code\":\"$(last_code "$2")\"}" >/dev/null
  echo "$t $id"; }

echo "== accounts"
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' -d '{"email":"test1@stray.test","password":"password123"}')
check "login test1 -> 200" 200 "$code"; A=$(j .token); A_ID=$(j .user.id)
STAMP=$(date +%s)
read -r B B_ID < <(register "Takipçi Test" "takipci-$STAMP@stray.test")
read -r C C_ID < <(register "Bakıcı Test" "bakici-$STAMP@stray.test")
code=$(get users/me "$B"); check "B registered and verified" "200 false" "$code $(j .email_verification_pending)"
code=$(get users/me "$C"); check "C registered and verified" "200 false" "$code $(j .email_verification_pending)"

read -r LAT LNG BREED COLOR < <(psql_db "SELECT ST_Y(location::geometry), ST_X(location::geometry), coalesce(breed,''), coalesce(color,'') FROM animals WHERE id=$ANIMAL" | tr '|' ' ')
OWNER=$(psql_db "SELECT created_by FROM animals WHERE id=$ANIMAL")
# A clean slate for the three accounts on this animal; photos of earlier
# runs go too (their files are removed by the cleanup below), so the seeded
# gallery has no file on disk and the first care step passes unchecked.
psql_db "DELETE FROM user_animal_care WHERE animal_id=$ANIMAL AND user_id IN ($A_ID,$B_ID,$C_ID); DELETE FROM animal_followers WHERE animal_id=$ANIMAL; DELETE FROM animal_photo_likes WHERE photo_id IN (SELECT id FROM animal_photos WHERE animal_id=$ANIMAL); DELETE FROM animal_badges WHERE animal_id=$ANIMAL; DELETE FROM animal_match_attempts WHERE animal_id=$ANIMAL; DELETE FROM notifications WHERE animal_id=$ANIMAL; DELETE FROM animal_photos WHERE animal_id=$ANIMAL AND uploaded_by <> $OWNER;" >/dev/null
# The likes need a photo to like; a database whose demo photos were pruned
# gets one owner row without a file (the first care step must find no
# gallery file on disk anyway).
if [ "$(psql_db "SELECT count(*) FROM animal_photos WHERE animal_id=$ANIMAL")" = 0 ]; then
  psql_db "INSERT INTO animal_photos (animal_id, url, uploaded_by) VALUES ($ANIMAL, 'http://localhost:3107/uploads/seed-missing-$STAMP.jpg', $OWNER)" >/dev/null
  echo "        (seeded one file-less photo row for the likes)"
fi

echo "== profile read, follow"
code=$(get "animals/$ANIMAL" "$B"); check "B GET animal -> 200" 200 "$code"
check "B is neither carer nor follower" "false false" "$(j '.isCarer') $(j '.isFollowing')"
check "photos carry like fields" "0 false" "$(j '.photos[0].like_count') $(j '.photos[0].liked_by_me')"
check "profile carries badges array" "true" "$(j '.badges | type == "array"')"
PHOTO=$(j '.photos[0].id')
code=$(post "animals/$ANIMAL/follow" "$B" '{}'); check "B follow -> 201" 201 "$code"
check "following true, count 1" "true 1" "$(j .following) $(j .followerCount)"
code=$(get "animals/$ANIMAL" "$B"); check "GET shows isFollowing" "true 1" "$(j .isFollowing) $(j .followerCount)"
code=$(del "animals/$ANIMAL/follow" "$B"); check "B unfollow -> 200" 200 "$code"; check "following false, count 0" "false 0" "$(j .following) $(j .followerCount)"
code=$(post "animals/$ANIMAL/follow" "$B" '{}'); check "B follows again" 201 "$code"

echo "== likes"
code=$(post "animals/$ANIMAL/photos/$PHOTO/like" "$B" '{}'); check "B like -> 201" 201 "$code"; check "liked, count 1" "true 1" "$(j .liked) $(j .likeCount)"
code=$(post "animals/$ANIMAL/photos/$PHOTO/like" "$B" '{}'); check "second like is idempotent" "true 1" "$(j .liked) $(j .likeCount)"
code=$(get "animals/$ANIMAL" "$B"); check "GET shows liked_by_me" "true 1" "$(j '.photos[0].liked_by_me') $(j '.photos[0].like_count')"
code=$(del "animals/$ANIMAL/photos/$PHOTO/like" "$B"); check "unlike -> 200, count 0" "200 false 0" "$code $(j .liked) $(j .likeCount)"
code=$(post "animals/$ANIMAL/photos/999999999/like" "$B" '{}'); check "like on a foreign photo id -> 404" 404 "$code"
code=$(post "animals/$ANIMAL/photos/$PHOTO/like" "$B" '{}'); check "B likes again (badge source)" 201 "$code"

echo "== carers-only refusals for a follower"
code=$(post "animals/$ANIMAL/comments" "$B" '{"body":"selam"}'); check "B comment -> 403 carersOnly" "403 carersOnly" "$code $(j .code)"
code=$(post "animals/$ANIMAL/sightings" "$B" "{\"lat\":$LAT,\"lng\":$LNG}"); check "B sighting -> 403 carersOnly" "403 carersOnly" "$code $(j .code)"
code=$(post "animals/$ANIMAL/health-records" "$B" '{"recordType":"illness","description":"Göz akıntısı"}'); check "B health record -> 403" "403 carersOnly" "$code $(j .code)"
code=$(post "animals/$ANIMAL/vaccinations" "$B" '{"vaccineType":"Kuduz"}'); check "B vaccination -> 403" "403 carersOnly" "$code $(j .code)"
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/animals/$ANIMAL/photos" -H "Authorization: Bearer $B" -F "photo=@$FIXTURES/a.jpg;type=image/jpeg"); check "B photo upload -> 403" "403 carersOnly" "$code $(j .code)"

echo "== the field-only match never opens the door"
Q="lat=$LAT&lng=$LNG&species=cat&breed=$(jq -rn --arg b "$BREED" '$b|@uri')&color=$(jq -rn --arg c "$COLOR" '$c|@uri')"
code=$(get "animals/match?$Q" "$B"); check "B field match -> 200" 200 "$code"
check "animal is a high candidate by fields" "high" "$(jq -r --argjson id $ANIMAL '.candidates[] | select(.id==$id) | .similarity' $BODY)"
check "no hit logged" "0" "$(psql_db "SELECT count(*) FROM animal_match_attempts WHERE animal_id=$ANIMAL AND user_id=$B_ID")"
code=$(post "animals/$ANIMAL/sightings" "$B" "{\"lat\":$LAT,\"lng\":$LNG}"); check "B sighting still -> 403" "403 carersOnly" "$code $(j .code)"

echo "== care-photo step"
code=$(care_photos $ANIMAL "$B" 1); check "one photo -> 400" "400 carePhotosRequired" "$code $(j .code)"
code=$(get "animals/$ANIMAL" "$A"); BEFORE=$(j '.photos | length')
control '{"mode":"match","verdicts":["different","different","different","different","different","different","different","different"]}'
code=$(care_photos $ANIMAL "$A" 2); check "A: no gallery file on disk -> accepted unchecked (fail open)" "201 true false 2" "$code $(j .matched) $(j .photoChecked) $(j '.photos | length')"
check "answer carries the animalBadges list; cared bronze is on record" "true 1" "$(j '.animalBadges | type == "array"') $(psql_db "SELECT count(*) FROM animal_badges WHERE animal_id=$ANIMAL AND badge_key='cared' AND tier='bronze'")"
code=$(get "animals/$ANIMAL" "$A"); check "A is now a carer, gallery grew by 2" "true $((BEFORE+2))" "$(j .isCarer) $(j '.photos | length')"
code=$(care_photos $ANIMAL "$A" 2); check "A again -> alreadyCarer" "200 true" "$code $(j .alreadyCarer)"
code=$(care_photos $ANIMAL "$B" 2); check "B: model says different -> 422 miss" "422 carePhotoMismatch" "$code $(j .code)"
check "miss is Turkish" "true" "$(j '.error | test("benzemiyor")')"
control '{"mode":"reject"}'
code=$(care_photos $ANIMAL "$B" 2); check "species screening refuses -> 422 photoRejected [0,1]" "422 photoRejected [0,1]" "$code $(j .code) $(jq -c .photoIndexes $BODY)"
control '{"mode":"match","verdicts":["different","same","different","different","different","different","different","different"]}'
code=$(care_photos $ANIMAL "$C" 2); check "C: model says same -> 201 matched, checked" "201 true true 2" "$code $(j .matched) $(j .photoChecked) $(j '.photos | length')"
code=$(get "animals/$ANIMAL" "$C"); check "C is a carer" "true" "$(j .isCarer)"
check "care attempts logged: A unchecked, C same" "|same" "$(psql_db "SELECT string_agg(coalesce(similarity,''), '|' ORDER BY id) FROM animal_match_attempts WHERE animal_id=$ANIMAL AND kind='care'")"
control '{"mode":"approve"}'
echo "        (pending files left on disk: $(ls uploads | grep -c '^pending-'))"

echo "== inbox"
code=$(post "animals/$ANIMAL/comments" "$A" '{"body":"Bugün mama bıraktım, iştahı yerinde."}'); check "A (carer) comment -> 201" 201 "$code"
code=$(get "notifications/unread-count" "$B"); check "B unread-count 1" "200 1" "$code $(j .unreadCount)"
code=$(get "notifications?limit=10" "$B"); check "B inbox lists the comment" "comment $A_ID true" "$(j '.notifications[0].kind') $(j '.notifications[0].actor_id') $(j '.notifications[0].payload.text | test("mama")')"
check "payload names the actor" "true" "$(j '.notifications[0].payload.actorName | length > 0')"
code=$(get "notifications/unread-count" "$A"); check "the actor is not notified" "0" "$(j .unreadCount)"
code=$(post "animals/$ANIMAL/health-records" "$A" '{"recordType":"illness","description":"Göz akıntısı"}'); check "A health record -> 201" 201 "$code"; RECORD=$(j .id)
code=$(post "animals/$ANIMAL/vaccinations" "$A" '{"vaccineType":"Kuduz"}'); check "A vaccination -> 201" 201 "$code"
code=$(get "notifications?limit=10" "$B"); check "B has 3 unread: vaccination, health_record, comment" "3 vaccination health_record comment" "$(j .unreadCount) $(j '.notifications[0].kind') $(j '.notifications[1].kind') $(j '.notifications[2].kind')"
FIRST=$(j '.notifications[0].id')
code=$(post "notifications/read" "$B" "{\"ids\":[$FIRST]}"); check "read one -> 2 left" "200 2" "$code $(j .unreadCount)"
code=$(post "notifications/read" "$B" '{}'); check "read all -> 0" "0" "$(j .unreadCount)"

echo "== the add-animal door: a photo match lets a sighting through"
control '{"mode":"match","verdicts":["same","different","different","different","different","different","different","different","different","different","different","different","different","different","different","different","different","different","different","different"]}'
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/animals/match" -H "Authorization: Bearer $B" -F "lat=$LAT" -F "lng=$LNG" -F "species=cat" -F "breed=$BREED" -F "color=$COLOR" -F "photos=@$FIXTURES/a.jpg;type=image/jpeg")
check "B photo match -> 200, photo checked" "200 true" "$code $(j .photoChecked)"
# The fake answers "same" for candidate 1 — the nearest by fields; that is
# whichever animal ranks first, so the hit is read back from the log.
HIT=$(psql_db "SELECT animal_id FROM animal_match_attempts WHERE user_id=$B_ID AND kind='register' ORDER BY id DESC LIMIT 1")
check "one photo hit logged as photo_same" "photo_same" "$(psql_db "SELECT similarity FROM animal_match_attempts WHERE user_id=$B_ID AND kind='register' ORDER BY id DESC LIMIT 1")"
if [ "$HIT" != "$ANIMAL" ]; then
  # Another animal ranked first: move the hit to ours for the door test
  # (the door reads the row, not the ranking).
  psql_db "UPDATE animal_match_attempts SET animal_id=$ANIMAL WHERE user_id=$B_ID AND kind='register'" >/dev/null
  echo "        (the fake's 'same' landed on animal $HIT; hit moved to $ANIMAL)"
fi
code=$(post "animals/$ANIMAL/sightings" "$B" "{\"lat\":$LAT,\"lng\":$LNG}"); check "B sighting after the photo hit -> 200" 200 "$code"
code=$(get "animals/$ANIMAL" "$B"); check "B became a carer" "true" "$(j .isCarer)"
code=$(get "notifications/unread-count" "$A"); check "A hears about the sighting" "1" "$(j .unreadCount)"
code=$(post "animals/$ANIMAL/comments" "$B" '{"body":"Ben de gördüm."}'); check "B (carer now) comment -> 201" 201 "$code"
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/animals/$ANIMAL/photos" -H "Authorization: Bearer $B" -F "photo=@$FIXTURES/b.jpg;type=image/jpeg"); check "B photo upload as carer -> 201" 201 "$code"
code=$(post "animals/$ANIMAL/health-records/$RECORD/recover" "$A" '{}'); check "A marks recovered -> 200" 200 "$code"
control '{"mode":"approve"}'

echo "== badges"
code=$(get "animals/$ANIMAL" "$A")
COUNTS=$(psql_db "SELECT (SELECT count(*) FROM animal_photo_likes l JOIN animal_photos p ON p.id=l.photo_id WHERE p.animal_id=$ANIMAL), (SELECT count(*) FROM animal_followers WHERE animal_id=$ANIMAL), (SELECT count(*) FROM user_animal_care WHERE animal_id=$ANIMAL), (SELECT count(*) FROM animal_comments WHERE animal_id=$ANIMAL), (SELECT count(DISTINCT user_id) FROM animal_match_attempts WHERE animal_id=$ANIMAL AND kind='register'), (SELECT count(*) FROM health_records WHERE animal_id=$ANIMAL AND recovered_at IS NOT NULL)")
EXPECTED=$(echo "$COUNTS" | tr '|' ' ' | awk '{for(i=1;i<=6;i++){n=$i; t=(i==4)?((n>=200)?"diamond":(n>=50)?"gold":(n>=10)?"silver":(n>=1)?"bronze":"null"):((n>=100)?"diamond":(n>=20)?"gold":(n>=5)?"silver":(n>=1)?"bronze":"null"); printf "%s%s", t, (i<6?" ":"")}}')
echo "        (counts liked|followed|cared|commented|matched|recovered = $COUNTS)"
check "badge tiers follow the counts (liked followed cared commented matched recovered)" "$EXPECTED" "$(for k in liked followed cared commented matched recovered; do jq -r --arg k $k '[.badges[] | select(.key==$k) | .tier] | first // "null"' $BODY; done | tr '\n' ' ' | sed 's/ $//')"
check "every earned key is at bronze or above" "true" "$(jq -r '[.badges[] | .tier != null] | all' $BODY)"
check "owner names in place" "Gönül Çelen" "$(jq -r '.badges[] | select(.key=="liked") | .label' $BODY)"
code=$(get "animals?lat=$LAT&lng=$LNG&radiusMeters=50&limit=3" "$A"); check "list rows carry badges" "true" "$(jq -r --argjson id $ANIMAL '[.[] | select(.id==$id) | .badges | length > 0] | first' $BODY)"

echo "== device tokens"
code=$(post "notifications/device-tokens" "$B" '{"platform":"ios","token":"apns-abc"}'); check "register token -> 201" 201 "$code"
code=$(post "notifications/device-tokens" "$A" '{"platform":"ios","token":"apns-abc"}'); check "same token, other user -> 201 (moved)" 201 "$code"
check "token now belongs to A" "$A_ID" "$(psql_db "SELECT user_id FROM device_tokens WHERE token='apns-abc'")"
code=$(post "notifications/device-tokens" "$B" '{"platform":"tv","token":"x"}'); check "bad platform -> 400" 400 "$code"
code=$(del "notifications/device-tokens" "$A" '{"token":"apns-abc"}'); check "delete token -> 204" 204 "$code"

echo; echo "passed $PASS checks; failed=$FAILED"
# Cleanup: the run's photos (rows and files) and the throwaway accounts.
psql_db "SELECT url FROM animal_photos WHERE animal_id=$ANIMAL AND uploaded_by IN ($A_ID,$B_ID,$C_ID)" | while read -r u; do rm -f "uploads/$(basename "$u")" "uploads/$(basename "$u" .jpg)-face.jpg"; done
psql_db "DELETE FROM animal_photos WHERE animal_id=$ANIMAL AND (uploaded_by IN ($A_ID,$B_ID,$C_ID) OR url LIKE '%/seed-missing-%'); DELETE FROM users WHERE id IN ($B_ID,$C_ID); DELETE FROM device_tokens WHERE token='apns-abc';" >/dev/null
exit $FAILED
