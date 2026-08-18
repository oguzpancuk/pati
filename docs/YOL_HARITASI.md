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
✅ 1. Admin paneli (madde 5)  ──┬──> ✅ 2. Reklam (madde 3)
   + rol/yetki altyapısı        └──> ⏸️  Bağış (madde 2) — ertelendi,
                                          dış taraflar netleşince
3. YZ hayvan eşleştirme (madde 1)  ← SIRADA (dış bağımlılığı yok)
4. Tasarım sistemi (madde 4a)         (erken, küçük)
5. UI giydirme (madde 4b)             (en son, tüm ekranlar oturunca)
```

> **Bağış neden ertelendi:** Bloke ediciler kod değil dış taraflar — ödeme
> sağlayıcı, tüzel kişilik, mali müşavir/avukat, mağaza kuralları. Karar listesi
> [madde 2](#2-bağış-sistemi--️-ertelendi) altında hazır bekliyor.

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

### 📊 Spike sonuçları (18 Ağustos 2026) — maliyet ve hız ölçüldü

**Ölçüm ortamı:** 4 çekirdek CPU, GPU yok. Gömme modeli için rastgele ağırlıklı
ama **gerçek mimari** kullanıldı — ileri geçiş süresi mimariye ve girdi boyutuna
bağlı, ağırlıkların eğitilmiş olmasına değil. Yani bu milisaniyeler gerçek
DINOv2/CLIP ağırlıklarıyla da aynı çıkar.

**Fotoğrafı vektöre çevirme (CPU, kayıt başına 3 fotoğraf, toplu işlenmiş):**

| Model | 1 fotoğraf | 3 fotoğraf | Kayıt başına |
| --- | --- | --- | --- |
| ViT-B/16 (86M) — DINOv2 base sınıfı | 136 ms | 335 ms | **0,33 sn** |
| ViT-B/32 (88M) — CLIP ViT-B/32 sınıfı | 49 ms | 84 ms | **0,08 sn** |
| ResNet-50 (25M) | 51 ms | 101 ms | 0,10 sn |
| MobileNetV3-L (5M) | 16 ms | 28 ms | 0,03 sn |

**Vektör araması (pgvector 0.6, 25.000 hayvan × 3 fotoğraf = 75.000 vektör, 768 boyut):**

| Aday kümesi | Vektör sayısı | Süre |
| --- | --- | --- |
| 1 km yarıçap | ~300 | **4 ms** |
| 3 km yarıçap | ~2.850 | 20 ms |
| 10 km yarıçap | ~31.400 | 261 ms |
| Coğrafi daraltma yok (tam tarama) | 75.000 | 309 ms |

**Depolama:** 75.000 vektör + GIST indeksi = **309 MB**.

#### Sonuçlar

1. **Kullanıcının bekleyeceği ek süre ~0,35 saniye** (ViT-B/16 + 1 km arama).
   Önceki tahminim 1–2 saniyeydi; gerçek ölçüm daha iyi çıktı. **GPU gerekmiyor.**
2. **İstek başına ücret yok** — model kendi sunucumuzda çalışıyor. Maliyet =
   sunucuya ~2 GB ek RAM. Binlerce kullanıcıda bile model günde ~200 kez
   çalışıyor (hayvan kaydı nadir bir eylem), yani sunucu boş duruyor.
3. **Coğrafi daraltma her şeyi belirliyor:** 1 km'de 4 ms, daraltma olmadan
   309 ms — 75 kat fark. PostGIS ile önce daraltmak mimarinin en kritik parçası.
4. **Model seçimi bir denge:** ViT-B/32, ViT-B/16'dan 4 kat hızlı ve vektörü
   daha küçük (512 vs 768 boyut → %33 daha az depolama). İsabet ölçülünce hangisinin
   yeteceğine karar verilecek.

#### ⚠️ Henüz ölçülemeyen: isabet

Asıl risk maliyet değil, modelin sokak koşullarında (kötü ışık, uzaktan çekim,
hareketli hayvan) **aynı kediyi tanıyıp tanımaması**. Bu ölçüm bu ortamda
yapılamadı: sanal makinenin ağ politikası model ağırlığı ve veri seti
sunucularını (huggingface.co, download.pytorch.org, GitHub release, GCS)
engelliyor. Yalnızca PyPI açık — paket kurulabiliyor ama eğitilmiş ağırlık
indirilemiyor.

**İsabet ölçümü için gereken (biri yeterli):**
- Aynı sokak hayvanının farklı zaman/açılardan çekilmiş fotoğrafları (10–20 hayvan
  × 3–4 fotoğraf yeterli bir ilk sinyal verir), **veya**
- Ağ erişimi açık bir ortamda (yerel makine) ölçümün çalıştırılması — script
  hazırlanabilir, kimlik doğrulama gerektirmeyen açık veri setleri var

**Ölçülecek metrik:** "aynı hayvanın ikinci fotoğrafı ilk 5 sonuçta çıkıyor mu?"
(top-5 isabet). Ayrıca yanlış eşleşme oranı — farklı hayvanlar için skor eşiği.

> **Kurulum notu:** `pgvector` ayrı bir PostgreSQL eklentisi. Mevcut
> `imresamu/postgis` imajında olmayabilir; entegrasyona geçilirken imajın
> pgvector içerdiği doğrulanmalı veya `postgresql-16-pgvector` paketi kurulmalı.

<details>
<summary>Tam plan</summary>

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
- ~~Gömme servisi nerede koşacak, CPU yeterli mi?~~ → **CPU yeterli, GPU
  gerekmiyor** (spike ölçümü: kayıt başına 0,33 sn)
- Skor kullanıcıya sayı olarak mı gösterilecek, kademe olarak mı?
- Eşleşme bulunamadığında akış nasıl devam edecek (sessizce yeni kayıt mı,
  "emin misiniz?" mi)
- ViT-B/16 mı ViT-B/32 mi? (isabet ölçülünce netleşecek — B/32 dört kat hızlı)

</details>

---

## 2. Bağış sistemi — ⏸️ ertelendi

> **Durum: ertelendi (18 Ağustos 2026).** Karar: *"orada netleştirilmesi gereken
> çok taraf var."* Doğru karar — bu maddenin bloke edicileri kod değil, dış
> taraflar: ödeme sağlayıcı, tüzel kişilik, mali müşavir/avukat ve mağaza
> kuralları. Bunlar netleşmeden yazılan kod büyük ihtimalle çöpe gider.
>
> Aşağıdaki **karar listesi** hazır bekliyor; bu dört başlık netleşince madde
> hemen açılabilir.

### Kod yazmadan önce netleşmesi şart

| # | Karar | Neden bloke ediyor |
| --- | --- | --- |
| 1 | **Ödeme sağlayıcı ve model** — pazaryeri (split payment) mi, tek hesap mı? | Veri modeli ve para akışı buna göre şekilleniyor. *Önerilen: pazaryeri* |
| 2 | **Tüzel kişilik** — şirket kurulu mu, üye işyeri hesabı kimin adına? | Test ortamından öteye geçilemez |
| 3 | **Hukuki teyit** — %5 komisyon + bağış toplama izni (2860 sayılı kanun) | Yanlış model = izinsiz bağış toplama riski |
| 4 | **Mağaza kuralları** — Apple/Google'ın hayır kurumu bağışı kuralları (IAP değil harici ödeme) | Yanlış entegrasyon = mağaza reddi |

**Neden pazaryeri modeli öneriliyor:** Parayı önce kendi hesabınıza toplayıp
sonra kuruma aktarmak sizi "bağış toplayan taraf" yapar ve Türkiye'de bağış
toplamak izne tabidir (2860 sayılı Yardım Toplama Kanunu). Pazaryeri modelinde
para doğrudan kuruma gider, siz yalnızca hizmet komisyonu alırsınız — hem
operasyonel hem hukuki olarak temiz.

### Ürün kararları (kod yazarken lazım, bloke etmiyor)

- Kurumlar sisteme nasıl dahil olacak — siz mi ekleyeceksiniz, başvuru mu?
  (alt üye işyeri kaydı için kurumun evrakları gerekiyor)
- Tekrarlayan (aylık) bağış olacak mı? *Önerilen: ilk sürümde yalnızca tek seferlik*
- Tutar seçenekleri: sabit butonlar mı, serbest giriş mi, alt/üst limit?
- "Uygulamaya bağış" kalemi kullanıcıya nasıl anlatılacak? (hayır kurumu bağışı
  değil, platforma destek — %5 mantığı burada işlemiyor)
- Anonim bağış olacak mı? Bağış yapan profilinde/listede görünecek mi?
- Bağış yapana reklamsız deneyim? (madde 3'ten kalan açık soru)

### ⚠️ Üzerinde durulması gereken tasarım kararı

**Bağış puanı liderlik tablosuna girmeli mi?**

Rozet kısmı sorunsuz. Ama o rozetlerin puanı liderlik tablosuna eklenirse
sıralama "en çok bakan" değil kısmen "en çok ödeyen" listesine dönüşür. Şimdiye
kadar kurulan her şey (seri rozetleri, yorum puanının genişliğe göre
ağırlıklandırılması) tam da bunu engellemek üzerineydi.

**Önerilen:** Bağış rozetleri ayrı bir vitrin olsun, liderlik puanına girmesin.
Profilde görünsün, öne çıkan 3 rozet arasında seçilebilsin, ama sıralamayı
etkilemesin. İstenirse ayrı bir "Destekçiler" listesi yapılabilir. Bu bağışı
değersizleştirmez — sadece iki farklı katkı türünü karıştırmaz.

<details>
<summary>Teknik plan (kararlar netleşince açılacak)</summary>

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

*(Karar listesi yukarı taşındı.)*

</details>

---

## 3. Reklam — ✅ tamamlandı

**Yapıldı (18 Ağustos 2026):** Üç yerleşim (`food_popup`, `water_popup`,
`vet_health_record`), admin panelinde reklamveren yönetimi (görsel yükleme,
kampanya tarih aralığı, yayına alma/durdurma, sıra), mobilde `AdBanner` bileşeni
ve gösterim/tık ölçümü + CTR raporu.

**Rotasyon kararı:** Ayrı bir imleç tablosu yok — sıra, kullanıcının o yerleşimde
kaç kez reklam gördüğünden türetiliyor (`gösterim_sayısı % marka_sayısı`).
Gösterimler zaten faturalama için kaydedildiğinden ekstra durum tutmadan hem
**kullanıcı bazında** hem eşit dağılımlı bir sıra elde ediliyor. Global imleç
tercih edilmedi: iki kişi aynı anda açtığında ikisi de aynı markayı görürdü.
Gerekçenin tamamı [NOTLAR.md](NOTLAR.md) içinde.

**Kalanlar:**
- [ ] Giriş/gösterim uç noktalarına rate limit (sahte gösterim üretimine karşı)
- [ ] Bağış yapmış kullanıcıya reklamsız deneyim (madde 2 gelince karar verilecek)
- [ ] Reklam bandının kapatılabilir olup olmayacağı

<details>
<summary>Orijinal plan (referans için)</summary>

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

</details>

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

## 5. Admin sayfası (web) — ✅ temel panel tamamlandı

**Yapıldı (18 Ağustos 2026):** `admin/` klasöründe React + Vite + TypeScript
paneli. Altyapı: `requireAdmin` middleware, `/api/admin/*` route grubu,
`users.suspended_at` ile askıya alma ve `audit_log` denetim kaydı. Ekranlar:
gösterge paneli (30 günlük aktivite grafiği), kullanıcı yönetimi, hayvan yönetimi
+ mükerrer birleştirme, bakım kaydı fotoğraf moderasyonu, yorum moderasyonu,
denetim kaydı. İlk yönetici `npm run make-admin` scriptiyle oluşturuluyor.

**Kalanlar:**
- [ ] Reklamveren yönetimi (madde 3 ile birlikte)
- [ ] Bağış kurumu yönetimi ve raporları (madde 2 ile birlikte)
- [ ] Panelin dağıtımı: nerede yayınlanacak, IP kısıtı olacak mı, 2FA gerekli mi
- [ ] Giriş uç noktasına rate limit (parola deneme saldırısına karşı)

<details>
<summary>Orijinal plan (referans için)</summary>

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
- ~~İlk admin kullanıcısı nasıl oluşturulacak?~~ → `npm run make-admin` scripti
- Panel herkese açık bir adreste mi olacak, yoksa IP kısıtlı mı? **(hâlâ açık)**
- İki aşamalı doğrulama (2FA) gerekli mi? Veri manipüle edilebilen bir panel
  için önerilir. **(hâlâ açık)**

</details>

---

## 🚀 Yayına Çıkma Sprint'i — ertelendi, unutulmayacak

> **Durum: ertelendi (18 Ağustos 2026).** Karar: "yayına çıkmaya daha çok var,
> şimdilik admin panelinden devam edelim." Bu bölüm bilerek burada duruyor —
> özellik geliştirmeye devam edilse bile bu maddeler **gerçek bir kullanıcı
> uygulamaya dokunmadan önce** kapatılmak zorunda. Aşağıdaki maddelerden biri
> bile eksikken canlıya çıkılırsa veri kaybı, kötüye kullanım veya KVKK sorunu
> yaşanır.
>
> **Bu sprint'i her büyük iş bitiminde tekrar gündeme getir.**

Bunlar özellik değil, "yayınlanabilir hâle gelme" işleri —
[NOTLAR.md](NOTLAR.md#3-bilinen-sınırlar-ve-teknik-borç) içinde gerekçeleriyle
duruyor. Tahmini süre: 1–2 hafta.

**Veri güvenliği (bunlar olmadan gerçek veri girilmemeli):**
- [ ] Fotoğrafları nesne depolamaya (S3/R2) taşı + görsel yeniden boyutlandırma
      — bugün sunucunun yerel diskinde, konteyner yeniden oluşturulunca kayboluyor
- [ ] Artımlı migrasyon aracına geç (node-pg-migrate / Knex) — bugün şema
      değişince veritabanı sıfırlanıyor
- [ ] Veritabanı yedeği (yönetilen Postgres kullanılacaksa otomatik gelir)

**Kötüye kullanım koruması:**
- [ ] Rate limit (özellikle `POST /care-actions` ve yorum uç noktalarında)
- [ ] Fotoğraf moderasyonu — admin panelinin bir parçası (madde 5)
- [ ] Kullanıcı askıya alma + JWT iptal mekanizması
- [ ] CORS'u kısıtla

**Hukuk / mağaza:**
- [ ] KVKK: aydınlatma metni, gizlilik politikası, veri silme akışı
- [ ] Mağaza hazırlığı: ikon, ekran görüntüleri, gizlilik beyanı
- [ ] Konum override kodunu kaldır (`mobile/src/location.ts`)

**Kalite:**
- [ ] Backend testleri + CI (bugün backend'de hiç otomatik test yok)
- [ ] Gerçek arka plan bildirimi (APNs/FCM) veya geofencing — bugün bildirimler
      yalnızca uygulama çalışırken geliyor

**Dağıtım:**
- [ ] Backend'i bir sunucuya deploy et (Fly.io / Railway / Hetzner) + yönetilen
      PostgreSQL + PostGIS
- [ ] TestFlight (iOS) ve Play internal testing (Android) derlemeleri
- [ ] Tek bir mahallede 10–20 gerçek kullanıcıyla pilot
