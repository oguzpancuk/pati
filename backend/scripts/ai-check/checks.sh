#!/usr/bin/env bash
# The photo check / photo matching checks. Started by run.sh, which boots
# the backend and the fake Gemini API first; run that, not this.
#
# The backend has no test suite (docs/ROADMAP.md), so these curl checks are
# the evidence for ADR-0005: an approved photo becomes a token the confirm
# redeems once, a rejected photo is refused and deleted, a direct upload is
# checked too, a dead model fails open, the match endpoint folds the
# model's verdicts into the tiers — or ignores a model that did not answer —
# and animal photos are screened for the species on the same token scheme.
set -uo pipefail
API=${API:-http://localhost:3103/api}
FAKE=${FAKE:-http://localhost:4600}
OUTBOX=${OUTBOX:-/tmp/pati-ai-outbox.jsonl}
STAMP=$(date +%s)
BODY=/tmp/ai-body.json
PHOTO=/tmp/pati-ai-photo.jpg
UPLOADS="$(pwd)/uploads"

post() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }
post_auth() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
get_auth() { curl -s -o "$BODY" -w '%{http_code}' "$API/$1" -H "Authorization: Bearer $2"; }
# multipart: path token field=value... (the photo is always the fixture)
upload() { local p="$1" t="$2"; shift 2; local args=(); for kv in "$@"; do args+=(-F "$kv"); done
  curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$p" -H "Authorization: Bearer $t" -F "photo=@$PHOTO;type=image/jpeg" ${args[@]+"${args[@]}"}; }
body() { cat "$BODY"; }
field() { node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));(b$1) ?? 'none'"; }
mode() { curl -s -o /dev/null -X POST "$FAKE/control" -H 'Content-Type: application/json' -d "$1"; }
last() { curl -s "$FAKE/last" | node -pe "JSON.parse(require('fs').readFileSync(0))$1 ?? 'none'"; }
uploads_count() { ls -1 "$UPLOADS" | wc -l | tr -d ' '; }
ai_check_of() { node scripts/ai-check/ai-check-of.js "$1"; }
check() { # label expected actual
  if [ "$2" = "$3" ]; then echo "  PASS  $1 ($3)"; else echo "  FAIL  $1 — expected $2, got $3: $(body)"; FAILED=1; fi
}
contains() { # label needle haystack
  case "$3" in *"$2"*) echo "  PASS  $1";; *) echo "  FAIL  $1 — '$2' not in: $3"; FAILED=1;; esac
}
last_code() { # e-mail
  node -e '
    const fs = require("fs");
    const mails = fs.readFileSync(process.argv[1], "utf8").trim().split("\n").filter(Boolean)
      .map((l) => JSON.parse(l)).filter((m) => m.to === process.argv[2]);
    const last = mails.at(-1);
    if (!last) { console.error("no mail to " + process.argv[2]); process.exit(1); }
    const m = /(\d{6})/.exec(last.subject);
    if (!m) { console.error("no code in subject: " + last.subject); process.exit(1); }
    console.log(m[1]);
  ' "$OUTBOX" "$1"
}
FAILED=0

# A real JPEG, made the same way the server will read it (sharp): a request
# built from a fixture the image pipeline cannot decode would test nothing.
node -e "require('sharp')({create:{width:96,height:64,channels:3,background:'#c8842a'}}).jpeg().toFile(process.argv[1]).then(()=>{})" "$PHOTO"

echo "0. A verified account to act as"
MAIL="ai-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Fotoğraf Deneyen\",\"email\":\"$MAIL\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
JWT=$(field .token)
CODE=$(last_code "$MAIL") || { echo "  FAIL  no code in the outbox"; FAILED=1; }
code=$(post_auth auth/verify-email "$JWT" "{\"code\":\"$CODE\"}")
check "verify -> 200" 200 "$code"

echo "1. An approved photo comes back as a token; the request had the right shape"
mode '{"mode":"approve"}'
before=$(uploads_count)
code=$(upload care-actions/check "$JWT" actionType=food)
check "check -> 200" 200 "$code"
check "verdict approved" approved "$(field .verdict)"
contains "reason is the model's Turkish line" "Kapta mama" "$(body)"
TOKEN=$(field .photoToken)
check "photoToken present" true "$([ ${#TOKEN} -gt 40 ] && echo true || echo false)"
check "file kept in uploads" "$((before + 1))" "$(uploads_count)"
check "one image in the request" 1 "$(last .images)"
check "JSON output with a schema requested" application/json "$(last .format)"
check "…schema present" true "$(last .schema)"
check "model from AI_MODEL default" gemini-3.5-flash "$(last .model)"
check "care prompt used" care "$(last .kind)"

