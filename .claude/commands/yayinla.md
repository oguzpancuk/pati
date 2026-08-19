---
description: main'in son halini canlıya al ve canlıdan kanıtla (Operasyon işi)
---

`main`'i üretime çıkar ve **kanıtla**. "Deploy bitti" demek yetmez; iş, canlı
adreste yeni sürümün göründüğü kanıtlanınca biter.

1. `git pull --rebase` — uzak oturumun push'ları gelmiş olabilir.
2. `fly deploy` (kökten; imaj web+admin dist'lerini kendisi derler).
3. Doğrula — üçü de zorunlu:
   - `curl -s https://pati-app.fly.dev/health` → `{"status":"ok"}`
   - `curl -s https://pati-app.fly.dev/ | grep assets/index` → asset hash'i
     yereldeki `web/dist/index.html` ile AYNI mı? Değilse eski imaj dönüyor.
   - Tarayıcıyla giriş ekranının ekran görüntüsünü al ve bana göster.
4. Tarayıcı eski sürümü gösteriyorsa: sert yenile; ana ekrana eklenmiş PWA'da
   uygulamayı kapatıp aç (sw.js ve index.html no-cache, bir açılış yeter).
5. Sonucu tek satırla raporla: hangi commit canlıda, kontrollerin üçü de geçti mi.

Deploy başarısızsa `fly logs` oku, kök nedeni tek cümleyle söyle; düzeltme
migrasyon/sır gerektiriyorsa bana sor, kod gerektiriyorsa Geliştirici'ye
devretmek için ne push'lanması gerektiğini yaz.
