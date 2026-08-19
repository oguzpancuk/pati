---
name: simulatorde-bak
description: iOS simülatöründe pati uygulamasını belirli bir ekranda açıp ekran görüntüsü al ve gözle doğrula. "simülatörde bak", "ekranı göster", "şu ekranın görüntüsünü al" denince kullan. Yalnızca Mac'teki Operasyon oturumu.
---

# Simülatörde bak

Ön koşullar: Metro (`localhost:8081`) ve backend (`localhost:3000`) ayakta,
iPhone simülatörü açık (`xcrun simctl list devices booted`). Değilse `/calistir`.

Ekranlar derin bağlantıyla açılır (`mobile/src/navigation/index.tsx` → `linking`):
`pati://map`, `pati://animals`, `pati://profile`, `pati://add-animal`,
`pati://animal/<id>`, `pati://animal/<id>?matchReview=true`, `pati://user/<id>`,
`pati://leaderboard`, `pati://friends`, `pati://comments`.

1. Oturum yoksa: `mobile/scripts/simulator-login.sh <eposta> <sifre>`
   (yerel admin: `oguzpancuk@gmail.com` — şifreyi kullanıcıdan iste, yazma).
2. `mobile/scripts/simulator-goto.sh pati://<yol> "$CLAUDE_JOB_DIR/tmp/ekran.png" 8`
3. PNG'yi `Read` ile aç ve GÖZLE değerlendir: kırpılma, kayma, boş ekran,
   yanlış metin. Bu projede görsel hatalar testten kaçar — bakmadan "tamam" deme.
4. Animasyon/sayfalama gibi akış doğrulaması gerekirse geçici yama yapma;
   gereken veriyi API/DB'den üret, ekranı yeniden aç.

Not: derin bağlantı her zaman sekmelerin üstüne açılır (geri tuşu vardır).
Kaydırma yapamazsın; alt bölümler için kullanıcıdan bakmasını iste ya da
veriyi üstte görünecek şekilde kur.
