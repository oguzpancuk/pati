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
- Türkiye'ye odaklı harita: haritaya dokunup pin bırakarak "Mama Bıraktım" /
  "Su Bıraktım" işaretleme — fotoğraf çekimi zorunlu, kullanıcının anlık konumu
  işaretlediği pinden 20 metreden uzaksa reddedilir (şehir içinde tipik GPS
  hassasiyeti 5–20m olduğu için tolerans buna göre seçildi)
- Haritanın kırmızıdan yeşile boyanması: hiç bakım yoksa kırmızı, işaretlenen
  noktaların 100m çevresi yeşil. Yeşil, mama için 4 saatte, su için 6 saatte
  kademeli olarak solar; aynı noktaya ne kadar çok kişi bıraktıysa o kadar belirgin
- Konum bazlı bakım eksikliği kontrolü (500m), Mama/Su haritaları ayrı ayrı
  görüntülenebilir. Bulunduğunuz bölgede yeşil alan söndüyse cihaz üzerinde
  bildirim gönderilir (arka plan konum izni gerekir, 6 saat bildirim aralığı)
- Hayvan profili oluşturma (manuel, en az 2 fotoğraf zorunlu, kedi/köpek için
  çoktan seçmeli cins/desen listesi), fotoğraflı liste ve tür filtresiyle
  yakındaki hayvanları listeleme
- Hayvanlar haritada profil fotoğraflarıyla yuvarlak olarak görünür; dokununca
  profiline gidilir. Yeni hayvan eklerken yakındaki kayıtlılar önce gösterilir,
  "bu zaten kayıtlı" denirse hayvanın güncel konumu oraya taşınır ve profilinde
  mini haritada gösterilir
- Hayvan profilinde sohbet: bakım verenler ve o hayvanı kaydetmeye çalışanlar
  yorum yapabilir (yorum yapan otomatik bakım listesine eklenir)
