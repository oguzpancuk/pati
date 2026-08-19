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
| Yayın (Fly.io) adımları | [docs/YAYIN.md](docs/YAYIN.md) |

Bir karar verip gerekçesini bir yere yazmanız gerekiyorsa yeri `docs/NOTLAR.md`.

## Depo

```
backend/   Node.js + Express, PostgreSQL 16 + PostGIS, JWT + bcrypt
mobile/    React Native 0.74 + TypeScript  ← ana uygulama
web/       React 18 + Vite PWA (kalıcı üçüncü istemci, Leaflet harita)
admin/     React 18 + Vite + TypeScript (yönetim paneli)
shared/    Web tarafı SVG üreticileri (insan + hayvan avatarları; admin ve web ortak)
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
  bırakamaz. **web/ kopya tutmaz** — `@mobile/taxonomy` ve `@mobile/avatars`
  alias'larıyla mobildeki dosyaları doğrudan import eder.
- **Avatar çizimleri iki teknolojide**: mobil react-native-svg bileşenleri
  (`mobile/src/components/avatars/`), web düz SVG string üreticileri
  (`shared/`). Yüz değişirse ikisi birlikte güncellenir.

## Doğrulama

```bash
cd mobile   && npx tsc --noEmit && npx jest && npx react-native bundle \
  --platform ios --dev false --entry-file index.js --bundle-output /tmp/b.js
cd admin    && npx tsc --noEmit && npm run build
cd web      && npx tsc --noEmit && npm run build
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
- Seed script her çalıştırmada **tüm veriyi siler** (TRUNCATE, admin dahil) ve
  taze üretir; bugünün mama/su kayıtları son 1 saate düşer ki harita canlı
  doğsun. Üretim veritabanında asla çalıştırmayın.

## Oturum rolleri (iki Claude Code çalışanı)

Aynı depoda iki oturum çalışıyor; fark **çalıştıkları yer**:

- **Operasyon** — kullanıcının Mac'inde koşan yerel oturum. Elinde: iOS
  simülatörü/Metro, Vite, Docker'daki yerel DB, Fly girişi (`fly`), Namecheap
  DNS, sırlar (`~/.config/pati/`), Claude Design senkronu (`/design-sync`).
  İşi: yerel ortamı ayakta tutmak, `main`'in son halini **canlıya almak**
  (`fly deploy`), veritabanı/seed/sertifika bakımı, çapraz kesen altyapı
  (rate limit, CORS, migrasyon). "Çalıştır / canlıya al / simülatörde bak"
  istekleri buraya.
- **Geliştirici** — claude.ai/code bulut oturumu. Depoyu görür, özellik yazar,
  kendi sandbox'ında tsc/build/Playwright ile doğrular, `main`'e push eder.
  Kullanıcının makinesine, cihazına, Fly hesabına, yerel DB'ye **erişemez**;
  cihaz/ortam gerektiren doğrulamayı Operasyon'a bırakır.

Kurallar: aynı anda aynı dosyaya iki oturum dokunmasın; devir teslim git ile
(push → "son halini canlıya al"); ortam/hesap/sır gerektiren her iş Operasyon'a.
Rol, yeteneği değil erişimi anlatır — Operasyon boşsa kod da yazar.

## Çalışma şekli

- `main` üzerinde çalışılıyor, PR akışı yok. Commit + push serbest.
- Ekran görüntüsü ya da görsel çıktı üretilebiliyorsa üretin — bu projede
  gözle görülmeyen hatalar (kırpılma, kayma) testlerden kaçıyor. Simülatörde
  ekrana doğrudan gitmek için `pati://` derin bağlantıları var:
  `xcrun simctl openurl booted pati://add-animal` (yollar:
  `mobile/src/navigation/index.tsx` → `linking`).

## Kalıcı hatırlatma

🚀 **Yayına çıkma sprint'i.** Her büyük iş bitiminde kullanıcıya hatırlatın:
fotoğrafların nesne depolamaya taşınması, artımlı migrasyon, rate limit,
moderasyon, KVKK metinleri, deploy ve pilot. Ayrıntı
[docs/YOL_HARITASI.md](docs/YOL_HARITASI.md) içinde. Bu, kullanıcının açıkça
istediği bir hatırlatma — atlanmaması gerekiyor.
