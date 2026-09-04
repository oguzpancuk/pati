#!/usr/bin/env bash
# The Apple/Google sign-in checks. Started by run.sh, which boots the backend
# and the dev IdP first; run that, not this.
#
# The backend has no test suite (docs/ROADMAP.md), so these curl checks are
# the evidence for S7 — they drive the real endpoints and assert the answer,
# including the four ways a forged token must be refused.
set -uo pipefail
API=${API:-http://localhost:3101/api}
IDP=${IDP:-http://localhost:4599}
STAMP=$(date +%s)
# Issuer as the backend was configured to expect it.
IDP_ISS=${IDP_ISS:-http://localhost:4599}

post() { curl -s -o /tmp/s7-body.json -w '%{http_code}' -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }
body() { cat /tmp/s7-body.json; }
check() { # label expected actual
  if [ "$2" = "$3" ]; then echo "  PASS  $1 ($3)"; else echo "  FAIL  $1 — expected $2, got $3: $(body)"; FAILED=1; fi
}
contains() { # label needle haystack
  case "$3" in *"$2"*) echo "  PASS  $1";; *) echo "  FAIL  $1 — '$2' not in: $3"; FAILED=1;; esac
}
minted() { # label token — a refusal check proves nothing if the IdP handed
           # back an error page instead of a JWT
  case "$2" in
    *.*.*) ;;
    *) echo "  FAIL  $1 — the dev IdP did not return a token: $2"; FAILED=1;;
  esac
}
FAILED=0

GMAIL="s7-google-$STAMP@example.com"
GSUB="google-sub-$STAMP"

echo "1. Google sign-in creates an account"
TOKEN=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"$GSUB\",\"email\":\"$GMAIL\",\"email_verified\":true,\"name\":\"Deniz Test\"}")
code=$(post auth/google "{\"idToken\":\"$TOKEN\"}")
check "new account -> 201" 201 "$code"
UID1=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
JWT1=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).token")
echo "      user id $UID1, name $(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.name"), avatar $(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.avatar_url")"

echo "2. Same identity signs in again — same account, no duplicate"
code=$(post auth/google "{\"idToken\":\"$TOKEN\"}")
check "returning user -> 200" 200 "$code"
UID2=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
check "same user id" "$UID1" "$UID2"

echo "3. Apple token with the same VERIFIED e-mail links to that account"
ATOKEN=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/apple\",\"aud\":\"com.oguzpancuk.pati\",\"sub\":\"apple-sub-$STAMP\",\"email\":\"$GMAIL\",\"email_verified\":\"true\"}")
code=$(post auth/apple "{\"identityToken\":\"$ATOKEN\"}")
check "link -> 200 (not a new account)" 200 "$code"
UID3=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
check "same user id" "$UID1" "$UID3"

echo "4. Password login on a social-only account names the providers"
code=$(post auth/login "{\"email\":\"$GMAIL\",\"password\":\"whatever12\"}")
check "-> 401" 401 "$code"
# The status alone passed even with the provider-naming branch deleted.
contains "the message names both providers" "Google / Apple" "$(body)"

echo "5. Token minted for another app (wrong aud) is refused"
BAD=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"someone-elses-app.apps.googleusercontent.com\",\"sub\":\"attacker\",\"email\":\"$GMAIL\",\"email_verified\":true}")
minted "wrong-audience token was minted" "$BAD"
code=$(post auth/google "{\"idToken\":\"$BAD\"}")
check "wrong audience -> 401" 401 "$code"

echo "6. Token signed with an unpublished key is refused"
ROGUE=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"$GSUB\",\"email\":\"$GMAIL\",\"email_verified\":true}" --data-urlencode "rogue=1")
minted "rogue-key token was minted" "$ROGUE"
code=$(post auth/google "{\"idToken\":\"$ROGUE\"}")
check "bad signature -> 401" 401 "$code"

echo "7. Expired token is refused"
EXP=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"$GSUB\",\"email\":\"$GMAIL\",\"email_verified\":true,\"expiresIn\":\"-60s\"}")
minted "expired token was minted" "$EXP"
code=$(post auth/google "{\"idToken\":\"$EXP\"}")
check "expired -> 401" 401 "$code"

