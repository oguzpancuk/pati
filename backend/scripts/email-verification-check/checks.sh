#!/usr/bin/env bash
# The e-mail verification checks. Started by run.sh, which boots the backend
# with the outbox transport and the dev IdP; run that, not this.
#
# The backend has no test suite (docs/ROADMAP.md), so these curl checks are
# the evidence for ADR-0004: registration lands in the pending state, the
# gate holds, the code from the mail opens it, wrong guesses run out, the
# cooldown and the address hold both expire, and a verified address is what
# lets provider sign-in link.
set -uo pipefail
API=${API:-http://localhost:3102/api}
IDP=${IDP:-http://localhost:4598}
IDP_ISS=${IDP_ISS:-http://localhost:4598}
OUTBOX=${OUTBOX:-/tmp/pati-ev-outbox.jsonl}
STAMP=$(date +%s)
BODY=/tmp/ev-body.json

post() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }
post_auth() { curl -s -o "$BODY" -w '%{http_code}' -X POST "$API/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
get_auth() { curl -s -o "$BODY" -w '%{http_code}' "$API/$1" -H "Authorization: Bearer $2"; }
body() { cat "$BODY"; }
field() { node -pe "const b=JSON.parse(require('fs').readFileSync('$BODY'));(b$1) ?? 'none'"; }
check() { # label expected actual
  if [ "$2" = "$3" ]; then echo "  PASS  $1 ($3)"; else echo "  FAIL  $1 — expected $2, got $3: $(body)"; FAILED=1; fi
}
contains() { # label needle haystack
  case "$3" in *"$2"*) echo "  PASS  $1";; *) echo "  FAIL  $1 — '$2' not in: $3"; FAILED=1;; esac
}
# The newest code mailed to an address, read from the outbox the dev
# transport writes. Fails loudly when nothing was sent — a check that reads
# an older mail would be testing the wrong code.
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
mail_count() { node -e 'const fs=require("fs");console.log(fs.readFileSync(process.argv[1],"utf8").trim().split("\n").filter(Boolean).map(l=>JSON.parse(l)).filter(m=>m.to===process.argv[2]).length)' "$OUTBOX" "$1"; }
wrong_code() { # a code that is not $1
  if [ "$1" = "000000" ]; then echo 111111; else echo 000000; fi
}
FAILED=0

MAIL="ev-$STAMP@example.com"

echo "1. Registration creates a PENDING account and mails a code"
code=$(post auth/register "{\"name\":\"Doğrulanacak Üye\",\"email\":\"$MAIL\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
check "verificationRequired" true "$(field .verificationRequired)"
check "codeSent" true "$(field .codeSent)"
check "user.email_verification_pending" true "$(field .user.email_verification_pending)"
UID1=$(field .user.id)
JWT1=$(field .token)
check "one mail went out" 1 "$(mail_count "$MAIL")"
CODE1=$(last_code "$MAIL") || { echo "  FAIL  no code in the outbox"; FAILED=1; }
echo "      user id $UID1, code $CODE1"

echo "2. The gate: a pending session may read itself and nothing else"
code=$(get_auth users/me "$JWT1")
check "GET /users/me -> 200" 200 "$code"
check "…reports pending" true "$(field .email_verification_pending)"
code=$(get_auth users/me/animals "$JWT1")
check "GET /users/me/animals -> 403" 403 "$code"
check "…flagged emailUnverified" true "$(field .emailUnverified)"
code=$(post_auth care-actions "$JWT1" '{"type":"food","lat":41,"lng":29}')
check "POST /care-actions -> 403" 403 "$code"

echo "3. Wrong and malformed codes are refused, and counted"
code=$(post_auth auth/verify-email "$JWT1" "{\"code\":\"$(wrong_code "$CODE1")\"}")
check "wrong code -> 400" 400 "$code"
contains "…names the remaining attempts" "4 deneme kaldı" "$(body)"
code=$(post_auth auth/verify-email "$JWT1" '{"code":"12345"}')
check "five digits -> 400" 400 "$code"
code=$(post_auth auth/verify-email "$JWT1" '{"code":123456}')
check "a number, not a string -> 400" 400 "$code"
code=$(get_auth users/me/animals "$JWT1")
check "still gated -> 403" 403 "$code"

echo "4. The address is held while the registration is pending"
code=$(post auth/register "{\"name\":\"Aynı Adres\",\"email\":\"$MAIL\",\"password\":\"baska1234\"}")
check "second registration -> 409" 409 "$code"
contains "…says a verification is pending" "doğrulama bekleyen" "$(body)"
code=$(post auth/login "{\"email\":\"$MAIL\",\"password\":\"baska1234\"}")
check "the second password does not log in -> 401" 401 "$code"

echo "5. Logging in again reaches the same pending session, without a mail"
code=$(post auth/login "{\"email\":\"$MAIL\",\"password\":\"parola1234\"}")
check "login -> 200" 200 "$code"
check "verificationRequired" true "$(field .verificationRequired)"
check "same account" "$UID1" "$(field .user.id)"
check "no extra mail" 1 "$(mail_count "$MAIL")"

echo "6. Resend has a cooldown"
code=$(post_auth auth/verify-email/resend "$JWT1" '{}')
check "right after registration -> 429" 429 "$code"
check "no extra mail" 1 "$(mail_count "$MAIL")"

echo "7. The mailed code verifies the account and lifts the gate"
code=$(post_auth auth/verify-email "$JWT1" "{\"code\":\" $CODE1 \"}")
check "correct code (with stray spaces) -> 200" 200 "$code"
check "user.email_verification_pending" false "$(field .user.email_verification_pending)"
code=$(get_auth users/me/animals "$JWT1")
check "GET /users/me/animals -> 200" 200 "$code"
code=$(post_auth auth/verify-email "$JWT1" "{\"code\":\"$CODE1\"}")
check "verifying again -> 200 (idempotent)" 200 "$code"
check "…alreadyVerified" true "$(field .alreadyVerified)"
code=$(post_auth auth/verify-email/resend "$JWT1" '{}')
check "resend on a verified account -> 400" 400 "$code"
code=$(post auth/register "{\"name\":\"Yine Aynı\",\"email\":\"$MAIL\",\"password\":\"baska1234\"}")
check "the address is taken for good -> 409" 409 "$code"
contains "…with the plain message" "zaten var" "$(body)"

echo "8. A verified address is what lets provider sign-in LINK (ADR-0003)"
# Before verification this token got a 409 "use your password" (S7 step 10);
# the proven address is the difference.
GT=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"web-client.apps.googleusercontent.com\",\"sub\":\"ev-google-$STAMP\",\"email\":\"$MAIL\",\"email_verified\":true}")
code=$(post auth/google "{\"idToken\":\"$GT\"}")
check "google with the verified e-mail -> 200, linked" 200 "$code"
check "…into the same account" "$UID1" "$(field .user.id)"
code=$(get_auth users/me "$JWT1")
check "authProviders now lists google" '["google"]' "$(node -pe "JSON.stringify(JSON.parse(require('fs').readFileSync('$BODY')).authProviders)")"

echo "9. Five wrong guesses retire a code; a resend issues a fresh one"
MAIL2="ev2-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Tahminci\",\"email\":\"$MAIL2\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
UID2=$(field .user.id)
JWT2=$(field .token)
CODE2=$(last_code "$MAIL2")
BAD=$(wrong_code "$CODE2")
for i in 1 2 3 4 5; do
  code=$(post_auth auth/verify-email "$JWT2" "{\"code\":\"$BAD\"}")
  check "wrong guess $i -> 400" 400 "$code"
done
code=$(post_auth auth/verify-email "$JWT2" "{\"code\":\"$CODE2\"}")
check "the RIGHT code after five wrong ones -> 429 (retired)" 429 "$code"
contains "…and says to ask for a new one" "yeni kod iste" "$(body)"
node scripts/email-verification-check/backdate.js "$UID2" sent >/dev/null || { echo "  FAIL  could not age the cooldown"; FAILED=1; }
code=$(post_auth auth/verify-email/resend "$JWT2" '{}')
check "resend after the cooldown -> 200" 200 "$code"
check "a second mail went out" 2 "$(mail_count "$MAIL2")"
CODE2B=$(last_code "$MAIL2")
if [ "$CODE2B" = "$CODE2" ]; then echo "  FAIL  resend reissued the same code"; FAILED=1; else echo "  PASS  the new code differs"; fi
code=$(post_auth auth/verify-email "$JWT2" "{\"code\":\"$CODE2\"}")
check "the retired code -> 400" 400 "$code"
code=$(post_auth auth/verify-email "$JWT2" "{\"code\":\"$CODE2B\"}")
check "the fresh code -> 200" 200 "$code"
check "…verified" false "$(field .user.email_verification_pending)"

echo "10. An expired code is refused"
MAIL3="ev3-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Geç Kalan\",\"email\":\"$MAIL3\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
UID3=$(field .user.id)
JWT3=$(field .token)
CODE3=$(last_code "$MAIL3")
node scripts/email-verification-check/backdate.js "$UID3" expiry >/dev/null || { echo "  FAIL  could not expire the code"; FAILED=1; }
code=$(post_auth auth/verify-email "$JWT3" "{\"code\":\"$CODE3\"}")
check "expired code -> 400" 400 "$code"
contains "…says it expired" "süresi dolmuş" "$(body)"

echo "11. After the hold, an abandoned registration's address is free again — and the old session dies"
# A fresh account whose code is NOT expired (step 10's is), so the "old code
# is dead" assertion below can only pass because the replacement killed it.
MAIL5="ev5-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Terk Eden\",\"email\":\"$MAIL5\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
UID5=$(field .user.id)
JWT5=$(field .token)
CODE5=$(last_code "$MAIL5")
code=$(post auth/register "{\"name\":\"Erken Gelen\",\"email\":\"$MAIL5\",\"password\":\"yenisifre1\"}")
check "inside the hold -> 409" 409 "$code"
node scripts/email-verification-check/backdate.js "$UID5" created >/dev/null || { echo "  FAIL  could not age the registration"; FAILED=1; }
code=$(post auth/register "{\"name\":\"Gerçek Sahip\",\"email\":\"$MAIL5\",\"password\":\"yenisifre1\"}")
check "re-registration -> 201" 201 "$code"
UID5B=$(field .user.id)
JWT5B=$(field .token)
if [ "$UID5B" = "$UID5" ]; then echo "  FAIL  the replacement reused row $UID5 — every token issued for it stays valid"; FAILED=1; else echo "  PASS  a fresh row ($UID5 -> $UID5B)"; fi
check "…still pending" true "$(field .user.email_verification_pending)"
# The blocker review reproduced: the squatter's seven-day token must not
# become a session on the owner's account.
code=$(get_auth users/me "$JWT5")
check "the abandoned registration's token -> 401" 401 "$code"
code=$(post_auth auth/verify-email "$JWT5" "{\"code\":\"$CODE5\"}")
check "…nor can it verify anything -> 401" 401 "$code"
code=$(post auth/login "{\"email\":\"$MAIL5\",\"password\":\"parola1234\"}")
check "the abandoned password is gone -> 401" 401 "$code"
code=$(post auth/login "{\"email\":\"$MAIL5\",\"password\":\"yenisifre1\"}")
check "the new one logs in -> 200" 200 "$code"
code=$(post_auth auth/verify-email "$JWT5B" "{\"code\":\"$CODE5\"}")
check "the old registration's (unexpired) code is dead -> 400" 400 "$code"
CODE5B=$(last_code "$MAIL5")
code=$(post_auth auth/verify-email "$JWT5B" "{\"code\":\"$CODE5B\"}")
check "the new registration's code -> 200" 200 "$code"
code=$(get_auth users/me "$JWT5")
check "the old token is still dead after verification -> 401" 401 "$code"

echo "11b. Concurrent replacements: exactly one wins"
# Review: four simultaneous registrations on a released address all got a
# token. The retire-then-insert now runs in one transaction; the losers find
# nothing to delete and hit the unique index.
MAIL6="ev6-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Eski\",\"email\":\"$MAIL6\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
UID6=$(field .user.id)
node scripts/email-verification-check/backdate.js "$UID6" created >/dev/null
for i in 1 2 3 4; do
  curl -s -o "/tmp/ev-race-$i.json" -w '%{http_code}\n' -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Yarışan $i\",\"email\":\"$MAIL6\",\"password\":\"yaris$i-1234\"}" > "/tmp/ev-race-$i.code" &
done
wait
WINS=$(cat /tmp/ev-race-{1,2,3,4}.code | grep -c '^201$')
check "exactly one 201 out of four" 1 "$WINS"
check "the rest are 409" 3 "$(cat /tmp/ev-race-{1,2,3,4}.code | grep -c '^409$')"
check "one row holds the address" 1 "$(node -e 'const r=[1,2,3,4].map(i=>{try{return JSON.parse(require("fs").readFileSync("/tmp/ev-race-"+i+".json")).user?.id}catch{return null}}).filter(Boolean);console.log(new Set(r).size)')"

echo "11c. A verified provider e-mail takes over a pending registration at once"
# The provider proved the mailbox; the pending registrant never did. Refusing
# here kept a squatted address closed to its owner's Google sign-in forever
# (review finding). No hold applies.
MAIL7="ev7-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Gaspçı\",\"email\":\"$MAIL7\",\"password\":\"gasp12345\"}")
check "squatting registration -> 201" 201 "$code"
UID7=$(field .user.id)
JWT7=$(field .token)
GT7=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"web-client.apps.googleusercontent.com\",\"sub\":\"owner-google-$STAMP\",\"email\":\"$MAIL7\",\"email_verified\":true}")
code=$(post auth/google "{\"idToken\":\"$GT7\"}")
check "owner's verified google -> 201, new account" 201 "$code"
UID7B=$(field .user.id)
if [ "$UID7B" = "$UID7" ]; then echo "  FAIL  the provider was linked INTO the squatter's row"; FAILED=1; else echo "  PASS  a fresh row ($UID7 -> $UID7B)"; fi
code=$(get_auth users/me "$JWT7")
check "the squatter's token -> 401" 401 "$code"
code=$(post auth/login "{\"email\":\"$MAIL7\",\"password\":\"gasp12345\"}")
check "the squatter's password -> 401" 401 "$code"

