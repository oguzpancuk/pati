#!/bin/zsh
# Writes a session obtained from the backend into the app on the running
# simulator (skipping the login screen by hand). The backend must be running
# on localhost:3000.
#   mobile/scripts/simulator-login.sh email password
#
# It also parks the simulator at Kadikoy, where the seeded demo world is,
# so the map and the "near me" lists have something in them. The app used
# to do this itself for a handful of hard-coded accounts; that override was
# removed before launch (NOTES section 3.11), and the OS is the right place
# for a fake location anyway. Override with SIM_LOCATION="lat,lng", or
# "none" to leave the device's own location alone.
set -e
EMAIL="$1"; PASS="$2"; API="${API_URL:-http://localhost:3000}"
SIM_LOCATION="${SIM_LOCATION:-40.9905,29.0277}"
RESP=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
D=$(xcrun simctl list devices booted -j | node -pe 'Object.values(JSON.parse(require("fs").readFileSync(0)).devices).flat().find(d=>d.state==="Booted").udid')
C=$(xcrun simctl get_app_container "$D" com.oguzpancuk.pati data)
M="$C/Library/Application Support/com.oguzpancuk.pati/RCTAsyncLocalStorage_V1/manifest.json"
mkdir -p "$(dirname "$M")"; [ -f "$M" ] || echo '{}' > "$M"
node -e 'const [f,r]=process.argv.slice(1);const fs=require("fs");const d=JSON.parse(r);if(!d.token){console.error("login failed:",r);process.exit(1)};const m=JSON.parse(fs.readFileSync(f));m.token=d.token;m.user=JSON.stringify(d.user);fs.writeFileSync(f,JSON.stringify(m));console.log("session written:",d.user.email)' "$M" "$RESP"
# Older Xcode command-line tools have no `simctl location`; the session is
# still usable without it, so this is a warning, not a failure.
if [ "$SIM_LOCATION" != none ]; then
  xcrun simctl location "$D" set "$SIM_LOCATION" 2>/dev/null \
    && echo "location set: $SIM_LOCATION" \
    || echo "warning: could not set the simulator location (needs Xcode 14+)"
  # And try to grant when-in-use, so a screenshot run does not stop on the
  # system sheet. On iOS 26 the grant does not always stick for a freshly
  # installed build — if the sheet still appears, tap "Uygulamayi
  # Kullanirken Izin Ver" once and it stays granted for that install.
  xcrun simctl privacy "$D" grant location com.oguzpancuk.pati 2>/dev/null \
    && echo "location permission granted" \
    || echo "warning: could not grant the location permission"
fi
xcrun simctl terminate "$D" com.oguzpancuk.pati 2>/dev/null || true
xcrun simctl launch "$D" com.oguzpancuk.pati >/dev/null && echo "app restarted"