- Hayvan sağlık ve ilaç kaydı: bakım verenler hastalık/tedavi kaydı ekleyebilir,
  sohbette bir yorumu ilgili sağlık kaydına bağlayabilir ("şu hastalık için
  ilacını verdim"), sağlık kaydına dokununca o kayda ait tüm yorumlar listelenir.
  Her kaydın 3 durumu var: **Tedaviye başlanmadı** (hiç yorum yok) → **Tedavi
  sürüyor** (en az bir yorum) → **İyileşti** ("İyileşti" butonuyla, bakım verenler
  işaretler). İyileşmiş kayda yeni yorum eklenemez
- Kullanıcı profili: profil fotoğrafı, rozetler, öne çıkan 3 rozet seçimi,
  sıralamadaki yeri ve arkadaşlık sistemi (kullanıcı arama, istek gönderme/kabul
  etme, başka kullanıcıların profilini görüntüleme)
- Rozetler ve puanlar: seri, cins ve sayaç bazlı rozetler; toplanan puanlara göre
  tüm kullanıcıların sıralandığı bir liderlik tablosu (profilden erişilir)

## Başlarken — Baştan Sona Kurulum

### 1. Repoyu klonlayın

GitHub artık HTTPS üzerinden şifreyle git işlemine izin vermiyor — klonlarken şifre
yerine bir [Personal Access Token](https://github.com/settings/tokens) (classic,
`repo` yetkisiyle) girmeniz gerekir; kullanıcı adı istendiğinde GitHub kullanıcı
adınızı, şifre istendiğinde token'ı yapıştırın.

```bash
git clone https://github.com/oguzpancuk/Stray.git
cd Stray
```

Repo zaten klonluysa `git pull origin main` ile güncelleyin.

### 2. Veritabanını Docker ile başlatın

```bash
docker run -d \
  --name stray-db \
  -p 5433:5432 \
  -e POSTGRES_USER=stray \
  -e POSTGRES_PASSWORD=stray \
  -e POSTGRES_DB=stray \
  imresamu/postgis:16-3.4
```
(`imresamu/postgis`, resmi `postgis/postgis` imajının Apple Silicon/arm64 dahil
çoklu-mimari topluluk sürümüdür — `postgis/postgis` kullanırsanız Apple Silicon
Mac'lerde emülasyon uyarısı alırsınız, zararsızdır ama yavaştır. Port `5433` seçildi
çünkü `5432` genelde Mac'lerde önceden kurulu bir PostgreSQL tarafından kullanılıyor;
sizde boşsa `-p 5432:5432` da kullanabilirsiniz.)

`docker ps` ile `stray-db`'nin `Up` durumda olduğunu doğrulayın.

### 3. Backend'i kurup çalıştırın

```bash
cd backend
cp .env.example .env
```
`.env` içinde `DATABASE_URL`'in yukarıdaki Docker ayarlarıyla eşleştiğinden emin olun:
```
DATABASE_URL=postgresql://stray:stray@localhost:5433/stray
JWT_SECRET=herhangi-uzun-bir-rastgele-metin
```
```bash
npm install
npm run migrate
npm run dev
```
`Stray API listening on port 3000` görünce hazır — **bu terminali açık bırakın.**

### 3b. (Opsiyonel) Demo verisi yükleyin

Boş bir uygulama yerine dolu bir harita ile başlamak için:

```bash
npm run seed
```

100 kullanıcı, her birine 2 hayvan (200 hayvan), Kadıköy çevresine dağılmış
mama/su kayıtları ve hayvan profillerinde sohbet oluşturur. Kullanıcıların 20'si
30 gün, 30'u 7 gün üst üste mama/su bırakmış olur — böylece Altın/Gümüş/Bronz
rozetlerin hepsi veride görünür. Hayvanların bir kısmında birden fazla kişi
yorum yaptığı için çok bakım verenli sohbet de test edilebilir.

Tüm demo hesapların girişi: `test1@stray.test` … `test100@stray.test`,
şifre `password123`.

> Android emülatöründe test edecekseniz fotoğraf URL'lerinin `10.0.2.2` üzerinden
> kurulması için: `PUBLIC_BASE_URL=http://10.0.2.2:3000 npm run seed`
>
> Script mevcut demo veriyi görürse tekrar çalışmaz; sıfırdan üretmek için
> veritabanını sıfırlayıp `npm run migrate && npm run seed` yapın.

> Şema zaman zaman değişiyor (en son: `health_records.recovered_at`/`recovered_by`
> ve `users.featured_badges` eklendi).
> Migrasyon hata verirse veritabanınızı sıfırlayıp tekrar deneyin:
> `docker exec -it stray-db psql -U stray -d stray -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`
>
> Bakım fotoğrafları backend'in yerel diskine (`backend/uploads/`) kaydedilir ve
> `/uploads/...` altında servis edilir — bulut depolama (S3 vb.) kullanmaz, bu yüzden
> yalnızca geliştirme/MVP amaçlıdır.

### 4. Mobil bağımlılıkları kurun

Yeni bir terminalde:
```bash
cd Stray/mobile
npm install
```

### 5a. iOS'ta çalıştırma (yalnızca Mac)

**Xcode:** App Store'dan tam **Xcode** kurulu olmalı (yalnızca Command Line Tools
yetmez). Kurulumdan sonra:
```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

**Ruby/CocoaPods:** macOS'un önceden yüklü Ruby'si (2.6.x) çok eski, CocoaPods'un
bağımlılıkları en az Ruby 3.0 ister:
```bash
brew install ruby
echo 'export PATH="/opt/homebrew/opt/ruby/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Pod install** (native bağımlılıklar — konum, kamera ve bildirim kütüphaneleri —
eklendiği için mobil tarafta her `npm install` sonrası bunu tekrar çalıştırmanız
gerekir; atlarsanız "The package '...' doesn't seem to be linked" hatası alırsınız.
Bildirimler için `@notifee/react-native` yeni eklendi, bu adımı mutlaka tekrarlayın):
```bash
cd ios
bundle install
bundle exec pod install
cd ..
```

