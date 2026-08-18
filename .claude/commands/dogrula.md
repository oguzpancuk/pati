---
description: Tüm doğrulama bataryasını çalıştır (mobil tsc+jest+bundle, admin build, backend yükleme)
---

Projenin tamamını doğrula ve sonucu kısa bir tablo halinde raporla. Sırasıyla:

1. `cd mobile && npx tsc --noEmit && npx jest`
2. `cd mobile && npx react-native bundle --platform ios --dev false --entry-file index.js --bundle-output /tmp/pati-bundle.js`
3. `cd admin && npx tsc --noEmit && npm run build`
4. `cd backend && node -e "require('./src/app.js')"`

Kurallar:

- Bir adım başarısız olursa DURMA — kalan adımları da çalıştır, sonunda hepsini
  birden raporla (hangi adım, hangi hata, hangi dosya).
- Hata varsa önce kök nedeni tek cümleyle açıkla, sonra düzeltme öner; benden
  onay almadan düzeltmeye başlama.
- Her şey temizse tek satır yeter: "✅ 4/4 temiz".
