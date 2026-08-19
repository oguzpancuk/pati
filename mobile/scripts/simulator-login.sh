#!/bin/zsh
# Çalışan simülatördeki uygulamaya backend'den alınan oturumu yazar (giriş
# ekranını elle geçmeden). Backend localhost:3000'de çalışıyor olmalı.
#   mobile/scripts/simulator-login.sh eposta sifre
set -e
EMAIL="$1"; PASS="$2"; API="${API_URL:-http://localhost:3000}"
RESP=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
D=$(xcrun simctl list devices booted -j | node -pe 'Object.values(JSON.parse(require("fs").readFileSync(0)).devices).flat().find(d=>d.state==="Booted").udid')
C=$(xcrun simctl get_app_container "$D" com.patiapp data)
M="$C/Library/Application Support/com.patiapp/RCTAsyncLocalStorage_V1/manifest.json"
mkdir -p "$(dirname "$M")"; [ -f "$M" ] || echo '{}' > "$M"
node -e 'const [f,r]=process.argv.slice(1);const fs=require("fs");const d=JSON.parse(r);if(!d.token){console.error("giriş başarısız:",r);process.exit(1)};const m=JSON.parse(fs.readFileSync(f));m.token=d.token;m.user=JSON.stringify(d.user);fs.writeFileSync(f,JSON.stringify(m));console.log("oturum yazıldı:",d.user.email)' "$M" "$RESP"
xcrun simctl terminate "$D" com.patiapp 2>/dev/null || true
xcrun simctl launch "$D" com.patiapp >/dev/null && echo "uygulama yeniden başlatıldı"
