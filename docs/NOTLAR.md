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

### Rozet isimleri bilerek sıcak ve esprili
İlk sürümde cins rozetleri "Tekir Avcısı" gibi isimlendirilmişti; "avcı" bu ürüne
yakışmayan agresif bir çağrışım taşıyor — burada kovalanan bir av değil bakılan
bir canlı var. Şimdiki isimler dostluk üzerinden kuruluyor: Tekir Ahbabı, Sarman
Sırdaşı, Kara Kedi Kankası, Kangal Yoldaşı, Mama Perisi, Su Elçisi, Mahalle
Muhabiri, Mahalle Dedikoducusu, Pati Şifacısı. Kademe sıfat olarak öne geliyor:
"Altın Tekir Ahbabı".

### Rozet kazanma anı saklanıyor, rozetin kendisi saklanmıyor
Rozetler türetilmiş veri (istenildiği an yeniden hesaplanabiliyor), ama "bu rozeti
ne zaman kazandın ve o an kaçıncı sıradaydın" bilgisi geçmişe dönük
hesaplanamıyor — sıralama başkalarının puan kazanmasıyla da değişiyor. Bu yüzden
`user_badge_awards` tablosu yalnızca **kazanma anının fotoğrafını** tutuyor:
puan öncesi/sonrası, sıralama öncesi/sonrası, seviye öncesi/sonrası.

"Önceki sıralama" değeri `users.last_rank` anlık görüntüsünden geliyor ve bu
görüntü hem rozet kazanıldığında hem profil açıldığında tazeleniyor — yani
pratikte "en son baktığında kaçıncıydın" anlamına geliyor. İlk rozette
karşılaştırılacak bir değer olmadığı için `rank_before` NULL kalıyor; arayüz bu
durumu ayrıca ele alıyor.

### Sıralama yalnızca gerçekten yeni rozet varsa hesaplanıyor
`syncBadgeAwards` her puan kazandıran işlemden sonra çalışıyor, ama pahalı kısmı
(tüm kullanıcıları tarayan sıralama hesabı) sadece gerçekten yeni bir rozet
kazanıldığında yapılıyor. Ayrıca rozet senkronizasyonu bir yan iş olduğu için
hata verirse asıl işlem (mama bırakma, yorum...) düşürülmüyor — kullanıcı
açısından rozetin gecikmesi, işlemin başarısız olmasından iyidir.

### Seed script rozetleri "görülmüş" olarak işliyor
Demo kullanıcıların 30 günlük serileri onlarca rozet üretiyor. Backfill olmasaydı
bir demo hesapla yapılan ilk aksiyonda bu rozetlerin hepsi aynı anda kutlama
popup'ı olarak patlıyordu. `seed-demo.js` bu yüzden mevcut rozetleri
`seen_at = now()` ile yazıyor.

> Aynı durum gerçek kullanıcılar için de geçerli: bu özellik canlıya alındığında
> mevcut kullanıcılar bir sonraki aksiyonlarında birikmiş tüm rozetlerini
> görecek. Sıfırdan bir veritabanında sorun değil, ama veri varken deploy
> edilecekse benzer bir backfill çalıştırılmalı.

### Reklam rotasyonu ayrı bir imleç tutmuyor
"Her tıkta sıra bir sonraki markaya geçsin" isteniyordu. Sırayı bir imleç
tablosunda tutmak yerine, **kullanıcının o yerleşimde kaç kez reklam gördüğünden**
türetiyoruz: `index = gösterim_sayısı % marka_sayısı`. Gösterimleri zaten
faturalama için kaydediyoruz, yani ekstra durum tutmadan hem kullanıcı bazında
hem eşit dağılımlı bir sıra elde ediliyor.

Global bir imleç yerine kullanıcı bazında olmasının sebebi: global imleçte iki
kişi aynı anda açtığında ikisi de aynı markayı görür ve tek bir kullanıcı arka
arkaya açtığında sıra atlar. Kullanıcı bazında herkes markaları sırayla görüyor.

Bedeli: marka listesi değişince (ekleme/çıkarma) sıra kayıyor. Kabul edilebilir.

### Gösterim, reklam getirilirken değil gösterilirken kaydediliyor
`GET /api/ads` yan etkisiz; gösterim ayrı bir `POST` ile bildiriliyor. Böylece
getirilip de ekrana gelmeyen bir reklam faturaya yazılmıyor ve rotasyon sırası
gerçekten gösterilenlere göre ilerliyor. (GET'in kendisi gösterim kaydetseydi bir
yeniden deneme ya da ön yükleme sayacı şişirirdi.)

