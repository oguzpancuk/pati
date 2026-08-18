---
description: Ortamı ayağa kaldır ve uygulamayı iOS simülatöründe başlat
---

Geliştirme ortamını uçtan uca ayağa kaldır:

1. `git pull` — uzak oturumun push'ları gelmiş olabilir. `package.json` ya da
   `Podfile.lock` değiştiyse `npm install` ve `cd ios && pod install` koş;
   değişmediyse atla.
2. PostgreSQL çalışmıyorsa başlat; `cd backend && npm run migrate` gerektiyse
   koş (şema dosyası değiştiyse).
3. Backend'i başlat: `cd backend && npm run dev` (arka planda tut).
4. Taze demo verisi istersen `npm run seed` — DİKKAT: tüm veriyi siler,
   çalıştırmadan önce bana sor.
5. Uygulamayı başlat: `cd mobile && npm run ios`.

Metro ya da build hata verirse: hatayı oku, kök nedeni tek cümleyle söyle,
CLAUDE.md'deki "geliştirme ortamı tuzakları" bölümüne bak (pod install,
native rebuild, DerivedData) ve düzeltmeyi uygula. Simülatör açılınca hangi
ekranın geldiğini söyleyip dur.