**Çalıştırın:**
```bash
npm run ios
```
`localhost:3000`'e doğrudan erişir, harita için API key gerekmez (Apple Maps kullanır).

### 5b. Android'de çalıştırma

**Ön koşul:** Android Studio kurulu, bir sanal cihaz (AVD) oluşturulmuş ve **açık**.

**Google Maps API key (harita için şart):**
1. [Google Cloud Console](https://console.cloud.google.com/)'da "Maps SDK for Android"ı etkinleştirip bir anahtar oluşturun.
2. `mobile/android/app/src/main/res/values/google_maps_api.xml.example` dosyasını aynı klasöre `google_maps_api.xml` adıyla kopyalayın, `YOUR_GOOGLE_MAPS_API_KEY` yerine anahtarınızı yazın.

**Çalıştırın:**
```bash
npm run android
```
Backend'e otomatik olarak `10.0.2.2:3000` üzerinden bağlanır (Android emülatörü
"localhost"u kendi üzerinde arar). Gerçek bir cihazda test ediyorsanız
`mobile/src/api/client.ts` içindeki `API_BASE_URL`'i bilgisayarınızın yerel ağ
IP'siyle (örn. `http://192.168.1.5:3000/api`) değiştirin.

### 6. Uygulamada gezinme

1. **Kayıt Ol** ekranından yeni hesap oluşturun.
2. Konum ve bildirim izni isteyecek — **izin verin** (harita, bakım kontrolü ve
   uyarılar buna dayanıyor).
3. **Harita** sekmesinde Türkiye'nin tamamı görünür; henüz bakım yapılmamış yerler
   kırmızı, işaretlenmiş noktaların 100m çevresi yeşildir. Bulunduğunuz konumun
   500m çevresinde bakım yoksa üstte kırmızı bir uyarı çıkar.
4. Mama/su bırakmak için **haritaya dokunarak bir pin bırakın** (kendi konum
   işaretinize dokunursanız pin doğrudan bulunduğunuz yere düşer), çıkan **Mama
   Bıraktım** / **Su Bıraktım** butonlarından birini seçin. Kamera açılır —
   fotoğraf çekmeden işaretleme tamamlanmaz. Fotoğraftan sonra anlık konumunuz
   pinden 20 metreden uzaksa işlem reddedilir ve ne kadar uzakta olduğunuz
   söylenir; yaklaşıp tekrar deneyin.
5. Haritayı sokak ölçeğine kadar yakınlaştırdığınızda kayıtlı hayvanlar profil
   fotoğraflarıyla yuvarlak olarak görünür; dokununca profillerine gidersiniz.
6. **Hayvanlar** sekmesinde yakınınızdaki kayıtlı hayvanları (mesafeye göre sıralı)
   görür, **Yeni Hayvan Ekle** ile konumunuz otomatik alınarak yeni bir profil
   oluşturabilirsiniz.
7. **Profilim** sekmesinden rozet kataloğunu açabilir, öne çıkan 3 rozetinizi
   seçebilir, **Sıralama** ekranına gidebilir ve çıkış yapabilirsiniz.

### Rozetler, puanlar ve sıralama

Tüm rozetler bronz / gümüş / altın / elmas kademelerinde. Bir kere kazanılan rozet
kalıcıdır (seri bozulsa bile düşürülmez). Üç grup var:

| Grup | Nasıl kazanılır | Eşikler (bronz → elmas) |
| --- | --- | --- |
| **Seri** | Mama, su ve hayvan kaydetme için ayrı ayrı, en uzun ardışık gün serisi | 1 / 7 / 30 / 365 gün |
| **Cins** | Her kedi/köpek cinsi için ayrı rozet (ör. "Altın Tekir Avcısı") | 1 / 5 / 20 / 100 kayıt |
| **Sayaç** | Yorumcu (hayvan profillerine yorum) ve Şifacı (sağlık kaydı ekleme/iyileştirme) | Yorumcu 1/10/50/200, Şifacı 1/5/20/100 |