### Reklam bir yan özellik: hata akışı kesmiyor
Reklam getirilemezse, gösterim/tık bildirilemezse ya da hedef adres açılamazsa
kullanıcıya hata gösterilmiyor — bant sessizce görünmüyor. Mama bırakma akışının
reklam yüzünden kesilmesi kabul edilemez. Yayında reklam yoksa da bant hiç
çizilmiyor (boş kutu düzeni bozardı).

### Bantta zorunlu "Reklam" etiketi
Kullanıcının neyin içerik neyin reklam olduğunu ayırt edebilmesi gerekiyor. Bu
hem dürüstlük hem de mağaza kuralları açısından beklenen bir şey.

### Kullanıcı silinmiyor, askıya alınıyor
Admin panelinde "sil" yok, "askıya al" var. Gerekçe: kullanıcının bıraktığı bakım
kayıtları haritanın verisi, yorumları da başkalarının okuduğu içerik — hesabı
silmek başkalarının gördüğü veriyi de götürüyor. Askıya alınan hesap
`suspended_at` dolu olduğu için API'ye erişemiyor (`requireAuth` her istekte
kontrol ediyor), ama geçmiş katkısı yerinde kalıyor.

Bu aynı zamanda **JWT'nin iptal edilememesi** sorununu pratikte çözüyor: token
geçerli olsa bile askıya alınmış kullanıcı 403 alıyor.

### Yönetici kendi rolünü/durumunu değiştiremiyor
Tek yöneticinin kendini yanlışlıkla kullanıcıya düşürmesi paneli tamamen
erişilemez hale getirir (geri dönüş yalnızca sunucudaki script). Bu yüzden
kullanıcı kendi kaydında rol ve askı alanlarını değiştiremiyor.

### Denetim kaydı "best effort"
`writeAuditLog` hata verirse asıl işlem geri alınmıyor, yalnızca loglanıyor.
Gerekçe: silme/düzenleme zaten gerçekleşmiş oluyor; kaydı yazamamak yüzünden
kullanıcıya hata döndürmek durumu daha da karıştırır. Silinen kayıtların içeriği
denetim kaydına yazılıyor — satır artık yok ama "ne silindi" sorusu
cevaplanabilir kalıyor.

### Hayvan birleştirme tek transaction'da
Fotoğraf, yorum, sağlık kaydı ve bakım veren taşıma işlemlerinin yarısı olup
yarısı olmazsa geriye iki bozuk kayıt kalır. `user_animal_care` birleşik birincil
anahtar kullandığı için aynı kişi iki kayda da bakıyorsa `ON CONFLICT DO NOTHING`
gerekiyor.

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
İki kişisel hesap (`oguzpancuk@gmail.com`, `sumeyyeayan@gmail.com`) ve **tüm demo
hesapları** (`test1@stray.test` … `test100@stray.test`) için Kadıköy'de sabit
konum döndürülüyor — yurt dışından 20m mesafe kontrolü gerektiren akışları test
edebilmek için. Prod derlemede bu dal hiç çalışmıyor.

Kişisel iki hesabın konumu ~250m arayla seçildi ki mükerrer hayvan tespiti de
denenebilsin. Demo hesapları ise numaralarından **deterministik** olarak
üretiliyor (altın açıyla dağıtılmış, merkeze 90–360m): rastgele olsaydı hesap her
girişte başka yere ışınlanırdı; sabit tek bir nokta olsaydı 100 hesap üst üste
binerdi.

> Demo hesapları başta override kapsamında değildi ve demo veriyle test ederken
> harita boş görünüyordu — kullanıcı yurt dışındayken cihazın gerçek GPS'i
> kullanılıyordu. Seed verisi Kadıköy'e yazıldığı için override'ın seed merkeziyle
> aynı noktayı kullanması şart.

---

### Eşleştirme "2 saniye" beklemesi bilinçli bir yer tutucu
Hayvan ekleme akışında "yapay zekâ eşleştiriyor" ekranı en az 2 sn duruyor
(`mobile/src/screens/AddAnimalScreen.tsx` → `MIN_MATCHING_MS`). Sunucu şu an
yalnızca tür/desen/renk/mesafeye bakıp anında döndüğü için bekleme yapay; ama
kullanıcıya bir karşılaştırma yapıldığını hissettiriyor ve fotoğraf tabanlı
eşleştirme (YOL_HARITASI §1) geldiğinde gerçek işlem süresi bu yerin altını
dolduracak. O gün sabit silinir, ekran değişmez.

