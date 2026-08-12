# Stray — Sokak Hayvanları Takip Uygulaması

Türkiye'deki sokak hayvanlarının refahını iyileştirmek için tasarlanmış bir sosyal etki
platformu. Hayvan severler, veterinerler ve aktivistlerin sokak köpekleri ve kedilerinin
beslenme, sağlık ve refah durumunu koordine etmelerini sağlar.

Ürün gereksinimleri için bkz. [docs/PRD.md](docs/PRD.md).

## Proje Yapısı

```
stray/
├── backend/    Node.js + Express API (PostgreSQL + PostGIS, JWT auth)
├── mobile/     React Native uygulaması
└── docs/       Ürün dokümantasyonu
```

## Teknik Yaklaşım

- **Frontend:** React Native
- **Backend:** Node.js + Express
- **Veritabanı:** PostgreSQL + PostGIS (coğrafi sorgular için)
- **Harita:** Leaflet + OpenStreetMap (web) / react-native-maps (mobil)
- **Kimlik doğrulama:** JWT + bcrypt

## MVP Kapsamı

- Kullanıcı kaydı ve giriş sistemi
- İnteraktif ısı haritası: kullanıcıların bıraktığı mama/su noktaları
- Konum bazlı bakım eksikliği kontrolü (500m/24 saat)
- Hayvan profili oluşturma (manuel) ve yakındaki hayvanları listeleme
- Hayvan sağlık ve ilaç kaydı

## Başlarken

### Backend

```bash
cd backend
cp .env.example .env   # veritabanı bağlantı bilgilerini doldurun
npm install
npm run migrate        # PostGIS şemasını oluşturur
npm run dev
```

Bölge/idari sınır kavramı yoktur — kullanıcılar haritada tam bir konuma "Mama Bıraktım"
veya "Su Bıraktım" aksiyonu ekler (`POST /api/care-actions`). `GET /api/care-actions`,
belirtilen konumun etrafındaki noktaları (ısı haritası için ağırlıklarıyla birlikte)
döner. `GET /api/care-actions/status?lat=&lng=` ise o konumun 500 metre yarıçapında
son 24 saatte bakım yapılıp yapılmadığını (`needsAttention`) söyler — mobil uygulama
bunu kullanıcının anlık konumuyla her harita açılışında/yenilemesinde sorgular.

> Not: Bu, projenin ilk sürümündeki bölge/bildirim tablolarının yerini almıştır. Daha
> önce migrasyonu çalıştırdıysanız veritabanınızı sıfırlayıp (`DROP SCHEMA public CASCADE;
> CREATE SCHEMA public;`) `npm run migrate`'i tekrar çalıştırmanız gerekir.

### Mobile — Emülatörde Çalıştırma

**Ön koşullar** (React Native'in [Ortam Kurulumu](https://reactnative.dev/docs/set-up-your-environment) rehberini takip edin):

- **Android:** Android Studio + en az bir AVD (Android Virtual Device) kurulu ve
  emülatör açık olmalı. `ANDROID_HOME` ortam değişkeni ayarlanmış olmalı.
- **iOS (yalnızca macOS):** Xcode kurulu olmalı, komut satırı araçları seçili olmalı,
  ve CocoaPods (`sudo gem install cocoapods` veya `bundle install`).

**Backend'i önce ayağa kaldırın** (yukarıdaki adımlarla), çünkü mobil uygulama
API'ye ihtiyaç duyar. Backend `npm run dev` ile 3000 portunda çalışırken:

```bash
cd mobile
npm install
```

**Android:**

```bash
npm run android
```

Uygulama `src/api/client.ts` içinde Android emülatöründen backend'e otomatik olarak
`10.0.2.2:3000` üzerinden bağlanacak şekilde ayarlıdır (Android emülatörü "localhost"u
kendi üzerinde arar, bu yüzden host makineye özel bir adres gerekir).

Haritanın görünmesi için bir Google Maps API anahtarına ihtiyacınız var:
1. [Google Cloud Console](https://console.cloud.google.com/)'da "Maps SDK for Android"ı etkinleştirip bir API anahtarı oluşturun.
2. `mobile/android/app/src/main/res/values/google_maps_api.xml.example` dosyasını aynı klasöre `google_maps_api.xml` olarak kopyalayın ve anahtarınızı yapıştırın (bu dosya `.gitignore`'dadır, repoya gitmez).

**iOS:**

```bash
cd ios && bundle install && bundle exec pod install && cd ..
npm run ios
```

iOS Simülatörü host makineyle ağı paylaştığı için `localhost:3000` doğrudan çalışır,
ekstra bir ayar gerekmez. Harita için de (Apple Maps kullanıldığından) API anahtarı
gerekmez.

**Gerçek bir cihazda test ediyorsanız:** `src/api/client.ts` içindeki `API_BASE_URL`
değerini bilgisayarınızın yerel ağdaki IP adresiyle (örn. `http://192.168.1.5:3000/api`)
değiştirin — cihaz "localhost"u kendi üzerinde arar.
