#!/bin/zsh
# Opens the pati app in the running iOS simulator at the given deep link
# (pati://add-animal, pati://animal/12, pati://profile …) and takes a
# screenshot. iOS `simctl openurl` asks "open with pati?" every time, so the
# link is written into the AsyncStorage key the app reads in __DEV__ mode
# (see mobile/src/navigation/index.tsx → linking).
#
#   mobile/scripts/simulator-goto.sh pati://add-animal out.png [wait_seconds]
#
# A session is required: without a token in AsyncStorage the login screen
# opens; use simulator-login.sh to add one.
set -e
URL="$1"; OUT="$2"; WAIT="${3:-8}"
[ -z "$URL" ] && { echo "usage: $0 pati://path out.png [seconds]"; exit 1; }
D=$(xcrun simctl list devices booted -j | node -pe 'Object.values(JSON.parse(require("fs").readFileSync(0)).devices).flat().find(d=>d.state==="Booted").udid')
C=$(xcrun simctl get_app_container "$D" com.oguzpancuk.pati data)
M="$C/Library/Application Support/com.oguzpancuk.pati/RCTAsyncLocalStorage_V1/manifest.json"
mkdir -p "$(dirname "$M")"; [ -f "$M" ] || echo '{}' > "$M"
node -e 'const [f,u]=process.argv.slice(1);const fs=require("fs");const m=JSON.parse(fs.readFileSync(f));m.devInitialUrl=u;fs.writeFileSync(f,JSON.stringify(m));' "$M" "$URL"
xcrun simctl terminate "$D" com.oguzpancuk.pati 2>/dev/null || true
xcrun simctl launch "$D" com.oguzpancuk.pati >/dev/null
sleep "$WAIT"
# An empty OUT (launch only) must not turn into exit code 1 under set -e.
if [ -n "$OUT" ]; then xcrun simctl io "$D" screenshot "$OUT" >/dev/null 2>&1 && echo "screenshot: $OUT"; fi
