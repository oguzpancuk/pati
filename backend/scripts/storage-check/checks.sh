#!/usr/bin/env bash
# The checks behind run.sh (see there). Needs API, BUCKET, BUCKET_NAME,
# OUTBOX and UPLOADS from the environment, and the shared local database
# (docker: stray-db).
#
# State: registers one throwaway account (depo-<stamp>@example.com) and
# deletes it on the way out. Its uploads live in the throwaway UPLOADS
# directory run.sh made, never in the dev server's own.
set -uo pipefail
API=${API:-http://localhost:3109/api}
BUCKET=${BUCKET:-http://localhost:4611}
OUTBOX=${OUTBOX:-/tmp/pati-storage-outbox.jsonl}
UPLOADS=${UPLOADS:-/tmp/pati-storage-uploads}
BODY=/tmp/pati-storage-body.json
STAMP=$(date +%s)
MAIL="depo-$STAMP@example.com"
PHOTO=/tmp/pati-storage-photo.jpg

PASS=0; FAILED=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok    $1";
  else FAILED=1; echo "  FAIL  $1 — expected [$2] got [$3]"; echo "        body: $(head -c 300 $BODY)"; fi; }
post() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }
post_auth() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
j() { jq -r "$1" "$BODY"; }
keys() { curl -s "$BUCKET/__keys"; }
has_key() { keys | grep -qx "$1" && echo yes || echo no; }
psql_db() { docker exec stray-db psql -U stray -d stray -tAc "$1"; }
last_code() { node -e 'const fs=require("fs");const l=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse).filter(m=>m.to===process.argv[2]).pop();const m=(l.subject+" "+l.text).match(/\b(\d{6})\b/);console.log(m?m[1]:"")' "$OUTBOX" "$1"; }

node -e "require('sharp')({create:{width:1400,height:1000,channels:3,background:'#c8842a'}}).jpeg().toFile(process.argv[1]).then(()=>{})" "$PHOTO"

echo "== an account"
code=$(post auth/register "{\"name\":\"Depo Testi\",\"email\":\"$MAIL\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
JWT=$(j .token); USER_ID=$(j .user.id)
code=$(post_auth auth/verify-email "$JWT" "{\"code\":\"$(last_code "$MAIL")\"}")
check "verified" 200 "$code"

echo "== an avatar goes to the bucket, not only to the disk"
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/users/me/avatar" -H "Authorization: Bearer $JWT" -F "photo=@$PHOTO;type=image/jpeg")
check "upload -> 200" 200 "$code"
AVATAR=$(j .avatar_url)
FILE=$(basename "$AVATAR")
case "$AVATAR" in
  *"/uploads/$FILE") check "the stored url is unchanged in shape" yes yes ;;
  *) check "the stored url is unchanged in shape" "…/uploads/<file>" "$AVATAR" ;;
esac
check "the object is in the bucket" yes "$(has_key "$FILE")"
check "and a cached copy is on disk" yes "$([ -f "$UPLOADS/$FILE" ] && echo yes || echo no)"

echo "== a cold machine serves what it never received"
code=$(curl -s -o /dev/null -w '%{http_code}' "$AVATAR")
check "served from the cache -> 200" 200 "$code"
rm -f "$UPLOADS/$FILE"
check "the cache is empty" no "$([ -f "$UPLOADS/$FILE" ] && echo yes || echo no)"
code=$(curl -s -o /tmp/pati-storage-fetched.jpg -w '%{http_code}' "$AVATAR")
check "served from the bucket -> 200" 200 "$code"
check "…with the bytes the bucket holds" yes "$([ -s /tmp/pati-storage-fetched.jpg ] && echo yes || echo no)"
check "…and the cache was refilled" yes "$([ -f "$UPLOADS/$FILE" ] && echo yes || echo no)"

echo "== a file that exists nowhere is a 404, not a 500"
code=$(curl -s -o /dev/null -w '%{http_code}' "${API%/api}/uploads/yok-boyle-bir-dosya.jpg")
check "unknown file -> 404" 404 "$code"

echo "== a bucket that refuses fails the upload instead of recording it"
curl -s -o /dev/null "$BUCKET/__refuse"
before=$(keys | grep -c . )
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/users/me/avatar" -H "Authorization: Bearer $JWT" -F "photo=@$PHOTO;type=image/jpeg")
check "upload -> 503" 503 "$code"
check "…and says so in Turkish" yes "$(grep -q "dener misin" "$BODY" && echo yes || echo no)"
check "nothing new in the bucket" "$before" "$(keys | grep -c . )"
check "the avatar still points at the first photo" "$AVATAR" "$(psql_db "SELECT avatar_url FROM users WHERE id=$USER_ID")"
curl -s -o /dev/null "$BUCKET/__accept"

echo "== replacing the avatar drops the old object"
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/users/me/avatar" -H "Authorization: Bearer $JWT" -F "photo=@$PHOTO;type=image/jpeg")
check "second upload -> 200" 200 "$code"
SECOND=$(basename "$(j .avatar_url)")
check "the new object is in the bucket" yes "$(has_key "$SECOND")"
# The old photo has to go, on disk and in the bucket: it stayed publicly
# fetchable at its /uploads URL forever, and account deletion only ever
# cleaned up the LAST avatar (review finding).
check "the replaced object left the bucket" no "$(has_key "$FILE")"
check "…and its cached copy is gone" no "$([ -f "$UPLOADS/$FILE" ] && echo yes || echo no)"
code=$(curl -s -o /dev/null -w '%{http_code}' "$AVATAR")
check "…so the old url is a 404" 404 "$code"