echo "12. A verified account is never replaceable, however old"
node scripts/email-verification-check/backdate.js "$UID5B" created >/dev/null
code=$(post auth/register "{\"name\":\"Gaspçı\",\"email\":\"$MAIL5\",\"password\":\"gasp12345\"}")
check "register on an old verified address -> 409" 409 "$code"
code=$(post auth/login "{\"email\":\"$MAIL5\",\"password\":\"yenisifre1\"}")
check "the owner's password still works -> 200" 200 "$code"

echo "12b. The fifth wrong guess says the code is spent"
MAIL8="ev8-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Beşinci\",\"email\":\"$MAIL8\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
JWT8=$(field .token)
CODE8=$(last_code "$MAIL8")
for i in 1 2 3 4 5; do code=$(post_auth auth/verify-email "$JWT8" "{\"code\":\"$(wrong_code "$CODE8")\"}"); done
check "fifth wrong guess -> 400" 400 "$code"
contains "…and says to ask for a new code" "yeni kod iste" "$(body)"
code=$(post_auth auth/verify-email/resend "$JWT8" '{}')
check "resend right away -> 429 (cooldown, before the limiter)" 429 "$code"
check "…with retryAfter" true "$(node -pe "typeof JSON.parse(require('fs').readFileSync('$BODY')).retryAfter === 'number'")"

echo "13. A pending account can still delete itself"
MAIL4="ev4-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Vazgeçen\",\"email\":\"$MAIL4\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
JWT4=$(field .token)
code=$(curl -s -o "$BODY" -w '%{http_code}' -X DELETE "$API/users/me" -H "Authorization: Bearer $JWT4" -H 'Content-Type: application/json' -d '{"password":"parola1234"}')
check "DELETE /users/me while pending -> 200" 200 "$code"
code=$(post auth/register "{\"name\":\"Yeniden\",\"email\":\"$MAIL4\",\"password\":\"parola1234\"}")
check "…and the address is free at once -> 201" 201 "$code"

echo
[ "$FAILED" = 0 ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $FAILED
