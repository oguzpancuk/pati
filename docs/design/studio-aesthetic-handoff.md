# Handoff: pati — mobil uygulama UI (4 ekran)

## Genel bakış
pati, sokak hayvanlarının bakımını koordine eden bir mobil uygulama (mama/su haritası, hayvan profilleri, rozetler, gönüllü profili). Bu paket, uygulamanın 4 ana ekranının onaylanmış tasarımını içerir: Giriş, Harita, Hayvan Detay, Profilim. Arayüz dili Türkçe, tüm arayüz metinleri küçük harf ağırlıklı.

## Tasarım dosyaları hakkında
`PatiApp.dc.html` **HTML ile hazırlanmış bir tasarım referansıdır** — amaçlanan görünümü ve davranışı gösteren prototiptir, doğrudan kopyalanacak üretim kodu değildir. Görev: bu tasarımı hedef kod tabanının mevcut ortamında (React vb.) mevcut kalıplarıyla **yeniden üretmek**. Ortam yoksa React Native / Flutter / React (PWA) arasından projeye en uygun olanı seçip orada uygulayın. Dosyadaki dört ekran, telefon çerçeveleri (bezel, notch, saat çubuğu) içinde sunulur — bunlar sunum amaçlıdır, uygulamaya dahil değildir.

## Fidelity
**High-fidelity (hifi).** Renkler, tipografi, boşluklar ve köşe yarıçapları nihaidir; piksel hassasiyetinde yeniden üretilmelidir. Ölçüler 390×812 (iPhone mantıksal pt) tuvale göredir.

## Tasarım tokenları
- **Turuncu degrade (yalnızca: logo, birincil düğme, ilerleme çubuğu, seçili pil):** `linear-gradient(135deg, #F4581C, #F9A052)` (ilerleme çubuğunda 90deg)
- **Vurgu turuncu (link/aktif ikon/mikro etiket):** `#E05E2B`
- **Metin (kömür):** `#21201E`; ikincil `#8A8580`; soluk `#B5AFA8`; gövde ara tonu `#4A4744`
- **Zemin:** ekranlar saf beyaz `#FFFFFF`; harita zemini `#F7F0E7`
- **Kılcal çizgiler:** kart kenarlığı `#F6E8DA` (1px), dış/giriş kenarlığı `#F3E4D4`, kesikli foto çerçevesi `#EFD9C4`
- **Krem dolgular:** foto placeholder `#FFF3E7`, yorum girişi `#FFF6EC`
- **Durum renkleri:** yeşil `#34A853` (onay/kapsama; koyu metin `#2A8A45`), sarı `#F5B841` (sürüyor; metin `#B27D0A`)
- **Harita:** sokaklar beyaz (14px ve 6px @.7 çizgiler), binalar `#EFE5D8`, kapsama halkaları `rgba(52,168,83,.2/.13/.09)` + aynı tonda 1.5px kontur, konum noktası kömür + beyaz halka, 200 m yarıçapı 1.2px kesikli kömür `.35`
- **Köşe yarıçapı:** kartlar 18px, girişler/düğmeler 16-18px, piller 999px, telefon ekranı 40px
- **Gölge:** yalnızca birincil düğmede `0 14px 28px -14px rgba(224,94,43,.6)`; haritadaki yüzen öğelerde `0 8px 20px -12px rgba(20,20,20,.25)`
- **Animasyon:** kapsama halkalarında "nefes" — `@keyframes patiNefes {0%,100%{opacity:.42} 50%{opacity:.72}}`, 4.5s ease-in-out infinite, 1.5s kademeli gecikme

## Tipografi
Tek aile: **Quicksand** (Google Fonts; 400/500/600/700).
- Ekran başlığı / isim: 500, 24-25px
- Kelime işareti "pati": 600, 44px, letter-spacing .14em
- Büyük rakamlar (istatistik): 400, 26px
- Bölüm mikro etiketleri: 600, 10.5px, letter-spacing .24em, **küçük harf** (`aşı kayıtları`, `bakım verdiğim hayvanlar`…)
- Sekme etiketleri: 600, 10px, letter-spacing .18em, küçük harf
- Gövde: 600, 13-14px; ikincil 600 11.5-13px
- Kural: BÜYÜK HARF KULLANILMAZ; vurgu, harf aralığı + renk ile verilir.

