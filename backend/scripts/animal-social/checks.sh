#!/usr/bin/env bash
# The checks behind run.sh (see there). Needs API, FAKE, OUTBOX, FIXTURES
# from the environment and the shared local database (docker: stray-db).
# Runs from backend/ (run.sh cd's there): the photo files it seeds and
# removes live under ./uploads, the dev server's own directory.
#
# State: the script registers eight throwaway accounts (an owner, a
# follower, two carers, two confirmers, a late follower, a double-sender) and the owner
# creates two throwaway animals in the middle of the Pacific, so no seeded
# row is touched; on the way out it DELETES those animals (their photos,
# likes, followers, badges, notifications and match rows go with them,
# cascade), the accounts, and the photo files the run wrote. The seeded
# test1@stray.test is only logged in, never made a carer: until P7 it was
# the carer "A", and every run wrote real inbox rows for it (the other
# carers' sightings and comments on "Harness Kedisi") that lived until the
# cleanup cascade — the "past notifications" the owner met on the
# simulator (P7 finding 1). A standing account's inbox stays untouched.
set -uo pipefail
API=${API:-http://localhost:3107/api}
FAKE=${FAKE:-http://localhost:4607}
OUTBOX=${OUTBOX:-/tmp/pati-animal-social-outbox.jsonl}
FIXTURES=${FIXTURES:-/tmp/pati-animal-social-fixtures}
BODY=/tmp/pati-animal-social-body.json
# Seeded photo rows point at this backend's uploads; the API's origin.
UPLOADS_URL="${API%/api}/uploads"
# Nobody registers animals here; the 1 km match circle holds ours alone.
LAT=-30.5; LNG=-150.5
psql_db() { docker exec stray-db psql -U stray -d stray -tAc "$1"; }

PASS=0; FAILED=0
# The photo matches leave their upload pending for the create step's token
# (the sweeper reclaims it after thirty minutes); the run removes exactly
# the files it made — photo_match records each one's name in a file (it
# runs inside command substitutions, so a variable would not reach here).
# One run at a time: the file, the accounts' address pattern and the
# animal's name are shared, so two runs side by side would clean each
# other up.
PENDING_MADE=/tmp/pati-animal-social-pending.txt; : > "$PENDING_MADE"
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
photo_match() { # token → POST /animals/match with one photo and the animal's fields
  local code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/animals/match" -H "Authorization: Bearer $1" -F "lat=$LAT" -F "lng=$LNG" -F "species=$SPECIES" -F "breed=$BREED" -F "color=$COLOR" -F "photos=@$FIXTURES/a.jpg;type=image/jpeg")
  # The token names the final file; on disk it waits under the pending prefix.
  # JWT payloads are base64url without padding: pad and translate first.
  local b=$(jq -r '.photoTokens[0] // empty' "$BODY" | cut -d. -f2 | tr '_-' '/+'); while [ $(( ${#b} % 4 )) -ne 0 ]; do b="$b="; done
  local f=$(echo "$b" | base64 -d 2>/dev/null | jq -r .file 2>/dev/null)
  [ -n "$f" ] && echo "pending-$f" >> "$PENDING_MADE"
  echo "$code"; }
last_hit() { # user id → similarity of the newest register hit on the animal, or "none"
  local v=$(psql_db "SELECT similarity FROM animal_match_attempts WHERE user_id=$1 AND animal_id=$ANIMAL AND kind='register' ORDER BY id DESC LIMIT 1"); echo "${v:-none}"; }
last_code() { # e-mail → the 6-digit code from the outbox
  node -e 'const fs=require("fs");const l=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse).filter(m=>m.to===process.argv[2]).pop();const m=(l.subject+" "+l.text).match(/\b(\d{6})\b/);console.log(m?m[1]:"")' "$OUTBOX" "$1"; }
register() { # name email → prints "token id"
  curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"parola1234\"}" >/dev/null
  local t=$(j .token) id=$(j .user.id)
  post auth/verify-email "$t" "{\"code\":\"$(last_code "$2")\"}" >/dev/null
  echo "$t $id"; }

echo "== accounts and the throwaway animal"
# An earlier run that died before its cleanup leaves its animal in the
# circle and its accounts behind; sweep them first (they are recognisable
# by the address pattern and the name at this spot).
LEFT=$(psql_db "SELECT count(*) FROM animals WHERE name LIKE 'Harness Kedisi%'")
if [ "$LEFT" != 0 ]; then
  psql_db "DELETE FROM animals WHERE name LIKE 'Harness Kedisi%'; DELETE FROM users WHERE email ~ '^(sahip|takipci|bakici|bakicia|ikinci|tekatis|sonradan|esanli)-[0-9]+@stray\.test$';" >/dev/null
  echo "        (swept $LEFT leftover animal(s) of an earlier aborted run)"
fi
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' -d '{"email":"test1@stray.test","password":"password123"}')
check "login test1 -> 200" 200 "$code"; T1=$(j .token)
code=$(get "notifications" "$T1"); T1_TOTAL=$(j .total)
STAMP=$(date +%s)
read -r A A_ID < <(register "Bakıcı A" "bakicia-$STAMP@stray.test")
read -r D D_ID < <(register "Sahip Test" "sahip-$STAMP@stray.test")
read -r B B_ID < <(register "Takipçi Test" "takipci-$STAMP@stray.test")
read -r C C_ID < <(register "Bakıcı Test" "bakici-$STAMP@stray.test")
read -r E E_ID < <(register "İkinci Test" "ikinci-$STAMP@stray.test")
code=$(get users/me "$B"); check "B registered and verified" "200 false" "$code $(j .email_verification_pending)"
code=$(post animals "$D" "{\"species\":\"cat\",\"name\":\"Harness Kedisi\",\"breed\":\"Tekir\",\"color\":\"gri\",\"lat\":$LAT,\"lng\":$LNG}")
check "D registers the animal -> 201" 201 "$code"; ANIMAL=$(j .id)
read -r SPECIES BREED COLOR < <(psql_db "SELECT species, coalesce(breed,''), coalesce(color,'') FROM animals WHERE id=$ANIMAL" | tr '|' ' ')
check "species read back from the database" "cat" "$SPECIES"
# The likes need a photo to like, and the first care step must find no
# gallery file on disk: one owner row whose file does not exist.
psql_db "INSERT INTO animal_photos (animal_id, url, uploaded_by) VALUES ($ANIMAL, '$UPLOADS_URL/seed-missing-$STAMP.jpg', $D_ID)" >/dev/null
code=$(get "animals/$ANIMAL" "$D"); check "the registrant is a carer, 'cared' bronze on record" "true 1" "$(j .isCarer) $(psql_db "SELECT count(*) FROM animal_badges WHERE animal_id=$ANIMAL AND badge_key='cared' AND tier='bronze'")"
# A carer is a follower too (P7 item 2): the registrant starts both.
check "…and follows it: isFollowing, followerCount 1" "true 1" "$(j .isFollowing) $(j .followerCount)"
check "the profile carries the six-step badge ladder" "6" "$(j '.badgeLadder | length')"

echo "== profile read, follow"
code=$(get "animals/$ANIMAL" "$B"); check "B GET animal -> 200" 200 "$code"
check "B is neither carer nor follower" "false false" "$(j '.isCarer') $(j '.isFollowing')"
check "photos carry like fields" "0 false" "$(j '.photos[0].like_count') $(j '.photos[0].liked_by_me')"
check "profile carries badges array" "true" "$(j '.badges | type == "array"')"
PHOTO=$(j '.photos[0].id')
code=$(post "animals/$ANIMAL/follow" "$B" '{}'); check "B follow -> 201" 201 "$code"
check "following true, count 2 (the registrant and B)" "true 2" "$(j .following) $(j .followerCount)"
code=$(get "animals/$ANIMAL" "$B"); check "GET shows isFollowing" "true 2" "$(j .isFollowing) $(j .followerCount)"
code=$(del "animals/$ANIMAL/follow" "$B"); check "B unfollow -> 200" 200 "$code"; check "following false, count 1" "false 1" "$(j .following) $(j .followerCount)"
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
Q="lat=$LAT&lng=$LNG&species=$SPECIES&breed=$(jq -rn --arg b "$BREED" '$b|@uri')&color=$(jq -rn --arg c "$COLOR" '$c|@uri')"
code=$(get "animals/match?$Q" "$B"); check "B field match -> 200" 200 "$code"
check "animal is a high candidate by fields" "high" "$(jq -r --argjson id $ANIMAL '.candidates[] | select(.id==$id) | .similarity' $BODY)"
check "no hit logged" "0" "$(psql_db "SELECT count(*) FROM animal_match_attempts WHERE animal_id=$ANIMAL AND user_id=$B_ID")"
code=$(post "animals/$ANIMAL/sightings" "$B" "{\"lat\":$LAT,\"lng\":$LNG}"); check "B sighting still -> 403" "403 carersOnly" "$code $(j .code)"

echo "== care-photo step"
# Order matters here: A's care photos are the first files on disk for this
# animal and get a face thumb, which is what makes the cover comparable
# for the miss/match cases that follow (and for the door section).
code=$(care_photos $ANIMAL "$B" 1); check "one photo -> 400" "400 carePhotosRequired" "$code $(j .code)"
code=$(get "animals/$ANIMAL" "$A"); BEFORE=$(j '.photos | length')
control '{"mode":"match","verdicts":["different","different","different","different","different","different","different","different"]}'
code=$(care_photos $ANIMAL "$A" 2); check "A: no gallery file on disk -> accepted unchecked (fail open)" "201 true false 2" "$code $(j .matched) $(j .photoChecked) $(j '.photos | length')"
check "answer carries the animalBadges list" "true" "$(j '.animalBadges | type == "array"')"
check "…and the follow state: a new carer follows (P7 item 2)" "true 3" "$(j .following) $(j .followerCount)"
code=$(get "animals/$ANIMAL" "$A"); check "A is now a carer, gallery grew by 2" "true $((BEFORE+2))" "$(j .isCarer) $(j '.photos | length')"
check "GET shows A as carer AND follower" "true true" "$(j .isCarer) $(j .isFollowing)"
# The new carer is announced (P7 item 12) to followers ∪ carers minus A:
# B (follower) and D (registrant); A hears nothing about itself.
code=$(get "notifications?limit=5" "$B"); check "B: one unread, kind care, from A" "1 care Bakıcı A" "$(j .unreadCount) $(j '.notifications[0].kind') $(j '.notifications[0].payload.actorName')"
code=$(get "notifications/unread-count" "$D"); check "D (registrant) hears it too" "1" "$(j .unreadCount)"
code=$(get "notifications/unread-count" "$A"); check "A is not told about itself" "0" "$(j .unreadCount)"
code=$(care_photos $ANIMAL "$A" 2); check "A again -> alreadyCarer" "200 true" "$code $(j .alreadyCarer)"
check "serial second submission (isCarer exit) announces nothing: one care row for B from A" "1" "$(psql_db "SELECT count(*) FROM notifications WHERE user_id=$B_ID AND kind='care' AND actor_id=$A_ID")"
code=$(care_photos $ANIMAL "$B" 2); check "B: model says different -> 422 miss" "422 carePhotoMismatch" "$code $(j .code)"
check "miss is Turkish" "true" "$(j '.error | test("benzemiyor")')"
control '{"mode":"reject"}'
code=$(care_photos $ANIMAL "$B" 2); check "species screening refuses -> 422 photoRejected [0,1]" "422 photoRejected [0,1]" "$code $(j .code) $(jq -c .photoIndexes $BODY)"
control '{"mode":"match","verdicts":["different","same","different","different","different","different","different","different"]}'
code=$(care_photos $ANIMAL "$C" 2); check "C: model says same -> 201 matched, checked" "201 true true 2" "$code $(j .matched) $(j .photoChecked) $(j '.photos | length')"
code=$(get "animals/$ANIMAL" "$C"); check "C is a carer" "true" "$(j .isCarer)"
# 009 is a one-shot backfill: a carer who unfollows stays unfollowed when
# the deploy applies the file again (migrate.js runs every file each time).
code=$(del "animals/$ANIMAL/follow" "$C"); check "C (carer) unfollows -> 200" 200 "$code"
npm run migrate >/tmp/pati-animal-social-migrate2.log 2>&1 || { echo "  FAIL  migrate re-run failed (see /tmp/pati-animal-social-migrate2.log)"; FAILED=1; }
check "009 applied again: C's follower row stays gone" "f" "$(psql_db "SELECT EXISTS (SELECT 1 FROM animal_followers WHERE animal_id=$ANIMAL AND user_id=$C_ID)")"
check "…and the backfill is on record once" "1" "$(psql_db "SELECT count(*) FROM schema_backfills WHERE name='009_carers_follow'")"
code=$(post "animals/$ANIMAL/follow" "$C" '{}'); check "C follows again" 201 "$code"
code=$(get "notifications?limit=5" "$B"); check "B: two care rows now, the newest from C" "2 care Bakıcı Test" "$(j .unreadCount) $(j '.notifications[0].kind') $(j '.notifications[0].payload.actorName')"
code=$(get "notifications/unread-count" "$A"); check "A (carer) hears about C" "1" "$(j .unreadCount)"
# Read them away so the inbox section below counts from zero.
for t in "$A" "$B" "$D"; do post notifications/read "$t" '{}' >/dev/null; done
check "care attempts logged: A unchecked, C same" "|same" "$(psql_db "SELECT string_agg(coalesce(similarity,''), '|' ORDER BY id) FROM animal_match_attempts WHERE animal_id=$ANIMAL AND kind='care'")"
# The concurrent path: two submissions from one fresh account at once
# both pass the isCarer read; addCarer's ON CONFLICT lets exactly one
# insert the row, and only that one announces `care` (becameCarer).
read -r H H_ID < <(register "Eşzamanlı Test" "esanli-$STAMP@stray.test")
control '{"mode":"match","verdicts":["same","same","same","same","same","same","same","same"]}'
curl -s -o /tmp/pati-animal-social-h1.json -w '%{http_code}\n' -X POST "$API/animals/$ANIMAL/care-photos" -H "Authorization: Bearer $H" -F "photos=@$FIXTURES/a.jpg;type=image/jpeg" -F "photos=@$FIXTURES/b.jpg;type=image/jpeg" > /tmp/pati-animal-social-h1.code &
curl -s -o /tmp/pati-animal-social-h2.json -w '%{http_code}\n' -X POST "$API/animals/$ANIMAL/care-photos" -H "Authorization: Bearer $H" -F "photos=@$FIXTURES/a.jpg;type=image/jpeg" -F "photos=@$FIXTURES/b.jpg;type=image/jpeg" > /tmp/pati-animal-social-h2.code &
wait
check "H, two care submissions at once: both answer 2xx" "true" "$(for f in /tmp/pati-animal-social-h1.code /tmp/pati-animal-social-h2.code; do cat $f; done | awk '$1 ~ /^20[01]$/ {n++} END {print (n==2) ? "true" : "false"}')"
check "…one carer row" "1" "$(psql_db "SELECT count(*) FROM user_animal_care WHERE user_id=$H_ID AND animal_id=$ANIMAL")"
check "…and one care notification for B from H" "1" "$(psql_db "SELECT count(*) FROM notifications WHERE user_id=$B_ID AND kind='care' AND actor_id=$H_ID")"
post notifications/read "$B" '{}' >/dev/null
control '{"mode":"approve"}'
echo "        (pending files on disk: $(ls uploads | grep -c '^pending-'))"

echo "== inbox"
# test1 is a standing account: its inbox may hold rows from other animals,
# so its counts are read as deltas.
code=$(get "notifications/unread-count" "$A"); A0=$(j .unreadCount)
code=$(post "animals/$ANIMAL/comments" "$A" '{"body":"Bugün mama bıraktım, iştahı yerinde."}'); check "A (carer) comment -> 201" 201 "$code"
code=$(get "notifications/unread-count" "$B"); check "B unread-count 1" "200 1" "$code $(j .unreadCount)"
code=$(get "notifications?limit=10" "$B"); check "B inbox lists the comment" "comment $A_ID true" "$(j '.notifications[0].kind') $(j '.notifications[0].actor_id') $(j '.notifications[0].payload.text | test("mama")')"
check "payload names the actor" "true" "$(j '.notifications[0].payload.actorName | length > 0')"
code=$(get "notifications/unread-count" "$A"); check "the actor is not notified" "$A0" "$(j .unreadCount)"
code=$(post "animals/$ANIMAL/health-records" "$A" '{"recordType":"illness","description":"Göz akıntısı"}'); check "A health record -> 201" 201 "$code"; RECORD=$(j .id)
code=$(post "animals/$ANIMAL/vaccinations" "$A" '{"vaccineType":"Kuduz"}'); check "A vaccination -> 201" 201 "$code"
code=$(get "notifications?limit=10" "$B"); check "B has 3 unread: vaccination, health_record, comment" "3 vaccination health_record comment" "$(j .unreadCount) $(j '.notifications[0].kind') $(j '.notifications[1].kind') $(j '.notifications[2].kind')"
FIRST=$(j '.notifications[0].id')
code=$(post "notifications/read" "$B" "{\"ids\":[$FIRST]}"); check "read one -> 2 left" "200 2" "$code $(j .unreadCount)"
code=$(post "notifications/read" "$B" '{}'); check "read all -> 0" "0" "$(j .unreadCount)"

echo "== follow timing (P7 finding 1): a follow brings nothing from before it"
# Three events are on record now. Someone who follows afterwards must see
# none of them — rows are written at event time to the recipients of that
# moment, never backfilled — and hears only what comes later.
read -r G G_ID < <(register "Sonradan Test" "sonradan-$STAMP@stray.test")
code=$(post "animals/$ANIMAL/follow" "$G" '{}'); check "G follows after the events -> 201" 201 "$code"
code=$(get "notifications" "$G"); check "G's inbox is empty: nothing unread, nothing at all" "0 0 0" "$(j .unreadCount) $(j .total) $(j '.notifications | length')"
code=$(post "animals/$ANIMAL/comments" "$A" '{"body":"Akşam yine buradaydı."}'); check "A comments after the follow -> 201" 201 "$code"
code=$(get "notifications" "$G"); check "G hears that one only" "1 1 comment" "$(j .unreadCount) $(j .total) $(j '.notifications[0].kind')"
code=$(del "animals/$ANIMAL/follow" "$G"); check "G unfollows -> 200" 200 "$code"
code=$(post "animals/$ANIMAL/comments" "$A" '{"body":"Su kabını doldurdum."}'); check "A comments again -> 201" 201 "$code"
code=$(get "notifications" "$G"); check "…and G, unfollowed, hears nothing new" "1" "$(j .total)"

echo "== the add-animal door: only a 'same' verdict opens it"
# Our animal is the only candidate in the circle, so the fake's first
# verdict is its verdict. Product rule: the door is never weaker than
# "bakım ver" — 'same' opens it, 'similar'/'unsure' do not, and the field-
# only form never logs (checked above).
control '{"mode":"match","verdicts":["different"]}'
code=$(photo_match "$E"); check "E photo match, model says different -> 200, checked, animal hidden" "200 true 0" "$code $(j .photoChecked) $(j '.candidates | length')"
check "no hit for a 'different' verdict" "none" "$(last_hit $E_ID)"
control '{"mode":"match","verdicts":["unsure"]}'
code=$(photo_match "$E"); check "E photo match, model unsure -> 200, animal shown" "200 true 1" "$code $(j .photoChecked) $(j '.candidates | length')"
check "no hit for an 'unsure' verdict" "none" "$(last_hit $E_ID)"
control '{"mode":"match","verdicts":["similar"]}'
code=$(photo_match "$E"); check "E photo match, model says similar -> 200, animal shown" "200 true 1" "$code $(j .photoChecked) $(j '.candidates | length')"
check "no hit for a 'similar' verdict" "none" "$(last_hit $E_ID)"
check "the answer carries matchHit false" "false" "$(jq -r --argjson id $ANIMAL '.candidates[] | select(.id==$id) | .matchHit' $BODY)"
code=$(post "animals/$ANIMAL/sightings" "$E" "{\"lat\":$LAT,\"lng\":$LNG}"); check "E sighting still -> 403 (the clients then open the profile)" "403 carersOnly" "$code $(j .code)"
control '{"mode":"match","verdicts":["same"]}'
code=$(photo_match "$B"); check "B photo match, model says same -> 200, animal shown" "200 true 1" "$code $(j .photoChecked) $(j '.candidates | length')"
check "hit logged as same" "same" "$(last_hit $B_ID)"
check "the answer carries matchHit for it" "true" "$(jq -r --argjson id $ANIMAL '.candidates[] | select(.id==$id) | .matchHit' $BODY)"
code=$(photo_match "$B"); check "B matches again under same -> a second row, still one user" "2 1" "$(psql_db "SELECT count(*) FROM animal_match_attempts WHERE user_id=$B_ID AND animal_id=$ANIMAL AND kind='register'") $(psql_db "SELECT count(DISTINCT user_id) FROM animal_match_attempts WHERE animal_id=$ANIMAL AND kind='register'")"
code=$(post "animals/$ANIMAL/sightings" "$B" "{\"lat\":$LAT,\"lng\":$LNG}"); check "B sighting after the 'same' hit -> 200" 200 "$code"
code=$(get "animals/$ANIMAL" "$B"); check "B became a carer" "true" "$(j .isCarer)"
code=$(get "notifications?limit=5" "$A"); check "A hears about the new carer, then the sighting" "$((A0+2)) sighting care" "$(j .unreadCount) $(j '.notifications[0].kind') $(j '.notifications[1].kind')"
check "the door made B a follower as well" "t" "$(psql_db "SELECT EXISTS (SELECT 1 FROM animal_followers WHERE animal_id=$ANIMAL AND user_id=$B_ID)")"
code=$(post "animals/$ANIMAL/comments" "$B" '{"body":"Ben de gördüm."}'); check "B (carer now) comment -> 201" 201 "$code"
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/animals/$ANIMAL/photos" -H "Authorization: Bearer $B" -F "photo=@$FIXTURES/b.jpg;type=image/jpeg"); check "B photo upload as carer -> 201" 201 "$code"
# Without any model answer the hit is 'unchecked' (fail open, as the care
# step): the fake errors, the comparison yields nothing.
control '{"mode":"error"}'
code=$(photo_match "$E"); check "E photo match, model down -> 200, unchecked" "200 false" "$code $(j .photoChecked)"
check "hit logged as unchecked" "unchecked" "$(last_hit $E_ID)"
code=$(post "animals/$ANIMAL/sightings" "$E" "{\"lat\":$LAT,\"lng\":$LNG}"); check "E sighting after the unchecked hit -> 200" 200 "$code"
check "'matched' counts distinct users with a same/unchecked hit" "2" "$(psql_db "SELECT count(DISTINCT user_id) FROM animal_match_attempts WHERE animal_id=$ANIMAL AND kind='register'")"

echo "== one-shot: one photo confirms one animal"
# A second throwaway animal at the same spot; one 'same' answer for both
# gives F two fresh hits. Confirming one spends the other.
read -r F F_ID < <(register "Tek Atış Test" "tekatis-$STAMP@stray.test")
code=$(post animals "$D" "{\"species\":\"cat\",\"name\":\"Harness Kedisi 2\",\"breed\":\"$BREED\",\"color\":\"$COLOR\",\"lat\":$LAT,\"lng\":$LNG}")
check "D registers a second animal -> 201" 201 "$code"; ANIMAL2=$(j .id)
# A cover the model can look at (a candidate without one is never judged,
# so never a hit): one owner photo with a real file behind it.
cp "$FIXTURES/b.jpg" "uploads/seed-harness-$STAMP.jpg"
psql_db "INSERT INTO animal_photos (animal_id, url, uploaded_by) VALUES ($ANIMAL2, '$UPLOADS_URL/seed-harness-$STAMP.jpg', $D_ID)" >/dev/null
control '{"mode":"match","verdicts":["same","same"]}'
code=$(photo_match "$F"); check "F photo match -> two hits" "200 2" "$code $(jq -r '[.candidates[] | select(.matchHit)] | length' $BODY)"
check "two fresh register rows" "2" "$(psql_db "SELECT count(*) FROM animal_match_attempts WHERE user_id=$F_ID AND kind='register'")"
X_MATCHED=$(psql_db "SELECT count(DISTINCT user_id) FROM animal_match_attempts WHERE animal_id=$ANIMAL AND kind='register'")
code=$(post "animals/$ANIMAL2/sightings" "$F" "{\"lat\":$LAT,\"lng\":$LNG}"); check "F confirms the second animal -> 200" 200 "$code"
check "both hits are spent, none deleted" "2 2" "$(psql_db "SELECT count(*), count(used_at) FROM animal_match_attempts WHERE user_id=$F_ID AND kind='register'" | tr '|' ' ')"
code=$(post "animals/$ANIMAL/sightings" "$F" "{\"lat\":$LAT,\"lng\":$LNG}"); check "F confirming the first animal too -> 403" "403 carersOnly" "$code $(j .code)"
code=$(get "animals/$ANIMAL2" "$F"); check "F is a carer of the second animal only" "true" "$(j .isCarer)"
code=$(get "animals/$ANIMAL" "$F"); check "…and not of the first" "false" "$(j .isCarer)"
check "the first animal's recognised-user count is unchanged" "$X_MATCHED" "$(psql_db "SELECT count(DISTINCT user_id) FROM animal_match_attempts WHERE animal_id=$ANIMAL AND kind='register'")"
# A spent hit opens nothing again: the carer row is what let F in, and
# with it removed the second confirm on the same animal is refused.
psql_db "DELETE FROM user_animal_care WHERE user_id=$F_ID AND animal_id=$ANIMAL2" >/dev/null
code=$(post "animals/$ANIMAL2/sightings" "$F" "{\"lat\":$LAT,\"lng\":$LNG}"); check "a second confirm on the same animal, hit spent -> 403" "403 carersOnly" "$code $(j .code)"
control '{"mode":"approve"}'
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
# The ladder (P7 item 3): every key with its live count and thresholds,
# the tier from the awards table.
code=$(get "animals/$ANIMAL" "$A")
check "ladder keys in ANIMAL_BADGES order" "matched commented recovered liked followed cared" "$(jq -r '[.badgeLadder[].key] | join(" ")' $BODY)"
check "ladder counts are the live ones (followed, cared)" "$(echo "$COUNTS" | cut -d'|' -f2) $(echo "$COUNTS" | cut -d'|' -f3)" "$(jq -r '.badgeLadder[] | select(.key=="followed") | .value' $BODY) $(jq -r '.badgeLadder[] | select(.key=="cared") | .value' $BODY)"
check "ladder tiers agree with the chips" "true" "$(jq -r '[.badgeLadder[] | select(.tier != null) | .tier] == [.badges[] | .tier]' $BODY)"
check "every ladder step carries the four thresholds" "true" "$(jq -r '[.badgeLadder[] | .thresholds | has("bronze") and has("silver") and has("gold") and has("diamond")] | all' $BODY)"
code=$(get "animals/$ANIMAL2" "$D"); check "an unearned key: tier null, 0 of 1 to bronze" "null 0 1" "$(jq -r '.badgeLadder[] | select(.key=="liked") | "\(.tier) \(.value) \(.nextThreshold)"' $BODY)"

echo "== device tokens"
code=$(post "notifications/device-tokens" "$B" '{"platform":"ios","token":"apns-abc"}'); check "register token -> 201" 201 "$code"
code=$(post "notifications/device-tokens" "$A" '{"platform":"ios","token":"apns-abc"}'); check "same token, other user -> 201 (moved)" 201 "$code"
check "token now belongs to A" "$A_ID" "$(psql_db "SELECT user_id FROM device_tokens WHERE token='apns-abc'")"
code=$(post "notifications/device-tokens" "$B" '{"platform":"tv","token":"x"}'); check "bad platform -> 400" 400 "$code"
code=$(del "notifications/device-tokens" "$A" '{"token":"apns-abc"}'); check "delete token -> 204" 204 "$code"

code=$(get "notifications" "$T1"); check "the standing account's inbox is untouched by the run (P7 finding 1)" "$T1_TOTAL" "$(j .total)"

echo; echo "passed $PASS checks; failed=$FAILED"
# Cleanup: the run's photo files, then the throwaway animal (cascade) and
# the accounts. A's rows on the animal go with it.
psql_db "SELECT url FROM animal_photos WHERE animal_id IN ($ANIMAL,$ANIMAL2)" | while read -r u; do rm -f "uploads/$(basename "$u")" "uploads/$(basename "$u" .jpg)-face.jpg"; done
while read -r f; do [ -n "$f" ] && rm -f "uploads/$f"; done < "$PENDING_MADE"
if ! psql_db "DELETE FROM animals WHERE id IN ($ANIMAL,$ANIMAL2); DELETE FROM users WHERE id IN ($A_ID,$B_ID,$C_ID,$D_ID,$E_ID,$F_ID,$G_ID,$H_ID); DELETE FROM device_tokens WHERE token='apns-abc';" >/dev/null; then
  echo "  FAIL  cleanup: the throwaway animals $ANIMAL $ANIMAL2 / accounts $A_ID $B_ID $C_ID $D_ID $E_ID $F_ID $G_ID $H_ID are still in the database"; FAILED=1
fi
exit $FAILED
