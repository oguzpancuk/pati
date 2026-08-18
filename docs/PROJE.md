# pati — Proje Dokümanı

**Son güncelleme:** 18 Ağustos 2026
**Depo:** https://github.com/oguzpancuk/Stray (uygulamanın adı **pati**, depo adı
hâlâ `Stray`)

Bu doküman projenin bütününü tek yerde anlatır: ne yaptığı, nasıl çalıştığı,
şu an nerede olduğu ve sırada ne olduğu. Ayrıntılar için:

| Doküman | İçerik |
| --- | --- |
| [PRD.md](PRD.md) | Orijinal ürün gereksinimleri |
| [YOL_HARITASI.md](YOL_HARITASI.md) | Kalan işler, önerilen sıra ve yaklaşımlar |
| [TASARIM.md](TASARIM.md) | Tasarım sistemi — token'lar, bileşenler, ekran kuralları |
| [NOTLAR.md](NOTLAR.md) | Teknik kararların gerekçeleri, bilinen sınırlar, ortam tuzakları |
| [../README.md](../README.md) | Kurulum ve çalıştırma adımları |

---

## 1. Proje nedir?

Stray, Türkiye'deki sokak hayvanlarının bakımını **koordine eden** bir mobil
uygulama. Temel fikir şu: bir mahallede sokak hayvanlarıyla ilgilenen çok
sayıda insan var, ama birbirlerinden habersizler. Aynı köşeye üç kişi mama
bırakırken iki sokak ötede hiç kimse bırakmıyor olabilir. Uygulama bu görünmez
koordinasyon boşluğunu kapatıyor.

Çözüm üç ayağa dayanıyor:

**Harita gerçeği gösteriyor.** Kullanıcı mama veya su bıraktığında haritada o
noktayı işaretliyor — fotoğraf çekmek zorunlu ve o an fiziksel olarak orada
olması gerekiyor (20 metre toleransla konum doğrulaması). Bırakılan bakımın
etrafındaki 100 metrelik alan yeşile dönüyor ve zamanla soluyor: mama 4 saatte,
su 6 saatte. Yani harita "buralara bakılıyor mu?" sorusunun canlı cevabı.
Kırmızı kalan bölgeler ihmal edilen bölgeler.

**Hayvanların kimliği var.** Kullanıcılar tek tek hayvanların profilini
oluşturuyor: fotoğraflar, tür, cins, konum. Her hayvanın profilinde o hayvanla
ilgilenenlerin yazdığı bir sohbet ve bir sağlık geçmişi var — hangi hastalık,
hangi tedavi, iyileşti mi. Böylece "bu kediye kim baktı, ilacını verdi mi"
bilgisi tek bir kişinin aklında kalmıyor.

**Oyunlaştırma sürdürülebilirliği sağlıyor.** Rozetler, puanlar ve liderlik
tablosu, düzenli bakımı ödüllendiriyor. Arkadaşlık sistemiyle insanlar
birbirlerinin katkısını görüyor.

### Kimler için
Hayvanseverler, mahalle sakinleri, veterinerler, hayvan hakları aktivistleri ve
belediye görevlileri.

---

## 2. Bugün ne çalışıyor?

MVP tamamlandı ve uçtan uca test edildi. Aşağıdakilerin hepsi çalışır durumda:

### Harita ve bakım işaretleme
- Türkiye'ye odaklı harita; uygulama açılınca kullanıcının konumuna yakınlaşıyor
- Haritaya dokunarak pin bırakılıyor, "Mama Bıraktım" / "Su Bıraktım" seçiliyor
- **Fotoğraf zorunlu** — kamera açılıyor, fotoğraf çekilmeden işlem tamamlanmıyor
- **Konum doğrulaması** — pin ile kullanıcının anlık konumu arasındaki mesafe
  20 metreyi geçerse işlem reddediliyor ve kullanıcıya kaç metre uzakta olduğu
  söyleniyor
- Mama ve su haritaları ayrı ayrı görüntüleniyor; birinde diğerinin seçeneği
  çıkmıyor
- İşaretlenen noktanın 100 metre çevresi yeşile boyanıyor; mama 4, su 6 saatte
  kademeli olarak soluyor. Aynı noktaya ne kadar çok kişi bıraktıysa renk o
  kadar belirgin
