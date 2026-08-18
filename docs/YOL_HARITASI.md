# Yol Haritası

MVP tamamlandı (harita, bakım işaretleme, hayvan profilleri, sohbet, sağlık
takibi, rozetler, liderlik tablosu, arkadaşlık, bildirimler). Kalan beş büyük iş
aşağıda. Her madde için **ne yapılacağı**, **nasıl yapılmasını önerdiğim** ve
**karar verilmesi gerekenler** ayrı ayrı yazıldı.

Ayrıca üretime çıkmadan kapatılması gereken teknik borç listesi için bkz.
[NOTLAR.md → Bilinen Sınırlar](NOTLAR.md#3-bilinen-sınırlar-ve-teknik-borç).

---

## Önerilen sıra

```
1. Admin paneli (madde 5)   ──┬──> 2. Reklam (madde 3)
   + rol/yetki altyapısı      └──> 3. Bağış (madde 2)
                                      │
4. Tasarım sistemi (madde 4a) ────────┤   (erken, küçük)
                                      │
5. YZ hayvan eşleştirme (madde 1) ────┤   (paralel yürüyebilir)
                                      │
6. UI giydirme (madde 4b) ────────────┘   (en son, tüm ekranlar oturunca)
```

**Neden bu sıra:**

- **Admin paneli önce**, çünkü hem reklam firmaları hem bağış kurumları
  "admin sayfasından girilir" diye tanımlandı. Admin olmadan diğer ikisinin
  veri girişi yok. Ayrıca rol/yetki altyapısı (`users.role`, `requireAdmin`)
  bir kere kurulunca sonraki her şey onun üzerine biniyor.
- **Reklam ikinci**, çünkü teknik olarak en basit iş (CRUD + rotasyon +
  gösterim sayacı), dış bağımlılığı yok ve ilk gelir kalemi.
- **Bağış sonra**, çünkü tek dış bağımlılığı olan madde: ödeme sağlayıcı
  entegrasyonu, hukuki kontrol ve mağaza (App Store / Play) kuralları var.
  Bunlar kod yazmadan önce netleşmeli.
- **UI ikiye bölünsün.** Renk/tipografi/boşluk token'larından oluşan küçük bir
  **tasarım sistemi hemen** çıkarılsın ki yeni gelen ekranlar (admin, bağış)
  onun üzerine kurulsun; **tam giydirme en sona** kalsın, çünkü her yeni özellik
  yeni ekran ekliyor ve erken yapılan giydirme boşa gidiyor.
- **YZ eşleştirme paralel yürüyebilir**, çünkü ayrı bir servis olarak
  geliştirilebilir ve mevcut akışlara tek bir uç noktadan bağlanıyor. En büyük
  teknik belirsizlik burada olduğu için erken bir "spike" (2–3 günlük deneme)
  yapılması, sonucun tatmin edici olup olmadığının önceden görülmesi iyi olur.

---

## 1. Yapay zekâ ile hayvan eşleştirme

### İstenen akış
"Hayvan Ekle" butonu doğrudan hayvan ekleme sayfasını açar. Gerekli alanlar
girilip fotoğraf eklendikten sonra yapay zekâ çalışır ve çevredeki kayıtlı
hayvanlar arasından en çok benzeyen 5 tanesini benzerlik oranıyla gösterir.
Bu hayvanlardan biri seçilirse kullanıcı o hayvanın bakım verenlerine eklenir;
seçilmezse yeni hayvan oluşturulur.

> Not: Bugün bunun elle yapılan bir hâli var — yeni hayvan eklerken yakındaki
> kayıtlılar mesafeye göre listeleniyor ve "bu zaten kayıtlı" denebiliyor.
> Yeni akış bunun yerini alacak; `POST /api/animals/:id/sightings` uç noktası
> (mevcut hayvana bakım veren ekleme + konum güncelleme) aynen kullanılabilir.

### Önerilen yaklaşım
Model **eğitilmesin**. Hazır bir görüntü gömme (embedding) modeliyle vektör
çıkarıp benzerlik hesaplamak bu iş için hem yeterli hem çok daha ucuz:

1. **Aday kümesini önce coğrafyayla daralt.** PostGIS `ST_DWithin` ile ~1km
   içindeki hayvanlar. Türkiye'deki tüm hayvanlarla karşılaştırma yapmaya gerek
   yok — hem yavaş hem anlamsız (aynı hayvan 300km ötede olmaz).
2. **Her fotoğraf için bir gömme vektörü üret.** Aday modeller: DINOv2 (görsel
   benzerlik için güçlü), CLIP (daha genel), veya hayvan yüz tanımaya özel
   açık modeller. Python tarafında bir mikroservis (FastAPI) olarak koşar.
3. **Vektörleri veritabanında sakla.** PostgreSQL zaten var; `pgvector`
   eklentisiyle `animal_photos.embedding vector(768)` kolonu ekleyip kosinüs
   benzerliğini SQL içinde hesaplamak en az hareketli parça demek.
4. **Bir hayvanın birden fazla fotoğrafı var** — hayvan skoru, o hayvanın
   fotoğrafları arasındaki **en yüksek** benzerlik olsun (aynı kedinin bir
   fotoğrafı arkadan çekilmiş olabilir).
5. **Tür/cins ile filtrele.** Kullanıcı "kedi / Tekir" seçtiyse aday kümesi
   zaten daralıyor; bu hem hızlandırır hem isabeti artırır.

### Dikkat edilecek nokta: "aynı olma ihtimali"
Kosinüs benzerliği bir **olasılık değildir**. Ham skoru "%87 aynı hayvan" diye
göstermek yanıltıcı olur. İki seçenek var:
- **Kolay yol:** "çok benzer / benzer / az benzer" gibi üç kademeli bir etiket
  göster, sayı gösterme.
- **Doğru yol:** Elde biriken "aynı hayvan" / "farklı hayvan" kararlarıyla
  skoru kalibre et (Platt scaling gibi basit bir yöntem yeter), sonra gerçek
  bir olasılık göster. Bunun için önce veri birikmesi gerekiyor — yani ilk
  sürüm kolay yolla çıkıp, kullanıcı seçimlerini kaydedip sonra kalibre etmek
  mantıklı.

Her hâlükârda **son kararı kullanıcı vermeli**; sistem otomatik birleştirme
yapmamalı.

### Yapılacaklar
- [ ] Spike: 20–30 gerçek sokak hayvanı fotoğrafıyla DINOv2/CLIP benzerliğini
      ölç, isabet yeterli mi gör (2–3 gün)
- [ ] `pgvector` eklentisi + `animal_photos.embedding` kolonu + index
- [ ] Python gömme servisi (FastAPI) + backend'den çağrı
- [ ] Mevcut fotoğrafları toplu vektörleştiren script (seed verisi dahil)
- [ ] `POST /api/animals/match` — fotoğraf + konum + tür alır, en benzer 5
      hayvanı skorla döner
- [ ] Mobil: "Hayvan Ekle" akışını değiştir — form + fotoğraf sonrası eşleştirme
      ekranı, "bu o hayvan" / "yeni hayvan oluştur" seçimi
- [ ] Kullanıcı seçimlerini `animal_match_feedback` tablosuna kaydet (ileride
      kalibrasyon için)

### Karar verilmesi gerekenler
- Gömme servisi nerede koşacak? (kendi sunucumuz / yönetilen GPU / CPU yeterli mi)
- Skor kullanıcıya sayı olarak mı gösterilecek, kademe olarak mı?
- Eşleşme bulunamadığında akış nasıl devam edecek (sessizce yeni kayıt mı,
  "emin misiniz?" mi)

---

## 2. Bağış sistemi

### İstenen akış
Admin sayfasından bağış yapılabilecek kurumlar girilir. Uygulama üzerinden bu
kurumlara bağış yapılabilir; bağışların **%5'i platforma** kalır. Ayrıca doğrudan
uygulamaya da bağış yapılabilir ve bu seçenek listenin en üstünde çıkar.
Bağışlar toplam miktara göre rozet kazandırır.

### Önerilen yaklaşım
1. **Ödeme sağlayıcısı seçilmeli.** Türkiye'de kart işlemleri için iyzico ve
   PayTR yaygın seçenekler; ikisinin de "pazaryeri / alt üye işyeri" modeli var.
   **Bu model önemli:** komisyonun otomatik ayrılması ve kurumun payının
   doğrudan kuruma gitmesi için gerekiyor.
2. **Parayı önce kendi hesabınıza toplayıp sonra kuruma aktarmayın.** Bu model
   sizi "bağış toplayan taraf" hâline getirir ve Türkiye'de bağış toplamak
   izne tabidir (2860 sayılı Yardım Toplama Kanunu). Pazaryeri/split-payment
   modelinde para doğrudan kuruma gider, siz yalnızca hizmet komisyonu alırsınız
   — hem operasyonel hem hukuki olarak çok daha temiz.
3. **Mağaza kuralları:** Apple, kayıtlı hayır kurumlarına yapılan bağışların
   uygulama içi satın alma (IAP) ile **değil**, harici bir ödeme yöntemiyle
   alınmasını istiyor. Google'ın kuralı da benzer. Yani ödeme sağlayıcının kendi
   akışı kullanılacak, IAP değil. Bu kuralların güncel hâli entegrasyondan önce
   doğrulanmalı.
4. **"Uygulamaya bağış" ayrı bir kalem.** Bu bir hayır kurumu bağışı değil,
   platformun kendisine destek — mağaza tarafında farklı değerlendirilebilir ve
   %5 komisyon mantığı burada işlemez (zaten tamamı size gelir). Kullanıcıya da
   bu fark açıkça anlatılmalı.
5. **Şeffaflık.** %5'lik kesinti bağış ekranında, bağış yapılmadan önce açıkça
   yazılmalı. Hayır amaçlı ödemelerden komisyon almak hukuken ve itibar
   açısından hassas bir konu — bir mali müşavir/avukat teyidi almadan
   yayınlamayın.

### Veri modeli taslağı
```
donation_orgs      (id, name, logo_url, description, website, tax_id,
                    provider_submerchant_id, active, sort_order)
donations          (id, user_id, org_id NULL, amount, currency, platform_fee,
                    provider_payment_id, status, created_at)
                    -- org_id NULL = doğrudan uygulamaya bağış
```
Rozetler için `badges.js`'e yeni bir grup: toplam bağış miktarına göre
bronz/gümüş/altın/elmas (`donation:total`).

### Yapılacaklar
- [ ] Ödeme sağlayıcı seçimi + hesap açılışı + test ortamı
- [ ] Hukuki kontrol: komisyon modeli, bağış toplama izni gerekliliği,
      kullanıcıya gösterilecek metinler
- [ ] Şema: `donation_orgs`, `donations`
- [ ] Backend: kurum listesi, bağış başlatma, sağlayıcı webhook'u ile durum
      güncelleme, kullanıcı bağış geçmişi
- [ ] Admin: kurum CRUD, bağış raporu, komisyon raporu
- [ ] Mobil: bağış ekranı (uygulamaya bağış en üstte), ödeme akışı, makbuz
- [ ] Rozet: toplam bağış miktarına göre kademe

### Karar verilmesi gerekenler
- Hangi ödeme sağlayıcı?
- Şirket/şahıs şirketi kurulu mu? (üye işyeri hesabı için gerekli)
- Kurumlar sisteme nasıl dahil olacak — siz mi ekleyeceksiniz, başvuru mu
  alacaksınız? Alt üye işyeri kaydı için kurumun evrakları gerekiyor.
- Tekrarlayan (aylık) bağış olacak mı, yoksa yalnızca tek seferlik mi?

---

## 3. Reklam

### İstenen akış
Mama ve su ekleme pop-up'larının altında reklam çıkar: mama sayfasında mama
markası, su sayfasında su markası. Hayvan profilindeki hastalık takibi
bölümünde hastalık eklerken veteriner kliniği reklamı çıkar. Markalar admin
sayfasından girilir; **her tıkta sıra bir sonraki markaya geçer.**

### Önerilen yaklaşım
Hazır bir reklam ağı (AdMob vb.) değil, **kendi basit reklam sunucumuz** —
çünkü markalar elle giriliyor ve yerleşimler çok spesifik.

Üç yerleşim (slot): `food_popup`, `water_popup`, `vet_health_record`.

**Rotasyon:** "her tıkta sıra bir sonrakine geçer" ifadesini netleştirmek
gerekiyor. En mantıklı yorum: her yerleşim için bir imleç tutulur, reklam
gösterildikçe (veya tıklandıkça) sıradaki markaya geçilir. Bunu **sunucu
tarafında** yerleşim başına bir sayaçla yapmak en basiti; her kullanıcının kendi
sırasını görmesi isteniyorsa imleç kullanıcı bazında tutulur. Karar sizin —
ikisi de birkaç satır fark.

**Ölçüm şart:** Markalara "şu kadar gösterim, şu kadar tık" diyebilmek için
gösterim ve tıklama ayrı ayrı kaydedilmeli; bu olmadan reklam satılamaz.

### Veri modeli taslağı
```
advertisers   (id, name, logo_url, target_url, slot, weight, active,
               starts_at, ends_at, sort_order)
ad_events     (id, advertiser_id, user_id, type 'impression'|'click', created_at)
```

### Yapılacaklar
- [ ] Şema: `advertisers`, `ad_events`
- [ ] Backend: `GET /api/ads?slot=...` (rotasyonla bir reklam döner),
      `POST /api/ads/:id/click`, gösterim kaydı
- [ ] Admin: reklamveren CRUD, yerleşim seçimi, tarih aralığı, gösterim/tık raporu
- [ ] Mobil: mama pop-up'ı, su pop-up'ı ve sağlık kaydı ekleme ekranına reklam
      bandı; tıklayınca hedef URL'i aç
- [ ] Reklam yokken düzenin bozulmaması (boş slot durumu)

### Karar verilmesi gerekenler
- Rotasyon imleci global mi, kullanıcı başına mı?
- Reklam gösterilmeyecek durumlar var mı? (ör. bağış yapmış kullanıcıya
  reklamsız deneyim)
- Reklam bandı kapatılabilir olacak mı?

---

## 4. UI

### 4a. Tasarım sistemi (erken yapılmalı, küçük iş)
Bugün stiller her ekranda ayrı ayrı, doğrudan renk kodlarıyla yazılı
(`#2e7d32`, `#c62828`...). Yeni ekranlar eklenmeden önce ortak bir tema dosyası
çıkarılmalı:
- Renk, tipografi, boşluk, köşe yarıçapı, gölge token'ları
- Ortak bileşenler: `Button`, `Card`, `Chip`, `Avatar`, `Modal`, `EmptyState`
- Karanlık tema desteği düşünülecekse token yapısı buna göre kurulmalı

Bu adım küçük ama sonraki her ekranı hızlandırıyor ve giydirme aşamasında
yapılacak işi ciddi biçimde azaltıyor.

### 4b. Tam giydirme (en sona)
Tüm ekranların görsel olarak elden geçirilmesi. En sona bırakılmasının sebebi:
bağış, reklam ve YZ eşleştirme yeni ekranlar ekleyecek; erken yapılan giydirme
tekrar edilmek zorunda kalır.

### Yapılacaklar
- [ ] Tema/token dosyası + ortak bileşen kütüphanesi
- [ ] Mevcut ekranları ortak bileşenlere taşı
- [ ] Uygulama ikonu, açılış ekranı, marka kimliği
- [ ] Boş durum / yükleniyor / hata ekranlarının tutarlı hâle getirilmesi
- [ ] Erişilebilirlik: kontrast, dokunma alanı boyutları, ekran okuyucu etiketleri
- [ ] Tam görsel giydirme

### Karar verilmesi gerekenler
- Hazır bir tasarım var mı, yoksa sıfırdan mı kurulacak?
- Bir tasarımcıyla mı çalışılacak?

---

## 5. Admin sayfası (web)

### İstenen
Tüm uygulamanın kontrol edileceği, verinin takip ve manipüle edileceği web
tabanlı admin paneli.

### Önerilen yaklaşım
Aynı repo içinde yeni bir `admin/` klasörü; **React + Vite + TypeScript**.
Mevcut API'yi kullanır, ayrı bir backend kurulmaz. Kimlik doğrulama mevcut JWT
ile, ama **rol kontrolü eklenmeli**.

**Önce altyapı:**
- `users.role` kolonu zaten var (`'user' | 'vet' | 'admin'`) ama yalnızca sağlık
  kaydının "veteriner onaylı" işaretlenmesinde okunuyor — yetkilendirme için
  kullanılmaya başlanmalı
- `requireAdmin` middleware
- `/api/admin/*` route grubu
- Admin işlemlerinin denetim kaydı (`audit_log`) — kim neyi ne zaman değiştirdi.
  Veri manipüle edilebilen bir panelde bu olmadan hata ayıklanamaz.

**Panelde olması gerekenler:**
- **Gösterge paneli:** kullanıcı/hayvan/bakım sayıları, günlük aktivite grafiği,
  şehir bazlı dağılım
- **Kullanıcılar:** arama, detay, rol değiştirme, askıya alma, puan/rozet
  görüntüleme
- **Hayvanlar:** listeleme, düzenleme, silme, **mükerrer kayıtları birleştirme**
  (YZ eşleştirme gelene kadar elle çözüm)
- **Bakım kayıtları:** harita üzerinde ve liste hâlinde, **fotoğraf moderasyonu**
  (sahte/uygunsuz kayıtları silme) — bugün hiçbir moderasyon yok
- **Sağlık kayıtları:** görüntüleme, gerekirse düzeltme
- **Reklamverenler** (madde 3) ve **bağış kurumları** (madde 2) CRUD + raporlar
- **İçerik moderasyonu:** yorum silme, kullanıcı şikâyetleri

### Yapılacaklar
- [ ] Şema: `audit_log` (denetim kaydı)
- [ ] Backend: `requireAdmin`, `/api/admin/*` uç noktaları, denetim kaydı
- [ ] `admin/` web projesi (Vite + React + TS), giriş ekranı, yetki koruması
- [ ] Gösterge paneli
- [ ] Kullanıcı / hayvan / bakım kaydı yönetim ekranları
- [ ] Reklamveren ve bağış kurumu yönetimi (2 ve 3 ile birlikte)
- [ ] Dağıtım: admin paneli nerede yayınlanacak, kim erişebilecek

### Karar verilmesi gerekenler
- İlk admin kullanıcısı nasıl oluşturulacak? (script / elle SQL)
- Panel herkese açık bir adreste mi olacak, yoksa IP kısıtlı mı?
- İki aşamalı doğrulama (2FA) gerekli mi? Veri manipüle edilebilen bir panel
  için önerilir.

---

## Üretime çıkmadan önce (bu beş maddeden bağımsız)

Bunlar özellik değil, "yayınlanabilir hâle gelme" işleri —
[NOTLAR.md](NOTLAR.md#3-bilinen-sınırlar-ve-teknik-borç) içinde gerekçeleriyle
duruyor:

- [ ] Fotoğrafları nesne depolamaya (S3/R2) taşı + görsel yeniden boyutlandırma
- [ ] Artımlı migrasyon aracına geç
- [ ] Rate limit + kötüye kullanım koruması
- [ ] Backend testleri + CI
- [ ] Gerçek arka plan bildirimi (APNs/FCM) veya geofencing
- [ ] Konum override kodunu kaldır
- [ ] CORS'u kısıtla, JWT iptal mekanizması
- [ ] KVKK: aydınlatma metni, gizlilik politikası, veri silme akışı
- [ ] Mağaza hazırlığı: ikon, ekran görüntüleri, gizlilik beyanı