echo "== a transparent logo is not flattened onto black"
node -e "require('sharp')({create:{width:600,height:600,channels:4,background:{r:200,g:130,b:40,alpha:0}}}).png().toFile(process.argv[1]).then(()=>{})" /tmp/pati-storage-logo.png
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/users/me/avatar" -H "Authorization: Bearer $JWT" -F "photo=@/tmp/pati-storage-logo.png;type=image/png")
check "a png avatar -> 200" 200 "$code"
LOGO=$(basename "$(j .avatar_url)")
check "…stayed a png" png "${LOGO##*.}"
check "…and is in the bucket under that name" yes "$(has_key "$LOGO")"
SECOND="$LOGO"

echo "== a file we cannot read is refused, not stored"
# The part is named .html and declared image/png, which is what gets past
# the mime filter. It used to be stored under an inert .bin name; it is
# refused outright now, because a file sharp cannot decode is one whose
# metadata we cannot strip and every upload is served publicly.
printf '<script>alert(1)</script>' > /tmp/pati-storage-xss.html
before_keys=$(keys | grep -c .)
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/users/me/avatar" -H "Authorization: Bearer $JWT" -F "photo=@/tmp/pati-storage-xss.html;type=image/png")
check "an unreadable part -> 400" 400 "$code"
check "…in Turkish" yes "$(grep -q "okuyamadık" "$BODY" && echo yes || echo no)"
check "…and nothing reached the bucket" "$before_keys" "$(keys | grep -c .)"

echo "== a batch refusal tells the client WHICH photo"
# The unit test asserts the thrown Error's properties, which cannot see
# whether the error handler forwards them — it did not, so the index was
# inert end to end (review finding). This asserts the HTTP body.
node -e "require('sharp')({create:{width:400,height:300,channels:3,background:'#7dc83a'}}).jpeg().toFile(process.argv[1]).then(()=>{})" /tmp/pati-storage-ok.jpg
printf 'not an image at all' > /tmp/pati-storage-bad.jpg
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/animals/match" -H "Authorization: Bearer $JWT" \
  -F "lat=40.99" -F "lng=29.03" -F "species=cat" -F "breed=Tekir" -F "color=gri" \
  -F "photos=@/tmp/pati-storage-ok.jpg;type=image/jpeg" \
  -F "photos=@/tmp/pati-storage-bad.jpg;type=image/jpeg" \
  -F "photos=@/tmp/pati-storage-ok.jpg;type=image/jpeg")
check "one unreadable photo refuses the batch -> 400" 400 "$code"
check "…with a code the client branches on" photoUnreadable "$(j .code)"
check "…and the index of the bad one" 1 "$(j .photoIndex)"

# The other multi-photo route runs the same middleware, and its clients
# were left unable to act on the code (review finding).
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/animals/999999999/care-photos" -H "Authorization: Bearer $JWT" \
  -F "photos=@/tmp/pati-storage-ok.jpg;type=image/jpeg" \
  -F "photos=@/tmp/pati-storage-bad.jpg;type=image/jpeg")
check "care-photos refuses the batch too -> 400" 400 "$code"
check "…with the same code" photoUnreadable "$(j .code)"
check "…and the slot to empty" 1 "$(j .photoIndex)"

echo "== a real image with a hostile name still cannot be served as html"
# The other half of the defence: this one DOES decode, so it is stored —
# and the server, not the client, picks what it is called.
node -e "require('sharp')({create:{width:400,height:300,channels:3,background:'#3a7dc8'}}).png().toFile(process.argv[1]).then(()=>{})" /tmp/pati-storage-evil.html
code=$(curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/users/me/avatar" -H "Authorization: Bearer $JWT" -F "photo=@/tmp/pati-storage-evil.html;type=image/png")
check "a png named .html -> 200" 200 "$code"
EVIL_URL=$(j .avatar_url)
EVIL=$(basename "$EVIL_URL")
check "…stored as a jpg, the server's choice" jpg "${EVIL##*.}"
CT=$(curl -s -o /dev/null -w '%{content_type}' "$EVIL_URL")
check "…never served as html" no "$(echo "$CT" | grep -qi html && echo yes || echo no)"
check "…and never sniffable into html" yes \
  "$(curl -s -D - -o /dev/null "$EVIL_URL" | grep -qi 'x-content-type-options: nosniff' && echo yes || echo no)"

echo "== a malformed url is a Turkish 404, not a 500"
code=$(curl -s -o "$BODY" -w '%{http_code}' "${API%/api}/uploads/%zz")
check "bad percent-escape -> 404" 404 "$code"

echo "== cleanup"
code=$(curl -s -o "$BODY" -w '%{http_code}' -X DELETE "$API/users/me" -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d '{"password":"parola1234"}')
check "account deleted -> 200" 200 "$code"
check "its avatar object left the bucket too" no "$(has_key "$SECOND")"
psql_db "DELETE FROM users WHERE email = '$MAIL'" >/dev/null

echo
if [ "$FAILED" = 0 ]; then echo "passed $PASS checks; failed=0"; else echo "passed $PASS checks; SOME FAILED"; fi
exit "$FAILED"