### Benzerlik kademe, yüzde değil
`GET /api/animals/match` yüksek/orta/düşük döner; sayısal skor istemciye hiç
gitmiyor. Elimizdeki sinyal kullanıcının girdiği birkaç alan; "%73 benzer"
olmayan bir kesinlik vaat eder. Puanlama `animal.controller.js` →
`similarityFor` içinde tek yerde (desen +2, renk +1, 200 m içinde +1;
≥3 yüksek, 2 orta, gerisi düşük). Tür filtre: kediyle köpek eşleşmez.

### Yakındaki hayvanlar 1 km, mama/su etki alanı 100 m
"Yakındakiler" listesi 5 km'den 1 km'ye indi: yürüyerek gidilip bakılabilecek
mesafe bu; sokak hayvanı kendi mahallesinden çıkmıyor, 5 km'de liste alakasız
kayıtla doluyordu. Kalp animasyonu ise haritadaki yeşil daireyle aynı 100 m'yi
kullanıyor (`MapScreen.tsx` → `ACTION_CIRCLE_RADIUS_METERS`) — "etki alanı"nın
uygulamada tek bir tanımı olsun diye. Genişletmek gerekirse tek sabit.

### Sayfalama: profil önizleme + "daha fazla göster", listeler kaydırdıkça
Profil ekranları ScrollView; orada sonsuz kaydırma yerine açık bir düğme
(`ui/LoadMoreButton`, "Daha fazla göster (12)") var — kullanıcı nerede
bittiğini ve kaç tane daha olduğunu görsün. Tam liste ekranları (Yakındakiler,
Yorumlar) FlatList `onEndReached` ile yüklüyor. Sunucu tarafı `limit/offset`;
`limit` verilmezse eski geniş varsayılan korunuyor ki harita tek istekte
çevreyi çeksin. Yorum sohbeti en yeniden geriye sayfalanır ve sayfa kronolojik
sırayla döner (`listComments`).

### Kök adres bir PWA kabuğu, web sürümü değil
`backend/public/` altındaki sayfa "URL ile ana ekrana ekle" isteğinin
karşılığı: manifest + service worker + ikonlar, tam ekran açılır, çevrimdışı
kabuk. Halka açık `/api/care-actions/status` ile "yakınımda mama/su var mı"
gösteriyor; giriş, harita, profil yok. Gerçek bir web sürümü (react-native-web)
ayrı ve büyük bir karar (YOL_HARITASI). Service worker `Cache-Control:
no-cache` ile servis ediliyor; aksi halde tarayıcı eski sw.js'e yapışıp
güncellemeyi hiç almıyor. Kabuk dosyaları değişince `sw.js` → `CACHE` sürümünü
artırın.

### `pati://` derin bağlantı şeması
`mobile/src/navigation/index.tsx` → `linking`. Paylaşım linkleri için altyapı
ve geliştirmede ekranlara doğrudan gitmek için:
`xcrun simctl openurl booted pati://add-animal` (ya da `pati://animal/12`,
`pati://profile`). Ekran görüntüsü alırken elle dolaşmayı bitiriyor. Şema
iOS Info.plist ve AndroidManifest'te kayıtlı — **değişirse native build**.

iOS simülatörü `openurl` için her seferinde "pati ile açılsın mı?" onayı
istiyor ve bu komut satırından onaylanamıyor. Geliştirme kaçamağı: `__DEV__`
modunda `linking.getInitialURL` AsyncStorage'daki `devInitialUrl` anahtarını
okuyup siliyor. Kullanım (Metro çalışırken):

```bash
D=booted; C=$(xcrun simctl get_app_container $D com.patiapp data)
M="$C/Library/Application Support/com.patiapp/RCTAsyncLocalStorage_V1/manifest.json"
node -e 'const f=process.argv[1];const m=JSON.parse(require("fs").readFileSync(f));m.devInitialUrl="pati://add-animal";require("fs").writeFileSync(f,JSON.stringify(m))' "$M"
xcrun simctl terminate $D com.patiapp; xcrun simctl launch $D com.patiapp
```

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