- Kullanıcının 100 metre çevresinde (yeşil dairenin yarıçapıyla aynı) bakım
  yoksa haritanın üstünde uyarı bandı çıkıyor — yani kırmızı zemindeyseniz
  uyarılırsınız, yeşil zemindeyseniz uyarılmazsınız

### Hayvan profilleri
- Manuel kayıt: en az 2 fotoğraf zorunlu, kedi/köpek için çoktan seçmeli
  cins/desen listesi
- Yeni hayvan eklerken yakındaki kayıtlı hayvanlar önce gösteriliyor;
  "bu zaten kayıtlı" denirse hayvanın güncel konumu oraya taşınıyor
  (mükerrer kaydı azaltmak için)
- Hayvanlar sokak ölçeğinde yakınlaştırıldığında haritada profil fotoğraflarıyla
  yuvarlak olarak görünüyor; dokununca profile gidiliyor
- Hayvanlar sekmesinde mesafeye göre sıralı liste, tür (kedi/köpek) filtresi
- Profilde mini harita, fotoğraf galerisi ve son görülme bilgisi

### Sohbet ve sağlık takibi
- Her hayvan profilinde sohbet; bakım verenler ve o hayvanı kaydetmeye
  çalışanlar yorum yapabiliyor (yorum yapan otomatik olarak bakım listesine
  ekleniyor)