## Logo
Pati izi + harita iğnesi birleşimi, kalp boşluklu. SVG geometri (viewBox 0 0 120 130):
- 4 parmak elipsi: (18,47 r12.5×16.5 rot-24), (44,25 r12.5×17.5 rot-9), (76,25 r12.5×17.5 rot9), (102,47 r12.5×16.5 rot24)
- İğne gövdesi: `M60 48C76.6 48 90 61.4 90 78c0 18-22 38-30 44-8-6-30-26-30-44 0-16.6 13.4-30 30-30z`
- Kalp boşluğu (zemin renginde dolgu): `M60 90c-13-9-17-15.5-17-21 0-5.2 3.8-9 8.6-9 3.4 0 6.6 2 8.4 5 1.8-3 5-5 8.4-5 4.8 0 8.6 3.8 8.6 9 0 5.5-4 12-17 21z`
- Dolgu: turuncu degrade (dikey). Kalp boşluğu HER ZAMAN zeminin rengiyle dolar, ayrı renk almaz.

## Ekranlar

### 1. Giriş (3a)
- Dikey ortalanmış: logo (118×128px) + hemen altında (−8px bindirme) "pati" kelime işareti. Slogan/çizgi YOK — sade.
- Form (yatay padding 34px): e-posta ve şifre alanları — 1px `#F3E4D4` kenarlık, radius 18, içinde 10px küçük harf etiket (`e-posta`) + 15.5px değer.
- Birincil düğme "Giriş yap": degrade, radius 18, 16px padding, gölgeli.
- Metin düğmesi: "Hesabın yok mu? **Kayıt ol**" (kayıt ol `#E05E2B`).
- Altta soluk not: "Kayıt olursan sana rastgele bir avatar atanır, profilden değiştirebilirsin."

### 2. Harita (3b)
- Tam ekran harita; üstte yüzen Mama/Su segmenti (beyaz pil kabı, seçili yarı degrade dolgu, küçük harf `mama`/`su`).
- Haritada: yeşil kapsama halkaları (nefes animasyonlu) + merkez noktaları, hayvan avatarı işaretçileri (42px beyaz daire içinde), kullanıcı konumu (kömür nokta + kesikli 200 m halkası), eksik nokta için degrade logo iğnesi.
- Sağ altta beyaz `+` FAB (46px, turuncu +, 1px kenarlık).
- Alt sayfa (boş durum → eyleme çeviren öneri): tutamaç çubuğu; mikro etiket `300 m çevrede kayıt yok`; başlık "Buralarda mama yok" (21px/500); alt metin "İlk kaydı sen bırak, bölge yeşile dönsün."; tam genişlik degrade düğme "Buraya mama bıraktım" (mama kabı ikonu ile).
- Alt sekme çubuğu: harita (aktif, turuncu) / hayvanlar / profilim — 1.6px stroke ikonlar, küçük harf etiketler.

### 3. Hayvan Detay (3c)
- Üst bar: ← geri + ortada `hayvan detay` mikro etiketi.
- Başlık: 64px hayvan avatarı + "Karamel" (25px/500) + "Kahverengi · Sokak melezi · göğsünde beyaz leke".
- 3 fotoğraf placeholder'ı (56px, kesikli `#EFD9C4` çerçeve, `#FFF3E7` dolgu, `fotoğraf` etiketi) — gerçek fotoğraflarla değişecek.
- `aşı kayıtları` bölümü (+ aşı ekle linki): kart — "Kuduz" + yeşil noktalı `veteriner onaylı` + "14 Tem 10:20 · Mehmet Kaya · Sonraki doz: 14 Tem 2027".
- `sağlık kayıtları` (+ kayıt ekle): kart — "Ön ayakta topallama" + sarı noktalı `tedavi sürüyor` + "Ayşe Yılmaz · 4 yorum · dokunarak kayıtları gör" + yeşil konturlu pil düğme "✓ iyileşti".
- `sohbet`: kullanıcı avatarı + isim + zaman + mesaj. Altta sabit yorum satırı: krem giriş "Yorum yaz…" + degrade "Gönder".
- Bölümler 1px üst kılcal çizgiyle ayrılır (kart yığını değil).

