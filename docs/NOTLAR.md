# Teknik Notlar, Kararlar ve Bilinen Sınırlar

Bu dosya geliştirme sırasında verilen kararların **gerekçelerini** ve bilerek
ertelenen konuları tutar. Amaç: altı ay sonra "burası neden böyle yapılmış?"
sorusunun cevabının kaybolmaması ve üretime çıkmadan önce kapatılması gereken
maddelerin unutulmaması.

Yeni bir karar verdiğinizde veya bir sınırı bilerek kabul ettiğinizde buraya
bir satır ekleyin.

---

## 1. Ürün kararları ve gerekçeleri

### Mesafe toleransı 20 metre
Başlangıçta 10m'ydi. Şehir içinde tipik GPS hassasiyeti 5–20m arasında
değişiyor; 10m sınırı gerçekten mama bırakan dürüst kullanıcıları da
engelliyordu. 20m hâlâ fiilen o noktaya gitmeyi gerektiriyor ama hassasiyet
kaynaklı yanlış retleri ortadan kaldırıyor.
`backend/src/controllers/care.controller.js` → `MAX_DISTANCE_TO_PIN_METERS`
(mobil tarafta aynı sabit `mobile/src/screens/MapScreen.tsx` içinde — **iki
yerde tanımlı, birini değiştirirken diğerini de değiştirin**).

### Solma süresi ile uyarı süresi aynı tutuldu
Mama 4 saat, su 6 saat. Haritadaki yeşil alanın solma süresi ile "bu bölgede
bakım eksik" uyarısının penceresi bilerek aynı: farklı olsalardı harita
yeşilken uyarı çıkması gibi tutarsızlıklar oluşuyordu. Mama daha çabuk
tükeniyor/bozuluyor, su daha uzun süre işe yarıyor — süre farkı buradan
geliyor.

Pencere **satır bazında** hesaplanıyor (`WINDOW_HOURS_SQL` içindeki `CASE`),
böylece mama ve su kayıtları aynı sorguda listelense bile her biri kendi
hızında soluyor.

### Rozet bir kere kazanılınca düşmüyor
Aktif seri bozulsa bile kademe düşmüyor; puan en yüksek ulaşılan kademeden
geliyor. Gerekçe: rozet sistemi ceza değil ödül mekanizması; seriyi kaybeden
kullanıcının profilinin fakirleşmesi motivasyonu kırıyor.

### Yorum puanı genişliğe göre ağırlıklı
Hayvan başına en fazla 5 yorum sayılıyor (yorum başına 1 puan) ve yorum yapılan
**farklı** hayvan başına 3 puan veriliyor. Gerekçe: düz "yorum başına 1 puan"
olsaydı tek hayvana 500 yorum atmak liderlik tablosunu kırardı. Bu formül
genişliği (çok hayvanla ilgilenmeyi) tekrar yorumdan daha değerli kılıyor.
`backend/src/utils/badges.js` → `commentPoints()`.

### Hastalık durumu saklanmıyor, türetiliyor
Sağlık kaydının durumu (`not_started` / `in_treatment` / `recovered`) ayrı bir
kolonda tutulmuyor; yorum var mı ve `recovered_at` dolu mu sorularından SQL
içinde türetiliyor. Gerekçe: saklansaydı yorum eklendiğinde/silindiğinde
güncellenmeyi unutup gerçekle uyumsuz hale gelebilirdi. Türetilmiş değer
desenkron olamaz.

### Öne çıkan rozetler yalnızca anahtarı saklıyor
`users.featured_badges` içinde `["streak:feeder", "breed:Tekir"]` gibi
anahtarlar var, kademe bilgisi yok. Gerekçe: kullanıcı gümüşten altına
yükseldiğinde profildeki rozet kendiliğinden güncelleniyor, ayrıca bir
senkronizasyon işi gerekmiyor.