echo "2. The confirm redeems the token — once"
code=$(post_auth care-actions "$JWT" "{\"lat\":40.99,\"lng\":29.03,\"actionType\":\"food\",\"photoToken\":\"$TOKEN\"}")
check "confirm -> 201" 201 "$code"
CARE1=$(field .id)
contains "photo url is the checked file" "/uploads/" "$(field .photo_url)"
check "ai_check stored" approved "$(ai_check_of "$CARE1")"
code=$(post_auth care-actions "$JWT" "{\"lat\":40.99,\"lng\":29.03,\"actionType\":\"food\",\"photoToken\":\"$TOKEN\"}")
check "replay -> 409" 409 "$code"
check "…photoAlreadyUsed" photoAlreadyUsed "$(field .code)"
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/care-actions" -H "Authorization: Bearer $JWT" -H "Host: elsewhere.example:3103" -H 'Content-Type: application/json' -d "{\"lat\":40.99,\"lng\":29.03,\"actionType\":\"food\",\"photoToken\":\"$TOKEN\"}")
check "replay under another Host -> 409" 409 "$code"
code=$(curl -s -o "$BODY" -w '%{http_code}' "$API/users/me" -H "Authorization: Bearer $TOKEN")
check "a photoToken is not a session -> 401" 401 "$code"

echo "3. A token cannot be bent to another type, user, or forged"
mode '{"mode":"approve"}'
code=$(upload care-actions/check "$JWT" actionType=water)
check "water check -> 200" 200 "$code"
WTOKEN=$(field .photoToken)
code=$(post_auth care-actions "$JWT" "{\"lat\":40.99,\"lng\":29.03,\"actionType\":\"food\",\"photoToken\":\"$WTOKEN\"}")
check "water token as food -> 400" 400 "$code"
check "…photoTokenInvalid" photoTokenInvalid "$(field .code)"
code=$(post_auth care-actions "$JWT" "{\"lat\":40.99,\"lng\":29.03,\"actionType\":\"water\",\"photoToken\":\"not.a.token\"}")
check "garbage token -> 400" 400 "$code"
MAIL2="ai2-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Başka Biri\",\"email\":\"$MAIL2\",\"password\":\"parola1234\"}")
JWT2=$(field .token)
CODE2=$(last_code "$MAIL2")
code=$(post_auth auth/verify-email "$JWT2" "{\"code\":\"$CODE2\"}")
check "second account verified" 200 "$code"
code=$(post_auth care-actions "$JWT2" "{\"lat\":40.99,\"lng\":29.03,\"actionType\":\"water\",\"photoToken\":\"$WTOKEN\"}")
check "another user's token -> 400" 400 "$code"
code=$(post_auth care-actions "$JWT" "{\"lat\":40.99,\"lng\":29.03,\"actionType\":\"water\",\"photoToken\":\"$WTOKEN\"}")
check "the owner still can -> 201" 201 "$code"

echo "4. A rejected photo is refused with the reason and deleted"
mode '{"mode":"reject"}'
before=$(uploads_count)
code=$(upload care-actions/check "$JWT" actionType=food)
check "check -> 422" 422 "$code"
check "code photoRejected" photoRejected "$(field .code)"
contains "reason shown" "görünmüyor" "$(field .error)"
check "no token" none "$(field .photoToken)"
check "file deleted" "$before" "$(uploads_count)"

echo "5. A direct upload is checked too — no client can skip the check"
code=$(upload care-actions "$JWT" actionType=food lat=40.99 lng=29.03)
check "direct upload while rejecting -> 422" 422 "$code"
check "file deleted" "$before" "$(uploads_count)"
mode '{"mode":"approve"}'
code=$(upload care-actions "$JWT" actionType=food lat=40.99 lng=29.03)
check "direct upload while approving -> 201" 201 "$code"
check "ai_check stored" approved "$(ai_check_of "$(field .id)")"