echo "8. An UNVERIFIED e-mail is refused — for a taken address and a free one"
UNV=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"impostor-$STAMP\",\"email\":\"$GMAIL\",\"email_verified\":false}")
code=$(post auth/google "{\"idToken\":\"$UNV\"}")
check "taken address -> 403" 403 "$code"
UID4=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user?.id ?? 'none'")
if [ "$UID4" = "$UID1" ]; then echo "  FAIL  unverified e-mail took over account $UID1"; FAILED=1; else echo "  PASS  no session issued ($UID4)"; fi
# The free-address case is the one that matters most: an account created from
# an unverified address would OWN that address, and step 3 would then merge
# its real owner into it on their first verified sign-in.
SQUAT="squat-$STAMP@example.com"
UNV2=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"squatter-$STAMP\",\"email\":\"$SQUAT\",\"email_verified\":false}")
code=$(post auth/google "{\"idToken\":\"$UNV2\"}")
check "free address -> 403 (no account created)" 403 "$code"
OWNER=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"realowner-$STAMP\",\"email\":\"$SQUAT\",\"email_verified\":true}")
code=$(post auth/google "{\"idToken\":\"$OWNER\"}")
check "the address's real owner gets a NEW account -> 201" 201 "$code"

echo "8b. Algorithm confusion is refused"
NONE=$(node -e '
const jwt=require("jsonwebtoken");
console.log(jwt.sign({iss:process.argv[1]+"/google",aud:"ios-client.apps.googleusercontent.com",sub:"alg-none",email:"alg@example.com",email_verified:true,exp:Math.floor(Date.now()/1000)+600},null,{algorithm:"none"}));
' "$IDP_ISS")
code=$(post auth/google "{\"idToken\":\"$NONE\"}")
check "alg:none -> 401" 401 "$code"
# The classic key-confusion attack: take the PUBLIC key the server publishes
# and use it as an HMAC secret. A verifier that trusts the token's own alg
# header accepts it; ours pins RS256 before it looks at anything else. Note
# this asserts the ENDPOINT's answer, not that pin specifically: jsonwebtoken
# itself refuses an HMAC verify against key material it can parse as a public
# key, so the check stays green with the pin removed (QA mutation). The pin is
# defence in depth on top of the library.
HS=$(node -e '
const crypto=require("crypto");
const jwt=require("jsonwebtoken");
const jwk=JSON.parse(process.argv[2]).keys[0];
const pem=crypto.createPublicKey({key:jwk,format:"jwk"}).export({type:"spki",format:"pem"});
console.log(jwt.sign({iss:process.argv[1]+"/google",aud:"ios-client.apps.googleusercontent.com",sub:"alg-hs",email:"alg@example.com",email_verified:true},pem,{algorithm:"HS256",keyid:"pati-dev-key",expiresIn:"10m"}));
' "$IDP_ISS" "$(curl -s "$IDP/google/keys")")
code=$(post auth/google "{\"idToken\":\"$HS\"}")
check "HS256 signed with the real public key -> 401" 401 "$code"

echo "9. GET /users/me reports how the account authenticates"
ME=$(curl -s "$API/users/me" -H "Authorization: Bearer $JWT1")
echo "      hasPassword=$(node -pe "JSON.parse(process.argv[1]).hasPassword" "$ME") authProviders=$(node -pe "JSON.stringify(JSON.parse(process.argv[1]).authProviders)" "$ME")"
check "hasPassword false" "false" "$(node -pe "JSON.parse(process.argv[1]).hasPassword" "$ME")"
check "both providers listed" '["apple","google"]' "$(node -pe "JSON.stringify(JSON.parse(process.argv[1]).authProviders)" "$ME")"

echo "10. A grandfathered password account links a provider only WITH its password"
# Accounts from before e-mail verification were never proven to own their
# address (anyone could register on someone else's), so linking on the e-mail
# alone would put the real owner inside an account the squatter holds a
# password for. The password proves the account (owner decision, 2026-09-04:
# link with confirmation, not automatically). In development registration is
# pending (the dev mail transport prints the code), so the row is turned into
# a grandfathered one the way the verification harness does.
grandfather() { # user id — pending → off, unproven (email-verification-check/backdate.js)
  node scripts/email-verification-check/backdate.js "$1" grandfather >/dev/null || {
    echo "  FAIL  could not grandfather user $1 — the check below would test the wrong rule"; FAILED=1; }
}
PMAIL="s7-pw-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Şifreli Üye\",\"email\":\"$PMAIL\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
PUID=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
grandfather "$PUID"
GT2=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"web-client.apps.googleusercontent.com\",\"sub\":\"google-sub2-$STAMP\",\"email\":\"$PMAIL\",\"email_verified\":true}")
minted "link google token was minted" "$GT2"
code=$(post auth/google "{\"idToken\":\"$GT2\"}")
check "without a password -> 409" 409 "$code"
contains "…and the body says a password is needed" "linkRequiresPassword" "$(body)"
code=$(post auth/google "{\"idToken\":\"$GT2\",\"password\":\"yanlis-parola\"}")
check "wrong password -> 403, nothing linked" 403 "$code"
code=$(post auth/login "{\"email\":\"$PMAIL\",\"password\":\"parola1234\"}")
check "the account is untouched so far -> 200" 200 "$code"
PJWT=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).token")
PME=$(curl -s "$API/users/me" -H "Authorization: Bearer $PJWT")
check "no provider attached yet" '[]' "$(node -pe "JSON.stringify(JSON.parse(process.argv[1]).authProviders)" "$PME")"
code=$(post auth/google "{\"idToken\":\"$GT2\",\"password\":\"parola1234\"}")
check "right password -> 200 into the same account" 200 "$code"
check "same user id" "$PUID" "$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user?.id ?? 'none'")"
PME=$(curl -s "$API/users/me" -H "Authorization: Bearer $PJWT")
check "google now attached" '["google"]' "$(node -pe "JSON.stringify(JSON.parse(process.argv[1]).authProviders)" "$PME")"
check "…and it still has its password" "true" "$(node -pe "JSON.parse(process.argv[1]).hasPassword" "$PME")"
# The account is proven now: a second provider must link without a password.
AT2=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/apple\",\"aud\":\"com.oguzpancuk.pati\",\"sub\":\"apple-sub2-$STAMP\",\"email\":\"$PMAIL\",\"email_verified\":\"true\"}")
minted "second-provider apple token was minted" "$AT2"
code=$(post auth/apple "{\"identityToken\":\"$AT2\"}")
check "a second provider afterwards -> 200, no password asked" 200 "$code"
check "same user id again" "$PUID" "$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user?.id ?? 'none'")"

