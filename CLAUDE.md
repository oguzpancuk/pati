# pati — Claude Code için proje notları

Sokak hayvanlarının bakımını koordine eden mobil uygulama. Harita üzerinde
mama/su bırakılan noktalar, hayvan profilleri, sağlık kaydı, rozet ve sıralama.

Bu dosya her oturumda otomatik yükleniyor; **kısa tutun.** Ayrıntı burada değil,
`docs/` altında:

| Konu | Dosya |
| --- | --- |
| Projenin bütünü | [docs/PROJE.md](docs/PROJE.md) |
| Kalan işler, karar bekleyenler | [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md) |
| Tasarım sistemi | [docs/TASARIM.md](docs/TASARIM.md) |
| **Kararların gerekçesi, bilinen sınırlar, ortam tuzakları** | [docs/NOTLAR.md](docs/NOTLAR.md) |

Bir karar verip gerekçesini bir yere yazmanız gerekiyorsa yeri `docs/NOTLAR.md`.

## Depo

```
backend/   Node.js + Express, PostgreSQL 16 + PostGIS, JWT + bcrypt
mobile/    React Native 0.74 + TypeScript  ← ana uygulama
admin/     React 18 + Vite + TypeScript (yönetim paneli)
```

## Zarar vermemek için bilinmesi gerekenler

- **PostGIS taşıyıcı bir bileşen, süs değil.** Uygulamanın çekirdeği coğrafi
  sorgu: `ST_DWithin` ile "100 m içinde bakım var mı", `ST_MakeEnvelope` ile
  harita penceresi, GIST indeksleri. Başka bir veritabanına geçme önerisi
  gelirse önce bunun bedelini söyleyin.
- **Mobil taraf React Native**, web React değil. Web React yalnızca `admin/`.
- **Tek migrasyon dosyası** (`backend/migrations/001_init.sql`). Artımlı
  migrasyon yok; şema değişince veritabanı sıfırlanıyor. `CREATE TABLE IF NOT
  EXISTS` mevcut tabloda sessizce hiçbir şey yapmaz — kolon eklerken dikkat.
- **`users.avatar_url` iki şey tutuyor**: yüklenmiş fotoğrafın adresi ya da
  `pati-avatar:f3` gibi hazır avatar anahtarı (bkz. `backend/src/utils/avatars.js`).
  Doğrudan `<img src>` / `<Image uri>` içine koymayın; mobilde `ui/Avatar` bunu
  zaten ayırt ediyor.
- **Sözlük iki yerde kopya**: `backend/src/utils/taxonomy.js` ve
  `mobile/src/taxonomy.ts` (desen, renk, hastalık, yaralanma, aşı listeleri).
  Birini değiştiren diğerini de değiştirir; sunucu doğrulamayı istemciye
  bırakamaz.

## Doğrulama

```bash
cd mobile   && npx tsc --noEmit && npx jest && npx react-native bundle \
  --platform ios --dev false --entry-file index.js --bundle-output /tmp/b.js
cd admin    && npx tsc --noEmit && npm run build
cd backend  && node -e "require('./src/app.js')"   # test yok, aşağıya bakın
```

**Backend'de otomatik test yok.** Değişiklikler elle curl ile doğrulanıyor.
Test yazılması yol haritasında; bir backend değişikliği yaptıysanız uçtan uca
doğrulamayı gerçekten çalıştırın, "muhtemelen çalışır" demeyin.

## Yazım kuralları

- **Kullanıcıya görünen her metin ve tüm dokümanlar Türkçe.** Commit mesajları
  da Türkçe, gövdesinde *neden* yazılır.
- Yorumlar "ne yaptığını" değil **"neden böyle yapıldığını"** anlatır.

### Mobil arayüz (ayrıntı: docs/TASARIM.md)

- Stil sayfası **`makeStyles(({ colors: c }) => ({...}))`**, asla
  `StyleSheet.create` — karanlık modda renkler donar.
- **`fontWeight` yazmayın.** Ağırlık dosya seçimiyle geliyor
  (`fontFamily: 'Nunito-Bold'`); ikisi birlikte Android'de sahte kalın üretir.
- **`fontSize` ezerken `lineHeight` de verin.** Yalnız biri verilirse iOS yazıyı
  kırpar (giriş ekranındaki logo bu yüzden bozulmuştu).
- Ekran dosyalarında **hex renk yok**; hepsi `src/theme/` altından.
- Emoji yerine `components/brand/Icon`. Rozet madalyonları ve seviye amblemleri
  de artık SVG: `components/badges/{BadgeSymbol,LevelMark}`.

## Geliştirme ortamı tuzakları

- `npm install` sonrası **`pod install` şart** (native bağımlılıklar var).
- **Font ve uygulama ikonu değişiklikleri native build ister** — Metro'yu
  yeniden başlatmak yetmez, `npm run ios` / `npm run android` gerekir.
- Android emülatörü backend'e `10.0.2.2:3000` üzerinden bağlanır.
- Seed script iki kere çalışmaz; sıfırdan üretmek için veritabanını sıfırlayın.

## Çalışma şekli

- `main` üzerinde çalışılıyor, PR akışı yok. Commit + push serbest.
- Ekran görüntüsü ya da görsel çıktı üretilebiliyorsa üretin — bu projede
  gözle görülmeyen hatalar (kırpılma, kayma) testlerden kaçıyor.

## Kalıcı hatırlatma

🚀 **Yayına çıkma sprint'i.** Her büyük iş bitiminde kullanıcıya hatırlatın:
fotoğrafların nesne depolamaya taşınması, artımlı migrasyon, rate limit,
moderasyon, KVKK metinleri, deploy ve pilot. Ayrıntı
[docs/YOL_HARITASI.md](docs/YOL_HARITASI.md) içinde. Bu, kullanıcının açıkça
istediği bir hatırlatma — atlanmaması gerekiyor.