**Puanlar:** her rozet kademesi puan verir (bronz 10, gümüş 25, altın 60, elmas 150).
Yorumlar ayrıca puan getirir, ama ağırlıklı: aynı hayvana yığılan yorumları
ödüllendirmemek için hayvan başına en fazla 5 yorum sayılır (yorum başına 1 puan) ve
yorum yapılan **farklı** hayvan başına 3 puan verilir — yani genişlik, tekrar
yorumdan daha değerli.

**Öne çıkan rozetler:** Profilinizden en fazla 3 rozet seçip profilinizin üstünde
sergileyebilirsiniz. Seçim rozetin anahtarını saklar, kademesini değil; rozetiniz
altına yükselince öne çıkan rozet de kendiliğinden güncellenir.

**Liderlik tablosu:** Profilinizdeki "Sıralama" bağlantısından erişilir; toplam
puana göre tüm kullanıcıları sıralar, eşit puanlılar aynı sırayı paylaşır (1, 2, 2, 4).
Kendi sıranız listenin üstünde ayrıca gösterilir ve listede vurgulanır.

**Bildirimler:** Uygulama açıkken 30 dakikada bir (ve öne her geldiğinde)
bulunduğunuz konumun 500m çevresinde mama/su kalıp kalmadığını kontrol eder;
kalmadıysa cihaz üzerinde bildirim gösterir. Aynı uyarı 6 saatte birden sık
gönderilmez. Arka planda da çalışabilmesi için "her zaman konum" izni istenir;
vermezseniz uygulama çalışmaya devam eder, yalnızca uygulama kapalıyken uyarı
gelmez.

**Uzaktan test için konum override'ı:** `oguzpancuk@gmail.com` ve
`sumeyyeayan@gmail.com` hesaplarıyla giriş yapıldığında (yalnızca geliştirme
derlemelerinde, `__DEV__`), gerçek GPS yerine her zaman Kadıköy'de sabit bir konum
kullanılır — bu sayede Türkiye dışından da 20m mesafe kontrolü gerektiren akışlar
test edilebilir. İki hesabın konumu birbirine yakın ama aynı değil (~250m), böylece
iki kullanıcıyla mükerrer hayvan tespiti de denenebilir. Bkz. `mobile/src/location.ts`.

## Sık Karşılaşılan Sorunlar

- **`git clone`/`push` "Invalid username or token"**: GitHub artık şifre kabul
  etmiyor, yukarıdaki 1. adımdaki gibi bir Personal Access Token kullanın.
- **`ffi-*.gem requires ruby >= 3.0`**: Sistem Ruby'si eski, yukarıdaki 5a adımındaki
  Homebrew Ruby kurulumunu yapın.
- **`xcodebuild requires Xcode, but active developer directory is CommandLineTools`**:
  Tam Xcode kurulu değil/seçili değil, 5a adımını uygulayın.
- **`Unable to open base configuration reference file ... Pods-StrayMobile.debug.xcconfig`**:
  `pod install` çalıştırılmamış, 5a adımındaki CocoaPods kurulumunu yapın.
- **`unable to attach DB: ... database is locked`** (Xcode build hatası): Genelde
  eski bir build önbelleği takılı kalıyor. Sırayla deneyin:
  ```bash
  killall -9 XCBBuildService Xcode xcodebuild 2>/dev/null
  rm -rf ~/Library/Developer/Xcode/DerivedData
  rm -rf ~/Library/Caches/com.apple.dt.XCBuild ~/Library/Caches/com.apple.dt.Xcode
  ```
  Hâlâ çözülmezse Mac'i yeniden başlatıp tek bir terminalden tekrar deneyin.
- **Docker: `ports are not available: ... address already in use`**: Port `5432`
  başka bir Postgres tarafından kullanılıyor, 2. adımdaki gibi `5433` gibi farklı bir
  host portu kullanın (ve `DATABASE_URL`'i buna göre güncelleyin).
- **Docker: `platform does not match host platform` uyarısı**: Apple Silicon'da
  zararsız bir uyarı (emülasyonla çalışır), ama 2. adımdaki `imresamu/postgis`
  imajı bunu tamamen ortadan kaldırır.