echo "6. A dead model fails open: the photo is accepted unchecked"
mode '{"mode":"error"}'
code=$(upload care-actions/check "$JWT" actionType=food)
check "check -> 200" 200 "$code"
check "verdict unavailable" unavailable "$(field .verdict)"
TOKEN=$(field .photoToken)
code=$(post_auth care-actions "$JWT" "{\"lat\":40.99,\"lng\":29.03,\"actionType\":\"food\",\"photoToken\":\"$TOKEN\"}")
check "confirm -> 201" 201 "$code"
check "ai_check is null" null "$(ai_check_of "$(field .id)")"
mode '{"mode":"blocked"}'
code=$(upload care-actions/check "$JWT" actionType=food)
check "a safety block also fails open" unavailable "$(field .verdict)"

echo "6b. A 503 is retried once — and only once"
mode '{"mode":"busy","times":1}'
before_requests=$(last .requests)
code=$(upload care-actions/check "$JWT" actionType=food)
check "one 503 then an answer -> approved" approved "$(field .verdict)"
check "two requests were made" "$((before_requests + 2))" "$(last .requests)"
mode '{"mode":"busy","times":2}'
before_requests=$(last .requests)
code=$(upload care-actions/check "$JWT" actionType=food)
check "two 503s -> unavailable" unavailable "$(field .verdict)"
check "no third request" "$((before_requests + 2))" "$(last .requests)"
mode '{"mode":"busy","times":1,"status":429}'
before_requests=$(last .requests)
code=$(upload care-actions/check "$JWT" actionType=food)
check "a 429 (quota) is not retried -> unavailable" unavailable "$(field .verdict)"
check "one request only" "$((before_requests + 1))" "$(last .requests)"

echo "7. Photo matching folds the model's verdicts into the tiers"
mode '{"mode":"approve"}'
# An empty corner of the map, away from the seed — and a different cell per
# run: the animals stay behind, and a rerun's candidates must not include
# them (the assertions count the fixtures exactly). Cells are 0.02° of latitude
# (2.2 km) by 0.03° of longitude (≥2.1 km up to 51°N) apart, with the
# animals inside 0.004° of the cell origin, so only a rerun landing in the
# SAME cell can pollute the list — stamps equal modulo both 499 and 89,
# about once in twelve hours.
LAT=$(node -pe "41.21 + ($STAMP % 499) * 0.02"); LNG=$(node -pe "29.41 + ($STAMP % 89) * 0.03")
code=$(post_auth animals "$JWT" "{\"species\":\"cat\",\"name\":\"Yakın Tekir\",\"breed\":\"Tekir\",\"color\":\"gri\",\"lat\":$LAT,\"lng\":$LNG}")
check "animal A -> 201" 201 "$code"; A=$(field .id)
code=$(post_auth animals "$JWT" "{\"species\":\"cat\",\"name\":\"Uzak Tekir\",\"breed\":\"Tekir\",\"color\":\"gri\",\"lat\":$LAT,\"lng\":$(node -pe "$LNG + 0.004")}")
check "animal B -> 201" 201 "$code"; B=$(field .id)
code=$(post_auth animals "$JWT" "{\"species\":\"cat\",\"name\":\"Fotoğrafsız\",\"breed\":\"Tekir\",\"color\":\"gri\",\"lat\":$LAT,\"lng\":$(node -pe "$LNG + 0.001")}")
check "animal C (no photo) -> 201" 201 "$code"; C=$(field .id)
# D: same pattern, other colour, past the 200 m ring (+0.0035° is ≥ 244 m at
# every latitude the grid reaches) → fields say 2 = medium, the only fixture
# on the medium boundary; the fake calls it "unsure", which moves nothing,
# so it must survive the filter as medium.
code=$(post_auth animals "$JWT" "{\"species\":\"cat\",\"name\":\"Orta Tekir\",\"breed\":\"Tekir\",\"color\":\"siyah\",\"lat\":$LAT,\"lng\":$(node -pe "$LNG + 0.0035")}")
check "animal D (medium by fields) -> 201" 201 "$code"; D=$(field .id)
# E: no photo, other pattern and colour, past the ring → fields say 0 = low.
# The only fixture that is low by fields: hidden once the model answered,
# listed when it did not — the case an ungated filter got wrong.
code=$(post_auth animals "$JWT" "{\"species\":\"cat\",\"name\":\"Alakasız\",\"breed\":\"Sarman\",\"color\":\"turuncu\",\"lat\":$LAT,\"lng\":$(node -pe "$LNG + 0.003")}")
check "animal E (low by fields, no photo) -> 201" 201 "$code"; E=$(field .id)
code=$(upload "animals/$A/photos" "$JWT"); check "A photo -> 201" 201 "$code"
code=$(upload "animals/$B/photos" "$JWT"); check "B photo -> 201" 201 "$code"
code=$(upload "animals/$D/photos" "$JWT"); check "D photo -> 201" 201 "$code"