echo "10b. …and the rule survives capitalisation"
# Providers always report a lower-cased e-mail. Matching users.email exactly
# meant anyone who typed a capital at registration silently got a second,
# empty account instead of the 409 above (review reproduced it).
CMAIL_TYPED="S7-Case-$STAMP@Example.com"
CMAIL_LOWER=$(printf '%s' "$CMAIL_TYPED" | tr '[:upper:]' '[:lower:]')
code=$(post auth/register "{\"name\":\"Büyük Harfli\",\"email\":\"$CMAIL_TYPED\",\"password\":\"parola1234\"}")
check "register with capitals -> 201" 201 "$code"
CUID=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
grandfather "$CUID"
# Registration lower-cases the address, so the row this rule exists for — one
# stored with capitals, from before normalisation — has to be recreated
# directly. Without this the assertion below passes even with the fix
# reverted (review finding).
node scripts/social-auth-check/set-email.js "$CUID" "$CMAIL_TYPED" >/dev/null || {
  echo "  FAIL  could not restore the mixed-case row — the check below would be vacuous"
  FAILED=1
}
GT3=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"web-client.apps.googleusercontent.com\",\"sub\":\"case-sub-$STAMP\",\"email\":\"$CMAIL_LOWER\",\"email_verified\":true}")
code=$(post auth/google "{\"idToken\":\"$GT3\"}")
check "lower-cased provider e-mail -> 409, not a duplicate" 409 "$code"
code=$(post auth/login "{\"email\":\"$CMAIL_TYPED\",\"password\":\"parola1234\"}")
check "the account still logs in as typed -> 200" 200 "$code"
check "…and it is the same account" "$CUID" "$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")"

