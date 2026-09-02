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
echo "      $(body)"

echo "5. Token minted for another app (wrong aud) is refused"
BAD=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"someone-elses-app.apps.googleusercontent.com\",\"sub\":\"attacker\",\"email\":\"$GMAIL\",\"email_verified\":true}")
code=$(post auth/google "{\"idToken\":\"$BAD\"}")
check "wrong audience -> 401" 401 "$code"

echo "6. Token signed with an unpublished key is refused"
ROGUE=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"$GSUB\",\"email\":\"$GMAIL\",\"email_verified\":true}" --data-urlencode "rogue=1")
code=$(post auth/google "{\"idToken\":\"$ROGUE\"}")
check "bad signature -> 401" 401 "$code"

echo "7. Expired token is refused"
EXP=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"$GSUB\",\"email\":\"$GMAIL\",\"email_verified\":true,\"expiresIn\":\"-60s\"}")
code=$(post auth/google "{\"idToken\":\"$EXP\"}")
check "expired -> 401" 401 "$code"

echo "8. UNVERIFIED e-mail may not take over an existing account"
UNV=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"ios-client.apps.googleusercontent.com\",\"sub\":\"impostor-$STAMP\",\"email\":\"$GMAIL\",\"email_verified\":false}")
code=$(post auth/google "{\"idToken\":\"$UNV\"}")
check "-> 409, address already registered" 409 "$code"
UID4=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user?.id ?? 'none'")
if [ "$UID4" = "$UID1" ]; then echo "  FAIL  unverified e-mail took over account $UID1"; FAILED=1; else echo "  PASS  no session issued ($UID4)"; fi

echo "9. GET /users/me reports how the account authenticates"
ME=$(curl -s "$API/users/me" -H "Authorization: Bearer $JWT1")
echo "      hasPassword=$(node -pe "JSON.parse(process.argv[1]).hasPassword" "$ME") authProviders=$(node -pe "JSON.stringify(JSON.parse(process.argv[1]).authProviders)" "$ME")"
check "hasPassword false" "false" "$(node -pe "JSON.parse(process.argv[1]).hasPassword" "$ME")"
check "both providers listed" '["apple","google"]' "$(node -pe "JSON.stringify(JSON.parse(process.argv[1]).authProviders)" "$ME")"

echo "10. A password account gains a provider on verified-e-mail sign-in"
PMAIL="s7-pw-$STAMP@example.com"
code=$(post auth/register "{\"name\":\"Şifreli Üye\",\"email\":\"$PMAIL\",\"password\":\"parola1234\"}")
check "register -> 201" 201 "$code"
PUID=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")
GT2=$(curl -sG "$IDP/mint" --data-urlencode "claims={\"iss\":\"$IDP_ISS/google\",\"aud\":\"web-client.apps.googleusercontent.com\",\"sub\":\"google-sub2-$STAMP\",\"email\":\"$PMAIL\",\"email_verified\":true}")
code=$(post auth/google "{\"idToken\":\"$GT2\"}")
check "google -> 200 into the same account" 200 "$code"
check "same user id" "$PUID" "$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/s7-body.json')).user.id")"
code=$(post auth/login "{\"email\":\"$PMAIL\",\"password\":\"parola1234\"}")
check "password still works after linking -> 200" 200 "$code"

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