# Field-ranked order of the animals with a photo: A (4, nearest), B (3 —
# breed + colour, outside the 200 m ring), D (2).
mode '{"mode":"match","verdicts":["different","same","unsure"]}'
before=$(uploads_count)
code=$(upload animals/match "$JWT" species=cat breed=Tekir color=gri lat=$LAT lng=$LNG)
check "match -> 200" 200 "$code"
check "photoChecked" true "$(field .photoChecked)"
check "new photo + three cover photos sent (C has none)" 4 "$(last .images)"
check "match prompt used" match "$(last .kind)"
# A is the field-ranked first candidate (all fields equal, A is nearest) and
# was told "different"; B came second and was told "same".
check "B (same) ranks first" "$B" "$(field .candidates[0].id)"
check "B is high" high "$(field .candidates[0].similarity)"
check "B's first reason is photo_same" photo_same "$(field .candidates[0].similarity_reasons[0])"
check "A (different → low) is not listed" none "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.find(c=>c.id===$A)?.id ?? 'none'")"
check "C (no photo) keeps its field tier" high "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.find(c=>c.id===$C).similarity")"
check "D (unsure, fields medium) is listed as medium" medium "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.find(c=>c.id===$D)?.similarity ?? 'none'")"
check "E (low by fields) is not listed" none "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.find(c=>c.id===$E)?.id ?? 'none'")"
check "exactly the three that clear medium are listed" 3 "$(field .candidates.length)"
check "the photo stays behind its token" "$((before + 1))" "$(uploads_count)"
check "one photoToken for the one photo" 1 "$(field .photoTokens.length)"

echo "8. Matching without the model's answer is the field-only ranking — nothing hidden"
mode '{"mode":"error"}'
code=$(upload animals/match "$JWT" species=cat breed=Tekir color=gri lat=$LAT lng=$LNG)
check "match -> 200" 200 "$code"
check "photoChecked false" false "$(field .photoChecked)"
check "A (nearest, same fields) ranks first" "$A" "$(field .candidates[0].id)"
check "all five are listed (fail-open keeps the old list)" 5 "$(field .candidates.length)"
check "…D included as medium" medium "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.find(c=>c.id===$D)?.similarity ?? 'none'")"
check "…E included as low — an ungated filter would hide it" low "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.find(c=>c.id===$E)?.similarity ?? 'none'")"
check "no photo reasons" none "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.flatMap(c=>c.similarity_reasons).find(r=>r.startsWith('photo')) ?? 'none'")"
code=$(get_auth "animals/match?species=cat&breed=Tekir&color=gri&lat=$LAT&lng=$LNG" "$JWT")
check "GET match still answers" 200 "$code"
check "…photoChecked false" false "$(field .photoChecked)"

echo "9. An answer whose indexes cannot be attributed is dropped, not shifted"
# A 0-based answer would otherwise put B's "same" onto A — A stays first
# either way, so "no photo reasons" is the assertion that catches that one.
for raw in '[{"index":0,"verdict":"different"},{"index":1,"verdict":"same"}]' \
           '[{"index":2,"verdict":"same"},{"index":2,"verdict":"same"}]' \
           '[{"index":2,"verdict":"same"}]' \
           '[{"index":1,"verdict":"different"},{"index":2,"verdict":"same"},{"index":3,"verdict":"same"},{"index":4,"verdict":"same"}]'; do
  mode "{\"mode\":\"match\",\"candidates\":$raw}"
  code=$(upload animals/match "$JWT" species=cat breed=Tekir color=gri lat=$LAT lng=$LNG)
  check "match -> 200" 200 "$code"
  check "photoChecked false for $raw" false "$(field .photoChecked)"
  check "A still first" "$A" "$(field .candidates[0].id)"
  check "no photo reasons" none "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.flatMap(c=>c.similarity_reasons).find(r=>r.startsWith('photo')) ?? 'none'")"