### Bildirimler cihazda hesaplanıyor, sunucuda değil
"Bu kullanıcıya bildirim gönder" demek yerine cihaz kendi konumunu alıp
`/api/care-actions/status` sorguyor. Gerekçe: kullanıcının konumu sunucuya
sürekli gönderilmiyor; bu yaklaşım konum verisini cihazda tutuyor. Bedeli:
uygulama tamamen kapalıyken bildirim gelmiyor (bkz. Bilinen Sınırlar #6).

### Konum override'ı yalnızca `__DEV__`
`oguzpancuk@gmail.com` ve `sumeyyeayan@gmail.com` hesapları için Kadıköy'de
sabit konum döndürülüyor — yurt dışından 20m mesafe kontrolü gerektiren
akışları test edebilmek için. Prod derlemede bu dal hiç çalışmıyor.
İki konum ~250m arayla seçildi ki mükerrer hayvan tespiti de denenebilsin.

---

## 2. Teknik kararlar

### Leaderboard set-based hesaplanıyor
Kullanıcı başına sorgu atmak yerine `user_id = ANY($1)` ile tüm kullanıcılar
tek sorguda hesaplanıyor. 100 demo kullanıcıda sabit sayıda sorgu çalışıyor.
Ölçek sınırı için bkz. Bilinen Sınırlar #1.

### Seri hesabı "gaps and islands" ile
Ardışık gün serisi, `d - ROW_NUMBER()` farkının sabit kaldığı grupları sayan
klasik gaps-and-islands deseniyle çıkarılıyor. Uygulama tarafında döngü
kurmaya gerek kalmıyor.

### `react-native-maps` 1.14.0'a sabitlendi
Daha yeni sürümler React ≥ 18.3.1 istiyor, proje React 18.2.0 / RN 0.74.5
üzerinde. React/RN yükseltmeden harita kütüphanesi yükseltilemez.

### Harita etkileşimi
- Zoom `animateCamera({zoom})` ile değil `animateToRegion` (delta) ile
  yapılıyor — Apple Maps altında `animateCamera` güvenilir çalışmadı.
- Marker'a dokunulduğunda `MapView.onPress` de tetikleniyor. Android'de
  `event.nativeEvent.action === 'marker-press'` ile ayırt ediliyor, ama bu alan
  iOS'ta yok — iOS için zaman damgası tabanlı bir koruma (`MARKER_PRESS_GUARD_MS`)
  eklendi.
- Harita hazır olmadan `animateToRegion` çağrısı sessizce düşüyor; `onMapReady`
  + bekleyen merkez tekrar denemesi bu yüzden var.

### Simülatörde kamera yok
`launchCamera` simülatörde `camera_unavailable` döndürüyor. `__DEV__`
derlemelerde bu hata görüldüğünde galeriye (`launchImageLibrary`) düşülüyor;
prod'da fotoğraf zorunluluğu aynen geçerli.

### Docker imajı `imresamu/postgis:16-3.4`
Resmi `postgis/postgis` imajının arm64 sürümü yok; Apple Silicon'da emülasyonla
çalışıp uyarı veriyor. `imresamu/postgis` çoklu mimari topluluk sürümü, native
çalışıyor. Host portu 5433 seçildi çünkü 5432 Mac'lerde genelde önceden kurulu
bir PostgreSQL tarafından tutuluyor.

### 401 → otomatik çıkış
API istemcisinde bir interceptor 401 gördüğünde token'ı silip kullanıcıyı
giriş ekranına atıyor. Gerekçe: veritabanı sıfırlandığında elde kalan eski
token yüzünden uygulamanın "ne giriş yapabilir ne çıkış yapabilir" durumuna
düşmesi yaşandı.

---

## 3. Bilinen sınırlar ve teknik borç

Üretime çıkmadan önce kapatılması gerekenler. Kabaca öncelik sırasıyla:

1. **Leaderboard her istekte sıfırdan hesaplanıyor.** 100 demo kullanıcıyla
   sorunsuz (tek sorgu seti, kullanıcı başına sorgu yok), ama kullanıcı sayısı
   binlere çıkarsa her açılışta tüm rozet ve yorum tablosunu taramak
   sürdürülemez. Çözüm: puanları periyodik bir işle (cron / materialized view)
   bir tabloya yazıp oradan okumak. Şimdilik erken optimizasyon olacağı için
   yapılmadı — **ölçek büyüdüğünde ilk bakılacak yer burası.**

2. **Fotoğraflar backend'in yerel diskinde** (`backend/uploads/`, `/uploads`
   altında statik servis ediliyor). Yedeği yok, konteyner yeniden
   oluşturulunca kayboluyor, birden fazla sunucu instance'ı ile çalışmıyor.
   Üretim için S3 / R2 / GCS + CDN şart. Yükleme boyutu 10MB ile sınırlı ama
   **görseller yeniden boyutlandırılmıyor** — her fotoğraf tam boyutta
   saklanıyor ve indiriliyor.

