#!/usr/bin/env bash
# The photo check / photo matching checks. Started by run.sh, which boots
# the backend and the fake Anthropic API first; run that, not this.
#
# The backend has no test suite (docs/ROADMAP.md), so these curl checks are
# the evidence for ADR-0005: an approved photo becomes a token the confirm
# redeems once, a rejected photo is refused and deleted, a direct upload is
# checked too, a dead model fails open, and the match endpoint folds the
# model's verdicts into the tiers — or ignores a model that did not answer.
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
check "json_schema output requested" json_schema "$(last .format)"
check "model from AI_MODEL default" claude-opus-5 "$(last .model)"
check "care prompt used" care "$(last .kind)"
check "care runs at low effort" low "$(last .effort)"

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
mode '{"mode":"refusal"}'
code=$(upload care-actions/check "$JWT" actionType=food)
check "a refusal also fails open" unavailable "$(field .verdict)"

echo "7. Photo matching folds the model's verdicts into the tiers"
mode '{"mode":"approve"}'
# An empty corner of the map, away from the seed — and a different cell per
# run: the animals stay behind, and a rerun's candidates must not include
# them (the assertions count exactly three). Cells are 0.02° of latitude
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
code=$(upload "animals/$A/photos" "$JWT"); check "A photo -> 201" 201 "$code"
code=$(upload "animals/$B/photos" "$JWT"); check "B photo -> 201" 201 "$code"

mode '{"mode":"match","verdicts":["different","same"]}'
before=$(uploads_count)
code=$(upload animals/match "$JWT" species=cat breed=Tekir color=gri lat=$LAT lng=$LNG)
check "match -> 200" 200 "$code"
check "photoChecked" true "$(field .photoChecked)"
check "new photo + two cover photos sent (C has none)" 3 "$(last .images)"
check "match prompt used" match "$(last .kind)"
check "matching runs at medium effort" medium "$(last .effort)"
# A is the field-ranked first candidate (all fields equal, A is nearest) and
# was told "different"; B came second and was told "same".
check "B (same) ranks first" "$B" "$(field .candidates[0].id)"
check "B is high" high "$(field .candidates[0].similarity)"
check "B's first reason is photo_same" photo_same "$(field .candidates[0].similarity_reasons[0])"
check "A (different) is low" low "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.find(c=>c.id===$A).similarity")"
check "C (no photo) keeps its field tier" high "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.find(c=>c.id===$C).similarity")"
check "A ranks last of the three" "$A" "$(field .candidates[2].id)"
check "scratch upload deleted" "$before" "$(uploads_count)"

echo "8. Matching without the model's answer is the field-only ranking"
mode '{"mode":"error"}'
code=$(upload animals/match "$JWT" species=cat breed=Tekir color=gri lat=$LAT lng=$LNG)
check "match -> 200" 200 "$code"
check "photoChecked false" false "$(field .photoChecked)"
check "A (nearest, same fields) ranks first" "$A" "$(field .candidates[0].id)"
check "no photo reasons" none "$(node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));b.candidates.flatMap(c=>c.similarity_reasons).find(r=>r.startsWith('photo')) ?? 'none'")"
code=$(get_auth "animals/match?species=cat&breed=Tekir&color=gri&lat=$LAT&lng=$LNG" "$JWT")
check "GET match still answers" 200 "$code"
check "…photoChecked false" false "$(field .photoChecked)"

echo ""
if [ "$FAILED" = 0 ]; then echo "ALL PASS"; else echo "SOME FAILED"; exit 1; fi