done

echo "10. A photo upload cuts a face thumbnail; the best face is the animal's picture"
mode '{"mode":"approve"}'
code=$(post_auth animals "$JWT" "{\"species\":\"cat\",\"name\":\"Yüzlü\",\"breed\":\"Tekir\",\"color\":\"gri\",\"lat\":$LAT,\"lng\":$(node -pe "$LNG + 0.0045")}")
check "animal F -> 201" 201 "$code"; F=$(field .id)
mode '{"mode":"face","found":false}'
code=$(upload "animals/$F/photos" "$JWT")
check "photo without a face -> 201" 201 "$code"
check "…no thumbnail" none "$(field .thumb_url)"
check "…no score" none "$(field .face_score)"
mode '{"mode":"face","found":true,"box":[100,150,600,650],"score":0.4}'
code=$(upload "animals/$F/photos" "$JWT")
check "photo with a face -> 201" 201 "$code"
THUMB=$(field .thumb_url)
contains "…thumbnail is a -face.jpg next to the photo" "-face.jpg" "$THUMB"
check "…score stored" 0.4 "$(field .face_score)"
check "…thumbnail file exists" yes "$([ -f "$UPLOADS/$(basename "$THUMB")" ] && echo yes || echo no)"
check "…thumbnail is a square" 320x320 "$(node -e "require('sharp')(process.argv[1]).metadata().then(m=>console.log(m.width+'x'+m.height))" "$UPLOADS/$(basename "$THUMB")")"
check "face prompt used" face "$(last .kind)"
mode '{"mode":"face","found":true,"box":[200,200,700,700],"score":0.9}'
code=$(upload "animals/$F/photos" "$JWT")
BEST=$(field .thumb_url)
code=$(get_auth "animals/$F" "$JWT")
check "detail -> 200" 200 "$code"
check "the animal's picture is the best-scored face" "$BEST" "$(field .cover_thumb_url)"
check "photos carry their thumbnails" 3 "$(field .photos.length)"
code=$(get_auth "animals?lat=$LAT&lng=$LNG&limit=50" "$JWT")
check "the list carries cover_thumb_url" "$BEST" "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.find(a=>a.id===$F)?.cover_thumb_url ?? 'none'")"
mode '{"mode":"error"}'
code=$(upload "animals/$F/photos" "$JWT")
check "model down: photo still saved -> 201" 201 "$code"
check "…without a thumbnail" none "$(field .thumb_url)"