- Sağlık kaydı: hastalık ve tedavi girilebiliyor
- Sohbetteki bir yorum ilgili sağlık kaydına bağlanabiliyor ("şu hastalık için
  ilacını verdim"); sağlık kaydına dokununca o kayda ait tüm yorumlar listeleniyor
- **Üç durumlu takip:** Tedaviye başlanmadı (hiç yorum yok) → Tedavi sürüyor
  (en az bir yorum var) → İyileşti (bakım veren "İyileşti" ile işaretledi).
  İyileşmiş bir kayda yeni yorum eklenemiyor

### Rozetler, puanlar, liderlik tablosu
Üç rozet grubu, hepsi bronz / gümüş / altın / elmas kademelerinde:

| Grup | Rozetler | Eşikler |
| --- | --- | --- |
| Seri | Mama Perisi, Su Elçisi, Mahalle Muhabiri — en uzun ardışık gün serisi | 1 / 7 / 30 / 365 gün |
| Cins | Her kedi/köpek cinsi için ayrı: Tekir Ahbabı, Sarman Sırdaşı, Kara Kedi Kankası, Kangal Yoldaşı… | 1 / 5 / 20 / 100 kayıt |
| Sayaç | Mahalle Dedikoducusu (yorum), Pati Şifacısı (sağlık) | Yorum 1/10/50/200 · Sağlık 1/5/20/100 |

Rozet adı kademesiyle birlikte okunur: "Altın Tekir Ahbabı". İsimler bilerek sıcak
ve biraz esprili — "avcı" gibi agresif çağrışımlı kelimelerden kaçınıldı, çünkü
burada kovalanan bir av değil bakılan bir canlı var.

- Puanlar: bronz 10, gümüş 25, altın 60, elmas 150
- Yorumlar ek puan getiriyor ama **ağırlıklı**: hayvan başına en fazla 5 yorum
  sayılıyor (yorum başına 1 puan) ve yorum yapılan farklı hayvan başına 3 puan
  veriliyor. Böylece tek hayvana yığılan yorumlarla puan çiftlemek işe yaramıyor
- Bir kere kazanılan rozet düşmüyor
- Kullanıcı en fazla 3 rozeti profilinde öne çıkarabiliyor
- Liderlik tablosu tüm kullanıcıları puana göre sıralıyor; eşit puanlılar aynı
  sırayı paylaşıyor (1, 2, 2, 4). Kullanıcı kendi sırasını profilinde ve
  listenin üstünde görüyor

**Seviyeler:** Toplam puan 10 kademeli bir seviyeye karşılık geliyor — 🌱 Yeni
Komşu (0) → 🏘️ Mahalle Sakini (40) → 🤝 Sokak Gönüllüsü (120) → 🍲 Mama Nöbetçisi
(250) → 🐾 Pati Dostu (450) → 🧭 Sokak Kâşifi (750) → 🎖️ Mahalle Muhtarı (1200) →
🦉 Sokak Bilgesi (1800) → 🦸 Pati Kahramanı (2600) → 👑 Sokakların Piri (3600).
Profilde ilerleme çubuğu ve bir sonraki seviyeye kalan puan gösteriliyor.

**Rozet kutlaması:** Yeni rozet kazanıldığında bir kutlama penceresi açılıyor:
kazanılan rozet, aldığı puan, önceki → yeni sıralama ve seviye atlandıysa yeni
seviye. Aynı anda birden fazla rozet kazanılırsa sırayla gösteriliyor; uygulama
kapalıyken kazanılanlar profil ekranı açıldığında yakalanıyor.

### Sosyal
- Profil fotoğrafı, kullanıcı arama, arkadaşlık isteği gönderme/kabul etme
- Profillerde (hem kendi hem başkasının) seviye çubuğu, öne çıkan rozetler,
  bakım verilen hayvanlar profil fotoğraflarıyla (dokununca hayvanın profiline
  gider) ve son yorumlar — "Tümünü gör" ile tam yorum geçmişi

### Bildirimler
- Uygulama açıkken 30 dakikada bir (ve öne her geldiğinde) kullanıcının 100
  metre çevresinde mama/su kalıp kalmadığı kontrol ediliyor; kalmadıysa cihaz
  üzerinde bildirim gösteriliyor
- Aynı uyarı 6 saatte birden sık gönderilmiyor
- Konum sunucuya sürekli gönderilmiyor — kontrol cihazda yapılıyor

### Yönetim paneli (web)
Ayrı bir web uygulaması, aynı API üzerinde çalışır. Yalnızca `role = admin` olan
hesaplar girebilir; her `/api/admin` isteği sunucuda `requireAdmin`'den geçer.

- **Gösterge paneli** — kullanıcı/hayvan/bakım/yorum sayıları, askıya alınan hesap
  sayısı, tür dağılımı ve son 30 günlük aktivite grafiği
- **Kullanıcılar** — arama, rol değiştirme (kullanıcı/veteriner/yönetici), askıya
  alma. Askıya alınan hesap token'ı elinde olsa bile API'ye erişemez
- **Hayvanlar** — düzenleme, silme ve **mükerrer kayıt birleştirme**: kaynak
  kaydın fotoğrafları, yorumları, sağlık kayıtları ve bakım verenleri hedefe
  taşınır, kaynak silinir (tek transaction)
- **Bakım kayıtları** — kanıt fotoğraflarının moderasyonu
- **Yorumlar** — uygunsuz yorumları silme
- **Reklamlar** — marka ekleme/düzenleme, yerleşim, görsel, kampanya tarihleri,
  yayına alma/durdurma ve gösterim/tık/CTR raporu
- **Denetim kaydı** — panelden yapılan her işlem; kim, ne zaman, neyi, hangi
  sebeple değiştirdi

İlk yönetici `npm run make-admin -- eposta@adresi.com` scriptiyle oluşturulur
(admin uç noktaları zaten yönetici yetkisi istediği için API'den yapılamaz).

### Reklam
Hazır bir reklam ağı değil, kendi basit reklam sunucumuz — markalar admin
panelinden elle giriliyor ve yerleşimler çok spesifik.

- **Üç yerleşim:** mama pop-up'ı, su pop-up'ı, sağlık kaydı ekleme ekranı
  (veteriner kliniği)
- **Rotasyon:** aynı yerleşimdeki markalar sırayla gösteriliyor; kullanıcı
  pop-up'ı her açtığında sıradaki markayı görüyor
- **Ölçüm:** gösterim ve tıklama ayrı ayrı kaydediliyor, panelde CTR ile birlikte
  raporlanıyor — bu olmadan markaya "şu kadar gösterim aldınız" denemez
- Kampanya tarih aralığı ve yayına alma/durdurma; yayında reklam yoksa bant hiç
  çizilmiyor
- Bantta zorunlu "Reklam" etiketi: kullanıcı neyin içerik neyin reklam olduğunu
  ayırt edebilmeli

### Demo verisi
`npm run seed` ile 100 kullanıcı, 200 hayvan, Kadıköy çevresine dağılmış
mama/su kayıtları ve hayvan profillerinde sohbet oluşturuluyor. 20 kullanıcı
30 gün, 30 kullanıcı 7 gün üst üste bakım vermiş oluyor — böylece tüm rozet
kademeleri veride görünüyor.

---

## 3. Nasıl çalışıyor? (Teknik)

### Yapı
```
stray/
├── backend/    Node.js + Express API (PostgreSQL + PostGIS, JWT)
├── mobile/     React Native uygulaması (iOS + Android)
├── admin/      Web tabanlı yönetim paneli (React + Vite + TS)
└── docs/       Dokümantasyon
```

### Teknoloji
| Katman | Seçim |
| --- | --- |
| Mobil | React Native 0.74.5, React 18.2, TypeScript |
| Harita | react-native-maps 1.14.0 (iOS'ta Apple Maps, Android'de Google Maps) |
| Navigasyon | React Navigation 6 (native-stack + bottom-tabs) |
| Bildirim | @notifee/react-native |
| Backend | Node.js 18+, Express 4 |
| Veritabanı | PostgreSQL 16 + PostGIS 3.4 |
| Kimlik | JWT (7 gün) + bcrypt |
| Dosya yükleme | multer → yerel disk (`backend/uploads/`) |

### Veri modeli
```
users              kullanıcı, avatar_url, featured_badges (JSONB)
animals            tür, cins, konum (GEOGRAPHY POINT), location_updated_at
animal_photos      hayvan fotoğrafları
animal_comments    hayvan profili sohbeti; health_record_id ile sağlık
                   kaydına bağlanabiliyor
health_records     hastalık/tedavi; recovered_at + recovered_by ile iyileşme
user_animal_care   kim hangi hayvana bakıyor (çoka çok)
care_actions       konum, tür (food/water), photo_url, zaman
friendships        requester/addressee, pending|accepted
user_badge_awards  rozetin ilk kazanıldığı an + o andaki puan/sıralama/seviye
audit_log          panelden yapılan her değişiklik: kim, ne, ne zaman, neden
advertisers        reklamveren: yerleşim, görsel, hedef adres, kampanya tarihleri
ad_events          gösterim ve tıklama kayıtları (rotasyon + faturalama)
```
Coğrafi kolonlar `GEOGRAPHY(POINT, 4326)` tipinde ve GIST index'li. Yakınlık
sorguları `ST_DWithin`, harita penceresi `ST_MakeEnvelope`, istemciye dönüş
`ST_AsGeoJSON` ile yapılıyor.

### API
```
POST   /api/auth/register | /login

GET    /api/care-actions              (bbox + tür filtresi)
GET    /api/care-actions/status       (bir konumda bakım eksik mi)
POST   /api/care-actions              (multipart: fotoğraf + konum doğrulama)

GET    /api/animals                   (yakınlık + tür filtresi)
GET    /api/animals/:id
POST   /api/animals
POST   /api/animals/:id/sightings     (görüldü: konum güncelle + bakıcı ekle)
POST   /api/animals/:id/photos
POST   /api/animals/:id/comments      GET .../comments
POST   /api/animals/:id/health-records
POST   /api/animals/:id/health-records/:recordId/recover
POST   /api/animals/:id/follow

GET    /api/users/me | /me/animals | /me/comments | /search | /:id
GET    /api/users/:id/comments
POST   /api/users/me/avatar
PUT    /api/users/me/featured-badges
GET    /api/users/me/badge-awards          # okunmamış rozet kutlamaları
POST   /api/users/me/badge-awards/seen

GET    /api/friendships/me
POST   /api/friendships | /:id/accept    DELETE /api/friendships/:id

GET    /api/leaderboard

GET    /api/ads?slot=...                  # yerleşim için sıradaki reklam
POST   /api/ads/:id/impression            POST /api/ads/:id/click

                                          # hepsi requireAuth + requireAdmin
GET    /api/admin/stats
GET    /api/admin/users                   PATCH /api/admin/users/:id
GET    /api/admin/animals                 PATCH /api/admin/animals/:id
DELETE /api/admin/animals/:id             POST  /api/admin/animals/:id/merge
GET    /api/admin/care-actions            DELETE /api/admin/care-actions/:id
GET    /api/admin/comments                DELETE /api/admin/comments/:id
GET    /api/admin/advertisers             POST  /api/admin/advertisers
PATCH  /api/admin/advertisers/:id         DELETE /api/admin/advertisers/:id
POST   /api/admin/advertisers/:id/image
GET    /api/admin/audit-log
```

### Dikkate değer birkaç uygulama detayı
- **Solma ve uyarı penceresi aynı.** Haritadaki yeşilin solma süresi ile "bakım
  eksik" uyarısının penceresi bilerek eşitlendi; farklı olsalardı harita
  yeşilken uyarı çıkabiliyordu. Pencere satır bazında (`CASE action_type`)
  hesaplandığı için mama ve su aynı sorguda listelense bile her biri kendi
  hızında soluyor.
- **Hastalık durumu saklanmıyor, türetiliyor.** Yorum var mı ve `recovered_at`
  dolu mu sorularından SQL içinde çıkarılıyor; böylece gerçekle desenkron
  olamıyor.
- **Öne çıkan rozetler yalnızca anahtarı saklıyor**, kademeyi değil — kullanıcı
  altına yükselince profildeki rozet kendiliğinden güncelleniyor.
- **Seri hesabı** klasik "gaps and islands" SQL deseniyle, uygulama tarafında
  döngü kurmadan yapılıyor.
- **Liderlik tablosu set-based** hesaplanıyor: kullanıcı başına sorgu atmak
  yerine tüm kullanıcılar tek sorgu setiyle hesaplanıyor.

Bu kararların ayrıntılı gerekçeleri [NOTLAR.md](NOTLAR.md) içinde.

---

## 4. Bilinen sınırlar

Bunlar bilinerek kabul edilmiş, üretime çıkmadan kapatılması gereken maddeler.
Tam liste ve gerekçeler
[NOTLAR.md → Bilinen Sınırlar](NOTLAR.md#3-bilinen-sınırlar-ve-teknik-borç)
içinde; en önemlileri:

1. **Liderlik tablosu her istekte sıfırdan hesaplanıyor.** 100 kullanıcıda
   sorunsuz, binlerce kullanıcıda sürdürülemez — puanların periyodik olarak bir
   tabloya yazılması gerekecek. Ölçek büyüdüğünde ilk bakılacak yer burası.
2. **Fotoğraflar sunucunun yerel diskinde.** Yedeksiz, çok sunuculu kuruluma
   uygun değil, görseller yeniden boyutlandırılmıyor. Üretim için nesne
   depolama (S3/R2) + CDN şart.
3. **Tek migrasyon dosyası** — şema değişince veritabanı sıfırlanıyor. Gerçek
   veri girmeden önce artımlı migrasyona geçilmeli.
4. **Fotoğraf kanıtı doğrulanmıyor, rate limit yok.** Moderasyon ve kötüye
   kullanım koruması gerekiyor.
5. **Otomatik test kapsamı çok düşük**, CI yok.
6. **Bildirimler yalnızca uygulama çalışırken.** Gerçek arka plan bildirimi
   için sunucu tarafı push (APNs/FCM) veya geofencing gerekiyor.

---

## 5. Sırada ne var?

Beş büyük iş kaldı. Ayrıntılı planlar, önerilen yaklaşımlar ve karar verilmesi
gerekenler [YOL_HARITASI.md](YOL_HARITASI.md) içinde.

### 1. Yapay zekâ ile hayvan eşleştirme
"Hayvan Ekle" doğrudan formu açacak; alanlar ve fotoğraf girildikten sonra
yapay zekâ çevredeki kayıtlı hayvanlar arasından en benzeyen 5 tanesini
benzerlik oranıyla gösterecek. Biri seçilirse kullanıcı o hayvanın bakım
verenlerine ekleniyor, seçilmezse yeni kayıt açılıyor.

*Yaklaşım:* Model eğitilmeyecek. Hazır bir görüntü gömme modeli (DINOv2/CLIP)
ile vektör çıkarılıp, PostGIS ile ~1km'ye daraltılmış aday kümesi içinde kosinüs
benzerliği hesaplanacak; vektörler `pgvector` ile veritabanında tutulacak.
**Önemli:** kosinüs benzerliği bir olasılık değil — "%87 aynı" demek yanıltıcı
olur. İlk sürümde kademeli etiket ("çok benzer / benzer"), veri biriktikçe
kalibre edilmiş gerçek bir oran gösterilmesi öneriliyor. Son karar her zaman
kullanıcıda kalmalı.

### 2. Bağış sistemi
Admin panelinden girilen kurumlara uygulama üzerinden bağış yapılabilecek;
bağışların %5'i platforma kalacak. Doğrudan uygulamaya bağış seçeneği en üstte
çıkacak. Toplam bağış miktarı rozet kazandıracak.

*Yaklaşım:* Türkiye'de kart işlemleri için iyzico/PayTR gibi sağlayıcıların
**pazaryeri (alt üye işyeri) modeli** kullanılmalı — böylece para doğrudan
kuruma gider, siz yalnızca komisyon alırsınız. Parayı önce kendi hesabınıza
toplayıp sonra aktarmak sizi "bağış toplayan taraf" yapar ve Türkiye'de bağış
toplamak izne tabidir (2860 sayılı kanun). Ayrıca Apple, hayır kurumu
bağışlarının uygulama içi satın alma ile **değil** harici ödeme yöntemiyle
alınmasını istiyor. %5'lik kesinti bağış ekranında açıkça yazılmalı ve
yayınlamadan önce mali müşavir/avukat teyidi alınmalı.

### 3. Reklam
Mama pop-up'ında mama markası, su pop-up'ında su markası, sağlık kaydı
eklerken veteriner kliniği reklamı. Markalar admin panelinden giriliyor, her
tıkta sıra bir sonrakine geçiyor.

*Yaklaşım:* Hazır reklam ağı değil, kendi basit reklam sunucumuz — üç yerleşim
(`food_popup`, `water_popup`, `vet_health_record`), yerleşim başına rotasyon
imleci. Markalara satış yapabilmek için gösterim ve tıklama ayrı ayrı
kaydedilmeli.

### 4. UI — ✅ tamamlandı
"pati" marka kimliği uygulandı: `mobile/src/theme/` altında renk/tipografi/
boşluk token'ları, `components/ui/` altında 11 çekirdek bileşen,
`components/brand/` altında SVG logo ve 20 ikonluk set. 11 ekranın tamamı bu
sisteme taşındı, 171 sabit renk kodu sıfırlandı. Marka fontu Nunito gömüldü.
Ayrıntı: [TASARIM.md](TASARIM.md). Kalan: uygulama ikonu/açılış görseli ve
karanlık mod.

### 5. Admin sayfası (web)
Tüm uygulamanın kontrol edileceği web tabanlı panel.

*Yaklaşım:* Aynı repo içinde `admin/` klasörü, React + Vite + TypeScript,
mevcut API üzerine. Önce altyapı: `users.role`, `requireAdmin` middleware,
`/api/admin/*` ve **denetim kaydı** (`audit_log`). Panelde gösterge paneli,
kullanıcı/hayvan/bakım kaydı yönetimi, mükerrer hayvan birleştirme, fotoğraf
moderasyonu, reklamveren ve bağış kurumu yönetimi.

### Durum
```
✅ Admin paneli  ──┬──> ✅ Reklam
   + rol altyapısı └──> ⏸️  Bağış — ertelendi (ödeme sağlayıcı, hukuk, mağaza)
⏸️  YZ eşleştirme — park edildi (maliyet/hız ölçüldü, isabet ölçülemedi)
✅ Tasarım sistemi + UI giydirme
🚀 Yayına çıkma sprint'i ← SIRADA, kalan tek zorunlu blok
```
Kalan iki özellik maddesi de dış bir bilgiye bağlı olduğu için beklemede:
**bağış** ödeme sağlayıcı/hukuk/mağaza kurallarına, **YZ eşleştirme** ise gerçek
fotoğraflarla yapılacak isabet ölçümüne. Kod tarafında bloke eden bir şey yok;
sıradaki iş [yayına çıkma sprint'i](YOL_HARITASI.md#-yayına-çıkma-sprinti--ertelendi-unutulmayacak).

---

## 6. Kurulum özeti

Ayrıntılı adımlar [README.md](../README.md) içinde. Kısaca:

```bash
# Veritabanı
docker run -d --name stray-db -p 5433:5432 \
  -e POSTGRES_USER=stray -e POSTGRES_PASSWORD=stray -e POSTGRES_DB=stray \
  imresamu/postgis:16-3.4

# Backend
cd backend && cp .env.example .env && npm install && npm run migrate && npm run dev
npm run seed        # opsiyonel: 100 kullanıcı + 200 hayvanlık demo verisi

# Mobil
cd mobile && npm install
cd ios && bundle exec pod install && cd ..   # native bağımlılık eklendiyse şart
npm run ios         # veya npm run android
```

Demo hesapları: `test1@stray.test` … `test100@stray.test`, şifre `password123`.