### Yazı tipi ağırlığı `fontWeight` ile değil dosyayla veriliyor
Nunito dört ayrı dosya olarak gömüldü (Regular/SemiBold/Bold/ExtraBold) ve
tipografi token'ları `fontFamily: 'Nunito-Bold'` yazıyor, `fontWeight`
yazmıyor. İkisi birlikte kullanıldığında Android sahte kalın (synthetic bold)
üretip harfleri kalınlaştırarak bozuyor. Dosya adları PostScript adlarıyla
birebir aynı tutuldu; Android font ailesini dosya adından, iOS PostScript
adından okuduğu için ancak böyle tek bir `fontFamily` değeri iki platformda
da çalışıyor.

### Font `@expo-google-fonts`'tan alındı ama paket bağımlılık değil
React Native `.ttf` istiyor. `@fontsource/nunito` yalnızca `.woff/.woff2`
veriyor ve alfabelere göre parçalanmış — Türkçe karakterler `latin-ext`
altında olduğu için tek bir parça alındığında ı/ğ/ş eksik kalıyordu.
`@expo-google-fonts/nunito` tam ve bölünmemiş `.ttf` dosyalarını içerdiği için
dosyalar oradan kopyalandı, paketin kendisi bağımlılık listesine eklenmedi
(Expo çalışma zamanına ihtiyacımız yok). Lisans `mobile/assets/OFL-Nunito.txt`
olarak birlikte taşınıyor — SIL OFL bunu şart koşuyor.

### Emoji yerine SVG ikon
Sekme, buton ve liste ikonları `components/brand/Icon.tsx` altında SVG olarak
çiziliyor. Emoji her cihazda/OS sürümünde farklı çiziliyor, marka rengini
alamıyor ve boyutu tipografiye bağlı. İstisna bilinçli: rozet kademeleri
(🥇🥈🥉💎) ve seviye amblemleri emoji kaldı — onlar zaten "madalya" olarak
okunuyor ve sunucudan geliyor.

### `fontSize` ezilirken `lineHeight` de verilmeli
Tipografi varyantları `fontSize` ve `lineHeight`'ı çift olarak taşıyor. Bir
çağıran yalnızca `fontSize`'ı ezerse ikisi kopuyor ve **iOS yazıyı satır
kutusuna sığdıramayıp kırpıyor** — giriş ekranındaki 46 punto "pati" yazısı
varyanttan gelen 22 punto satıra sıkışıp yarıdan kesilmişti.

İki katmanlı çözüldü: `ui/Text` çağıranın `fontSize` verip `lineHeight`
vermediğini görürse varyantın satır yüksekliğini düşürüyor (kırpma bir daha
sessizce oluşamıyor); `Wordmark`, `Avatar` ve `Button` ise ikisini birlikte
yazıyor, çünkü oralarda ölçünün öngörülebilir olması gerekiyor.

### `StyleSheet.create` yerine `makeStyles`
Karanlık mod eklenince stil sayfalarının temaya bağlanması gerekti.
`StyleSheet.create` modül yüklenirken bir kez çalıştığı için renkler ilk temaya
donup kalıyordu. `theme/makeStyles.ts` bunun yerine bir fabrika döndürüyor:
stil sayfası **tema başına bir kez** üretilip saklanıyor, bileşen
`const styles = useStyles()` ile alıyor. Tema iki tane olduğu için önbellek
sınırsız büyümüyor.

Aynı sebeple `navigationTheme` / `screenOptions` / `tabBarOptions` da sabit
nesne değil, temayı parametre alan fonksiyon.

### Tema seçimi üç durumlu ve cihazda saklanıyor
`system` (varsayılan) / `light` / `dark`. `system` telefonun ayarını takip
ediyor (`useColorScheme`). Seçim `AsyncStorage`'da (`pati.themeMode`) tutuluyor;
okunamazsa sessizce sistem temasına düşüyor — tema tercihi kritik veri değil.

### Uygulama ikonu koddan üretiliyor
`mobile/scripts/generate-icons.mjs`, `Logo.tsx` ile birebir aynı SVG
yollarından bütün ikon boyutlarını üretiyor (`npm run icons`). Elle PNG dışa
aktarmak yerine script olmasının sebebi: logo değişirse tek komutla hepsi
yenilenebiliyor ve uygulama içindeki logo ile ana ekran ikonu ayrışmıyor.
App Store 1024 px ikonunda alfa kanalı kabul etmediği için kare ikonlar opak,
yalnızca yuvarlak Android varyantı ile açılış logosu saydam üretiliyor.