3. **Tek migrasyon dosyası** (`001_init.sql`). Artımlı migrasyon yok; şema
   değişince veritabanını sıfırlamak gerekiyor. Gerçek kullanıcı verisi
   girmeden önce bir migrasyon aracına (node-pg-migrate, Knex vb.) geçilmeli.

4. **Fotoğraf kanıtı doğrulanmıyor.** Kullanıcı herhangi bir fotoğraf çekip
   mama bıraktığını iddia edebilir; yalnızca konum mesafesi kontrol ediliyor.
   Ayrıca hız limiti (rate limit) yok — bir kullanıcı dakikada yüzlerce kayıt
   girebilir. Moderasyon (admin panelinde fotoğraf inceleme) ve rate limit
   gerekiyor.

5. **Otomatik test kapsamı çok düşük.** Mobilde tek bir test (AuthContext),
   backend'de hiç otomatik test yok — doğrulama curl ile uçtan uca manuel
   yapıldı. CI de yok. Backend'e en azından auth, care-action mesafe kontrolü,
   rozet hesaplama ve leaderboard sıralaması için test yazılmalı.

6. **Bildirimler yalnızca uygulama çalışırken geliyor.** 30 dakikalık zamanlayıcı
   + uygulama öne geldiğinde kontrol var; iOS uygulamayı arka planda bir süre
   sonra askıya aldığı için gerçek anlamda "kapalıyken" bildirim gelmiyor.
   Çözüm: sunucu tarafı push (APNs/FCM) veya işletim sistemi geofencing'i.

7. **JWT iptal edilemiyor.** Süresi 7 gün (`JWT_EXPIRES_IN`), ama çıkış
   yapıldığında veya hesap askıya alındığında token sunucu tarafında
   geçersizleştirilemiyor. Admin panelinde "kullanıcıyı banla" özelliği
   gelecekse bir refresh-token / denylist mekanizması gerekecek.

8. **`MAX_DISTANCE_TO_PIN_METERS` iki yerde tanımlı** (backend + mobil).
   Ortak bir yapılandırma uç noktasından okunması daha doğru olur.

9. **Rol kavramı yok.** `users` tablosunda `role` kolonu yok; admin paneli için
   eklenmesi gerekecek (bkz. `YOL_HARITASI.md` madde 5).

10. **Konum override kodu repoda.** `__DEV__` ile korunuyor ama üretime
    çıkmadan önce tamamen kaldırılmalı (`mobile/src/location.ts`).

11. **CORS herkese açık** (`app.use(cors())`). Üretimde origin kısıtlanmalı.

---

## 4. Geliştirme ortamı tuzakları

Daha önce vakit kaybettiren, tekrar karşılaşılabilecek durumlar:

- **`npm install` sonrası `pod install` şart.** Native bağımlılık (konum,
  kamera, bildirim) eklendiği için atlanırsa "The package '...' doesn't seem to
  be linked" hatası alınır.
- **Xcode `unable to attach DB: database is locked`**: DerivedData silmek
  yetmiyor, `~/Library/Caches/com.apple.dt.XCBuild` ve
  `~/Library/Caches/com.apple.dt.Xcode` de silinmeli.
- **macOS'un sistem Ruby'si (2.6.x) CocoaPods için çok eski** — Homebrew Ruby
  gerekiyor.
- **`EADDRINUSE :::3000`**: eski bir `nodemon` süreci ayakta kalmış oluyor.
- **Android emülatörü `localhost`'u kendi üzerinde arar** — backend'e
  `10.0.2.2:3000` üzerinden bağlanılıyor. Demo verisini Android'de test
  edecekseniz `PUBLIC_BASE_URL=http://10.0.2.2:3000 npm run seed`.
- **Google Maps API key yalnızca Android için gerekli**; iOS Apple Maps
  kullandığı için anahtarsız çalışıyor.
- **Seed script iki kere çalışmaz** — mevcut demo veriyi görünce durur.
  Sıfırdan üretmek için veritabanını sıfırlayıp `npm run migrate && npm run seed`.
