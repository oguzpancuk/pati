#!/bin/zsh
# Writes a session obtained from the backend into the app on the running
# simulator (skipping the login screen by hand). The backend must be running
# on localhost:3000.
#   mobile/scripts/simulator-login.sh email password
set -e
EMAIL="$1"; PASS="$2"; API="${API_URL:-http://localhost:3000}"
RESP=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
D=$(xcrun simctl list devices booted -j | node -pe 'Object.values(JSON.parse(require("fs").readFileSync(0)).devices).flat().find(d=>d.state==="Booted").udid')
C=$(xcrun simctl get_app_container "$D" com.patiapp data)
M="$C/Library/Application Support/com.patiapp/RCTAsyncLocalStorage_V1/manifest.json"
mkdir -p "$(dirname "$M")"; [ -f "$M" ] || echo '{}' > "$M"
node -e 'const [f,r]=process.argv.slice(1);const fs=require("fs");const d=JSON.parse(r);if(!d.token){console.error("login failed:",r);process.exit(1)};const m=JSON.parse(fs.readFileSync(f));m.token=d.token;m.user=JSON.stringify(d.user);fs.writeFileSync(f,JSON.stringify(m));console.log("session written:",d.user.email)' "$M" "$RESP"
xcrun simctl terminate "$D" com.patiapp 2>/dev/null || true
xcrun simctl launch "$D" com.patiapp >/dev/null && echo "app restarted"
