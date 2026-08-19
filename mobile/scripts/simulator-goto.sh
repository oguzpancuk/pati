#!/bin/zsh
# Çalışan iOS simülatöründe pati uygulamasını verilen derin bağlantıda
# (pati://add-animal, pati://animal/12, pati://profile …) açar ve ekran
# görüntüsü alır. iOS `simctl openurl` her seferinde "pati ile açılsın mı?"
# diye sorduğu için bağlantı, uygulamanın __DEV__ modunda okuduğu AsyncStorage
# anahtarına yazılıyor (bkz. mobile/src/navigation/index.tsx → linking).
#
#   mobile/scripts/simulator-goto.sh pati://add-animal out.png [bekleme_sn]
#
# Oturum gerekir: AsyncStorage'da token yoksa giriş ekranı açılır; token
# eklemek için simulator-login.sh kullanın.
set -e
URL="$1"; OUT="$2"; WAIT="${3:-8}"
[ -z "$URL" ] && { echo "kullanım: $0 pati://yol cikti.png [sn]"; exit 1; }
D=$(xcrun simctl list devices booted -j | node -pe 'Object.values(JSON.parse(require("fs").readFileSync(0)).devices).flat().find(d=>d.state==="Booted").udid')
C=$(xcrun simctl get_app_container "$D" com.patiapp data)
M="$C/Library/Application Support/com.patiapp/RCTAsyncLocalStorage_V1/manifest.json"
mkdir -p "$(dirname "$M")"; [ -f "$M" ] || echo '{}' > "$M"
node -e 'const [f,u]=process.argv.slice(1);const fs=require("fs");const m=JSON.parse(fs.readFileSync(f));m.devInitialUrl=u;fs.writeFileSync(f,JSON.stringify(m));' "$M" "$URL"
xcrun simctl terminate "$D" com.patiapp 2>/dev/null || true
xcrun simctl launch "$D" com.patiapp >/dev/null
sleep "$WAIT"
[ -n "$OUT" ] && xcrun simctl io "$D" screenshot "$OUT" >/dev/null 2>&1 && echo "ekran: $OUT"
