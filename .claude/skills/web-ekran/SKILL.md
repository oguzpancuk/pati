---
name: web-ekran
description: Web PWA'nın bir sayfasını (yerel Vite ya da canlı pati-app.com) telefon boyutunda ekran görüntüsüne al, konsol hatalarını raporla ve gözle doğrula. "web'de bak", "canlıdaki sayfayı göster" denince kullan.
---

# Web ekran görüntüsü

Script: `web/scripts/shot.mjs` (playwright, `web/` devDependency; chromium yoksa
`cd web && npx playwright install chromium`).

```bash
cd web && node scripts/shot.mjs http://localhost:5175/hayvanlar/12 "$CLAUDE_JOB_DIR/tmp/web.png" <eposta> <sifre>
cd web && node scripts/shot.mjs https://pati-app.com/profil "$CLAUDE_JOB_DIR/tmp/canli.png" <eposta> <sifre>
```

- E-posta/şifre verilirse API'den giriş yapıp token'ı localStorage'a yazar;
  vermezsen giriş ekranı çıkar. Şifreyi kullanıcıdan iste, sohbete yazma.
- Çıktıdaki `hatalar:` satırı konsol/pageerror özetidir — "yok" olmalı.
- PNG'yi `Read` ile aç, gözle değerlendir; yalnız "200 döndü" yetmez.
- Yerel Vite `localhost:5175`; canlı `https://pati-app.com`, yönetim paneli
  `https://admin.pati-app.com` (giriş aynı hesapla).