### Sekme çubuğuna sabit yükseklik verilmedi
`tabBarStyle` içinde `height` yok. `@react-navigation/bottom-tabs` alt güvenli
alanı kendisi ekliyor; sabit yükseklik verildiğinde çentikli/ana-çubuklu
telefonlarda etiketler kırpılıyor.

### Hazır avatarlar `avatar_url` kolonunda, ayrı kolonda değil
Kullanıcının profil görseli iki şeyden **biri**: yüklediği fotoğraf ya da
seçtiği hazır avatar. İkisi aynı soruya cevap veriyor ve aynı anda ikisi birden
geçerli olamıyor — yani iki bağımsız alan değil, etiketli bir birleşim. Bu
yüzden hazır avatar da aynı kolona `pati-avatar:f3` biçiminde yazılıyor.

Kazanç: kullanıcının görselini döndüren onlarca sorgunun (yorumlar, arkadaş
listesi, sıralama, bakım verenler, arama sonuçları) hiçbiri değişmedi. Bedel:
`avatar_url` artık her zaman bir URL değil. Tek kural, değeri doğrudan
`<img src>` içine koymamak — mobilde `ui/Avatar` ayrımı kendisi yapıyor, admin
panelinde ise açık bir kontrol var.

Alternatif olan `avatar_key` kolonu daha "temiz" görünüyordu ama 8'den fazla
sorguya ve üç istemci tipine dokunmayı gerektiriyordu; iki alanın aynı anda
dolu olması ihtimalini de şemada engelleyemiyordu.

### 20 avatar, 20 görsel dosyası değil
Yüzler birkaç parametreden çiziliyor (ten, saç rengi, saç modeli, gözlük/sakal,
zemin). Uygulama boyutu artmıyor, yeni bir yüz eklemek tek satır ve hepsi aynı
çizim diline uyuyor. Aynı yaklaşım rozet madalyonlarında ve seviye
amblemlerinde de kullanılıyor.

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

9. **Rozet kutlaması aksiyon yanıtına bağlı.** Popup, puan kazandıran uç
   noktaların yanıtındaki `newBadges` alanından besleniyor; kaçırılanlar profil
   ekranı açıldığında `/users/me/badge-awards` ile toplanıyor. Kullanıcı hiç
   profiline girmezse kutlama gecikir. Gerçek zamanlı olması istenirse push
   bildirimi gerekir.

10. **Admin paneli korumasız bir adreste.** Panel `/api/admin` üzerinden rol
    kontrolü yapıyor ama panelin kendisi (statik dosyalar) herkese açık bir
    adreste sunulursa giriş ekranı internete açılmış olur. Üretimde IP kısıtı
    veya en azından iki aşamalı doğrulama düşünülmeli. Ayrıca panelde henüz
    rate limit yok — parola deneme saldırısına karşı korumasız.

11. **Konum override kodu repoda.** `__DEV__` ile korunuyor ama üretime
    çıkmadan önce tamamen kaldırılmalı (`mobile/src/location.ts`).

12. **CORS herkese açık** (`app.use(cors())`). Üretimde origin kısıtlanmalı.

13. **Turuncu üstünde beyaz yazı WCAG AA'yı geçmiyor.** Marka turuncusu
    `#F47A4A` üzerinde beyaz yazının kontrast oranı **2,7:1**; normal boy yazı
    için gereken 4,5:1. Birincil butonların tamamı bu kombinasyonu kullanıyor.
    Marka kimliği böyle verildiği için değiştirilmedi — ama yayına çıkmadan
    karar verilmeli: ya buton dolgusu koyulaştırılır (~`#C2551F`, 4,6:1) ya da
    turuncu butonda koyu yazıya geçilir (`#2B2B2B`, 5,3:1).

14. **Erişilebilirlik denetimi tamamlanmadı.** Dokunma alanları 44 pt, butonlarda
    `accessibilityRole` var; ekran okuyucu etiketleri uçtan uca test edilmedi.

15. **Admin paneli mobil paletle hizalı değil.** Mobil "pati" kimliğine taşındı,
    `admin/src/styles.css` hâlâ kendi renk değişkenlerinde (`--moss`, `--clay`).

---

## 4. Geliştirme ortamı tuzakları

Daha önce vakit kaybettiren, tekrar karşılaşılabilecek durumlar:

- **Font ve ikon değişiklikleri native build ister.** Yazı tipi ve uygulama
  ikonu native tarafta yükleniyor; sadece Metro'yu yeniden başlatmak yetmez,
  `npm run ios` / `npm run android` ile yeniden derlemek gerekir.
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
