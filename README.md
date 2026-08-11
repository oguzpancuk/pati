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
- İnteraktif harita ve bölge sistemi (yeşil/sarı/kırmızı durum kodlaması)
- Mama/Su ekleme ve takibi
- Hayvan profili oluşturma (manuel)
- Hayvan sağlık ve ilaç kaydı
- Basit bildirim sistemi

## Başlarken

### Backend

```bash
cd backend
cp .env.example .env   # veritabanı bağlantı bilgilerini doldurun
npm install
npm run migrate        # PostGIS şemasını oluşturur
npm run dev
```

Bölge durumu (yeşil/sarı/kırmızı), o bölgedeki en son mama/su/görüldü aksiyonunun ne
kadar eski olduğuna göre `GET /api/regions` çağrılarında anlık hesaplanır. Bir bölge 24
saattir aksiyon almadığında "Kırmızı" bildirimlerinin gönderilmesi için aşağıdaki script'in
periyodik olarak (örn. saatte bir cron ile) çalıştırılması gerekir:

```bash
npm run check-regions
```

### Mobile

```bash
cd mobile
npm install
npm run android   # veya npm run ios
```