echo "11. Animal photos are screened for the species; the match step hands back tokens"
# multipart with the form's whole set: path token count field=value...
upload_photos() { local p="$1" t="$2" n="$3"; shift 3; local args=(); for kv in "$@"; do args+=(-F "$kv"); done
  local files=(); for _ in $(seq "$n"); do files+=(-F "photos=@$PHOTO;type=image/jpeg"); done
  curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$p" -H "Authorization: Bearer $t" "${files[@]}" ${args[@]+"${args[@]}"}; }
# An empty cell of its own (see section 7): no candidates, so the last
# model request is the screening, not a comparison.
GLAT=$(node -pe "41.21 + (($STAMP + 250) % 499) * 0.02"); GLNG=$(node -pe "29.41 + (($STAMP + 40) % 89) * 0.03")
mode '{"mode":"approve"}'
before=$(uploads_count)
code=$(upload_photos animals/match "$JWT" 2 species=cat breed=Tekir color=gri lat=$GLAT lng=$GLNG)
check "match with two photos -> 200" 200 "$code"
check "no candidates in an empty cell" 0 "$(field .candidates.length)"
check "two photoTokens" 2 "$(field .photoTokens.length)"
check "files kept for the create step" "$((before + 2))" "$(uploads_count)"
check "animal prompt used" animal "$(last .kind)"
check "one image per screening" 1 "$(last .images)"
PT1=$(field .photoTokens[0]); PT2=$(field .photoTokens[1])
code=$(post_auth animals "$JWT" "{\"species\":\"cat\",\"name\":\"Tokenli\",\"breed\":\"Tekir\",\"color\":\"gri\",\"lat\":$GLAT,\"lng\":$GLNG}")
check "animal G -> 201" 201 "$code"; G=$(field .id)
code=$(post_auth "animals/$G/photos" "$JWT" "{\"photoToken\":\"$PT1\"}")
check "token redeemed -> 201" 201 "$code"
contains "photo url is the screened file" "/uploads/" "$(field .url)"
contains "…and the face step ran on it" "-face.jpg" "$(field .thumb_url)"
check "only the face cut-out is new, no second upload" "$((before + 3))" "$(uploads_count)"
code=$(post_auth "animals/$G/photos" "$JWT" "{\"photoToken\":\"$PT1\"}")
check "replay -> 409" 409 "$code"
check "…photoAlreadyUsed" photoAlreadyUsed "$(field .code)"
code=$(post_auth animals "$JWT" "{\"species\":\"dog\",\"name\":\"Başka Tür\",\"breed\":\"Kangal melezi\",\"color\":\"sarı\",\"lat\":$GLAT,\"lng\":$GLNG}")
check "animal H (dog) -> 201" 201 "$code"; H=$(field .id)
code=$(post_auth "animals/$H/photos" "$JWT" "{\"photoToken\":\"$PT2\"}")
check "a cat token on a dog -> 400" 400 "$code"
check "…photoTokenInvalid" photoTokenInvalid "$(field .code)"
code=$(post_auth "animals/$G/photos" "$JWT2" "{\"photoToken\":\"$PT2\"}")
check "another user's token -> 400" 400 "$code"
code=$(post_auth "animals/$G/photos" "$JWT" "{\"photoToken\":\"not.a.token\"}")
check "garbage token -> 400" 400 "$code"
code=$(curl -s -o "$BODY" -w '%{http_code}' "$API/users/me" -H "Authorization: Bearer $PT2")
check "a photoToken is not a session -> 401" 401 "$code"
code=$(post_auth "animals/$G/photos" "$JWT" "{\"photoToken\":\"$PT2\"}")
check "the second token still works for its owner -> 201" 201 "$code"
code=$(post_auth "animals/999999/photos" "$JWT" "{\"photoToken\":\"$PT2\"}")
check "unknown animal -> 404" 404 "$code"

echo "12. A refused photo ends the match with its index; a direct upload is screened too"
mode '{"mode":"reject"}'
before=$(uploads_count)
code=$(upload_photos animals/match "$JWT" 2 species=cat breed=Tekir color=gri lat=$GLAT lng=$GLNG)
check "match while rejecting -> 422" 422 "$code"
check "code photoRejected" photoRejected "$(field .code)"
check "photoIndex names the photo" 0 "$(field .photoIndex)"
contains "reason shown" "görünmüyor" "$(field .error)"
check "no tokens" none "$(field .photoTokens)"
check "files deleted" "$before" "$(uploads_count)"
code=$(upload "animals/$G/photos" "$JWT")
check "direct upload while rejecting -> 422" 422 "$code"
check "file deleted" "$before" "$(uploads_count)"
mode '{"mode":"approve"}'
code=$(upload "animals/$G/photos" "$JWT")
check "direct upload while approving -> 201" 201 "$code"
code=$(upload animals/match "$JWT" species=cat breed=Tekir color=gri lat=$GLAT lng=$GLNG)
check "the older single photo field still answers" 200 "$code"
check "…with one token" 1 "$(field .photoTokens.length)"

echo "13. A dead model fails open for animal photos: tokens are issued, uploads stored"
mode '{"mode":"error"}'
code=$(upload_photos animals/match "$JWT" 1 species=cat breed=Tekir color=gri lat=$GLAT lng=$GLNG)
check "match -> 200" 200 "$code"
check "one token" 1 "$(field .photoTokens.length)"
code=$(post_auth "animals/$G/photos" "$JWT" "{\"photoToken\":\"$(field .photoTokens[0])\"}")
check "token redeemed -> 201" 201 "$code"
code=$(upload "animals/$G/photos" "$JWT")
check "direct upload -> 201" 201 "$code"
mode '{"mode":"approve"}'

echo ""
if [ "$FAILED" = 0 ]; then echo "ALL PASS"; else echo "SOME FAILED"; exit 1; fi