### 4. Profilim (3d)
- Başlık: 60px kullanıcı avatarı + "Ayşe Yılmaz" + e-posta + turuncu mikro etiket `dokun, avatarını seç` (avatar seçiciyi açar).
- İstatistik şeridi (tek kart, dikey 1px bölücülerle 3 hücre): 154 `puan` / 38. `sıra / 1.204` / 3 `seviye`.
- Seviye kartı: "Düzenli Gönüllü" + "96 puan sonra: Mahalle Sorumlusu" + 4px degrade ilerleme çubuğu (%34).
- `öne çıkan rozetlerim` (seç / tümü): 3 rozet kartı (rozet simgesi + ad + ilerleme "120/250" vb.).
- `bakım verdiğim hayvanlar` (+8 daha): hayvan satırları (avatar + ad + tür + ›).
- `görünüm`: pil segment `sistem` (seçili, degrade) / `açık` / `koyu`.
- Ortada soluk `çıkış yap` metin linki; alt sekmede profilim aktif.

## Etkileşimler ve davranış
- Sekmeler: harita ↔ hayvanlar ↔ profilim navigasyonu.
- Harita: Mama/Su segmenti işaretçi setini filtreler; avatar işaretçisine dokunma → hayvan detay; `+` FAB → yeni kayıt; alt sayfadaki düğme mevcut konuma mama kaydı ekler (bölge yeşile döner — 200 m kural: kayıtlar kullanıcının 200 m yakınında yapılabilir).
- Boş durum: 300 m çevrede kayıt yoksa alt sayfa öneri modunda ("Buralarda mama yok").
- Hayvan detay: "✓ iyileşti" sağlık kaydını kapatır; yorumlar kayda bağlanabilir; + aşı ekle / + kayıt ekle formları açar.
- Profil: avatara dokunma avatar seçici açar; görünüm segmenti tema değiştirir (sistem/açık/koyu); rozet ilerlemeleri puanlarla dolar.
- Kapsama halkaları sürekli "nefes" animasyonu yapar (yukarıdaki keyframes).

## State
- auth (giriş/kayıt), seçili sekme, harita filtresi (mama|su), kullanıcı konumu + çevredeki kayıtlar/hayvanlar, seçili hayvan + aşı/sağlık kayıtları + yorumlar, kullanıcı profili (puan, seviye, sıra, rozetler, bakım listesi), tema tercihi.

## Hazır bileşenler (mevcut kod tabanında var)
Tasarım, pati-web kütüphanesindeki gerçek React bileşenlerini kullanır — yeniden yazmayın, mevcutları kullanın: `AnimalAvatar` (tür+cins bazlı hayvan avatarı), `UserAvatar` (`pati-avatar:f3` gibi id'ler), `BadgeSymbol` (symbol: food/water/comment, tier: gold/silver/bronze). Harita, durum pilleri, kartlar ve navigasyon bu handoff'a göre yeniden üretilecek.

## Varlıklar
- Logo: yukarıdaki SVG geometrisi (ayrı dosya gerekmez).
- Quicksand: Google Fonts.
- Fotoğraflar: placeholder — gerçek içerik kullanıcılardan gelir.
- Harita: prototipte stilize SVG; üretimde harita SDK'sına (ör. MapLibre/Mapbox) özel stil uygulanmalı: zemin `#F7F0E7`, yollar beyaz, binalar `#EFE5D8`, POI/etiket gürültüsü kapalı.

## Dosyalar
- `PatiApp.dc.html` — 4 ekranın hifi tasarımı (tek dosya, telefon çerçeveleri içinde; `_ds/` tasarım sistemi bundle'ına ve `PatiDS.*` bileşenlerine referans verir).
