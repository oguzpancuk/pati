# pati Pilot Programı — İzmir · Hatay

Pilot bölgesi: **İzmir, Hatay (renkli mahalle çevresi)** — veteriner kliniği
burada, çevresinde güçlü bir hayvansever ağı var. Amaç tek bir bölgede harita
yoğunluğu yaratmak: pati konum bazlı olduğu için değer ancak aynı mahallede
yeterli sayıda aktif kullanıcı olunca görünür oluyor.

## Ön koşul — pilottan önce kapanacaklar

Gerçek kullanıcı davet edilmeden önce **yayına çıkma sprint'i** kapanmalı
(bkz. [ROADMAP.md](../ROADMAP.md)): fotoğrafların nesne depolamaya
taşınması, artımlı migrasyon, rate limit, moderasyon, **KVKK metinleri**
(gerçek konum verisi toplamadan önce yasal zorunluluk), deploy. Bu doküman
ve ekindeki tanıtım dosyası sprint sürerken hazır bekler; davetler sprint
kapanınca gönderilir.

## Aşamalar

| Aşama | Süre | İçerik | Başarı ölçütü |
| --- | --- | --- | --- |
| 0 — Hazırlık | sprint süresince | Tanıtım PDF'i veterinerlere gider, ilgilenenler listelenir | 8–10 veteriner "varım" der |
| 1 — Çekirdek | 1. hafta | Veterinerler + her birinin davet ettiği 5–10 müdavim müşteri kaydolur | Bölgede 30–50 aktif kullanıcı |
| 2 — Kullanım | 2.–4. hafta | Günlük mama/su işaretleme, hayvan profilleri, sağlık kayıtları | Haftada kullanıcı başına ≥3 bakım kaydı; haritada sönmeyen yeşil çekirdek |
| 3 — Değerlendirme | 5. hafta | Geri bildirimlerin toplanması, yol haritasına işlenmesi, genişleme kararı | İkinci mahalleye çıkma kararı verilebilecek veri |

Haftalık takip her pazartesi otomatik brief ile yapılır (durum, metrikler,
bekleyen kararlar).

## Davet metni (WhatsApp — veterinerlere, teyze üzerinden)

> Merhaba 🧡 Yeğenim sokak hayvanlarının bakımını koordine eden **pati** adında
> bir uygulama geliştirdi: mahallede kim nereye mama/su bırakmış haritada
> görünüyor, her sokak hayvanının fotoğraflı profili ve sağlık kaydı tutuluyor.
> İlk pilotu Hatay'da, bizim çevremizle başlatıyoruz. Kliniğinizin çevresindeki
> hayvansever müşterilerinizden 5–10 kişiyi davet etmenizi ve 4 hafta boyunca
> denemenizi istiyoruz — karşılığında bölgenizdeki hayvanların sağlık geçmişi
> tek ekranda ve uygulama içinde klinik görünürlüğü pilot boyunca ücretsiz.
> Ekteki tek sayfada özet var; ilgilenirseniz Oğuz sizi arasın mı?

## Haftalık geri bildirim soruları (veteriner + kullanıcı, 5 dakika)

1. Bu hafta uygulamayı kaç gün açtınız? Ne için?
2. Sizi durduran bir şey oldu mu (hata, anlaşılmayan ekran, yavaşlık)?
3. Haritadaki bilgi gerçeği yansıtıyor mu? (yeşil alanlar, hayvan konumları)
4. Sağlık kaydı akışı klinikteki gerçek akışınıza uyuyor mu? Neresi uymuyor? *(veteriner)*
5. Olmasını en çok istediğiniz tek şey ne?
6. Uygulamayı bir meslektaşınıza/komşunuza tavsiye eder miydiniz? Neden?

Yanıtlar her hafta `docs/pilot/geribildirim/` altına tarihli dosya olarak
işlenir; tekrarlayan temalar yol haritasına taşınır.

## Kanal sıralaması (karar)

1. **Veteriner ağı önce** — yoğunluk ve güvenilirlik getirir; sağlık kaydı
   özelliğinin doğal kullanıcısı; reklam sistemindeki "veteriner" yerleşiminin
   ilk (ücretsiz) müşterileri.
2. **Influencer dalgası sonra** — pilot oturup harita canlandıktan sonra.
   Erken kullanılırsa boş haritaya gelen kullanıcı döner, ani yük yayın
   sprint'i kapanmadan altyapıyı zorlar ve bu ilişkilerin kredisi bir kez yanar.
   Hayvansever niş mikro-influencer'lar önceliklidir.