echo "10c. …and picks the row the typed address names, out of a case-variant pair"
# The tie-break only matters when TWO rows match case-insensitively, which is
# legal because users_email_key is case-sensitive. With one row, LIMIT 1
# returns it under either ordering — the check above passed with the tie-break
# deleted (review finding). Both accounts share a password on purpose: then the
# only thing that can tell them apart is which id comes back.
PAIR_LOWER="s7-pair-$STAMP@example.com"
PAIR_MIXED="S7-Pair-$STAMP@Example.com"
code=$(post auth/register "{\"name\":\"Küçük\",\"email\":\"$PAIR_LOWER\",\"password\":\"parola1234\"}")
check "first account -> 201" 201 "$code"
LOWER_ID=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
code=$(post auth/register "{\"name\":\"Büyük\",\"email\":\"other-$STAMP@example.com\",\"password\":\"parola1234\"}")
check "second account -> 201" 201 "$code"
MIXED_ID=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
node scripts/social-auth-check/set-email.js "$MIXED_ID" "$PAIR_MIXED" >/dev/null || {
  echo "  FAIL  could not build the case-variant pair — the checks below would be vacuous"
  FAILED=1
}
code=$(post auth/login "{\"email\":\"$PAIR_MIXED\",\"password\":\"parola1234\"}")
check "typing the capitalised address -> 200" 200 "$code"
check "…returns the capitalised row" "$MIXED_ID" "$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")"
code=$(post auth/login "{\"email\":\"$PAIR_LOWER\",\"password\":\"parola1234\"}")
check "typing the lower-cased address -> 200" 200 "$code"
check "…returns the lower-cased row" "$LOWER_ID" "$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")"

echo "10d. …and links into the PROVEN row of a pair, not the older password one"
# findByEmail orders by email_verified first. Production cannot produce this
# pair (registration and social sign-in each refuse the other's address), so
# it is built by hand: a verified social account, then an older-looking
# password row re-cased onto the same address. A second provider for the
# social user must land in that account — ORDER BY id alone would hand back
# the password row and answer 409 "use your password" for a password that is
# not theirs. All 37 earlier assertions stayed green with that ordering
# removed (review finding).
PROVEN="s7-proven-$STAMP@example.com"
# The password row is created FIRST so it carries the lower id: that is the
# only arrangement in which ORDER BY id and ORDER BY email_verified disagree.
code=$(post auth/register "{\"name\":\"Eski Şifreli\",\"email\":\"stale-$STAMP@example.com\",\"password\":\"parola1234\"}")
check "older password account -> 201" 201 "$code"
STALE_ID=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
grandfather "$STALE_ID"
GT4=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"proven-google-$STAMP\",\"email\":\"$PROVEN\",\"email_verified\":true}")
minted "proven-pair google token was minted" "$GT4"
code=$(post auth/google "{\"idToken\":\"$GT4\"}")
check "newer social account -> 201" 201 "$code"
PROVEN_ID=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
node scripts/social-auth-check/set-email.js "$STALE_ID" "S7-Proven-$STAMP@Example.com" >/dev/null || {
  echo "  FAIL  could not build the proven/unproven pair — the check below would be vacuous"
  FAILED=1
}
AT4=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/apple\",\"aud\":\"com.oguzpancuk.pati\",\"sub\":\"proven-apple-$STAMP\",\"email\":\"$PROVEN\",\"email_verified\":\"true\"}")
minted "proven-pair apple token was minted" "$AT4"
code=$(post auth/apple "{\"identityToken\":\"$AT4\"}")
check "second provider -> 200, not 409" 200 "$code"
check "…into the social account" "$PROVEN_ID" "$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user?.id ?? 'none'")"

echo "11. Account deletion re-authenticates with the provider"
code=$(curl -s -o /tmp/s7-body.json -w '%{http_code}' -X DELETE "$API/users/me" -H "Authorization: Bearer $JWT1" -H 'Content-Type: application/json' -d '{}')
check "no proof -> 400" 400 "$code"
FOREIGN=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"somebody-else-$STAMP\",\"email\":\"other-$STAMP@example.com\",\"email_verified\":true}")
code=$(curl -s -o /tmp/s7-body.json -w '%{http_code}' -X DELETE "$API/users/me" -H "Authorization: Bearer $JWT1" -H 'Content-Type: application/json' -d "{\"provider\":\"google\",\"identityToken\":\"$FOREIGN\"}")
check "someone else's valid token -> 403" 403 "$code"
code=$(curl -s -o /tmp/s7-body.json -w '%{http_code}' -X DELETE "$API/users/me" -H "Authorization: Bearer $JWT1" -H 'Content-Type: application/json' -d "{\"provider\":\"google\",\"identityToken\":\"$TOKEN\"}")
check "own token -> 200" 200 "$code"

echo "12. After deletion the same Google identity gets a FRESH account"
code=$(post auth/google "{\"idToken\":\"$TOKEN\"}")
check "-> 201" 201 "$code"
NEWID=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
if [ "$NEWID" = "$UID1" ]; then echo "  FAIL  walked back into the deleted account"; FAILED=1; else echo "  PASS  new account $NEWID (deleted $UID1 is unreachable)"; fi

echo
[ "$FAILED" = 0 ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $FAILED
