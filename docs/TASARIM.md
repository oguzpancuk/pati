# pati — tasarım sistemi

Marka kimliği "pati" / **birlikte bakıyoruz**. Bu doküman arayüzün nasıl
kurulduğunu ve yeni ekran eklerken nelere uyulacağını anlatır.

Kısa kural: **ekran dosyalarında sabit renk, sabit yazı tipi ve rastgele boşluk
değeri yazmayın.** Hepsi `mobile/src/theme/` altından geliyor.

---

## 1. Renkler — `mobile/src/theme/colors.ts`

Marka kimliğinden gelen beş renk sabit, gerisi bunlardan türetildi.

| Token | Değer | Nerede |
| --- | --- | --- |
| `brand` | `#F47A4A` | Birincil buton, seçili sekme, bağlantı |
| `brandDark` | `#D9633A` | Basılı buton |
| `brandSoft` / `brandTint` | `#FDE7DB` / `#FFF0E7` | Turuncu üstüne yazı okunacak açık zeminler |
| `background` | `#FFF3E7` | Ekran arka planı (krem) |
| `surface` / `surfaceAlt` | `#FFFFFF` / `#FFF9F2` | Kart / kart içi ikincil blok |
| `text` / `textMuted` / `textSubtle` | `#2B2B2B` / `#7A6E66` / `#A2948A` | Ana yazı / açıklama / zaman damgası |
| `border` | `#F0DCC8` | Krem zeminde sıcak ayraç |
| `success` | `#34A853` | Haritada "bakım var", iyileşti |
| `danger` | `#FF5C5C` | Haritada "bakım yok", hata |
| `warning` | `#F2A83B` | Tedavi sürüyor, mükerrer kayıt uyarısı |

Her durum renginin üç varyantı var: ana ton (`danger`), açık zemin
(`dangerSoft`) ve o zeminde okunacak koyu yazı (`onDanger`). Açık zeminde ana
tonu yazı rengi olarak kullanmayın — kontrast yetmiyor.

Haritanın kendi sözlüğü `mapColors` altında (`cared`, `needsCare`,
`userRadius`). Bakım daireleri tazeliğe göre saydamlaştığı için alfa çalışma
anında `caredFill(alpha)` ile üretiliyor.

## 2. Tipografi — `mobile/src/theme/typography.ts`

**Nunito** (SIL OFL). Marka kimliğindeki "yuvarlak, sıcak, güven veren"
tanımına uyuyor ve Türkçe karakterlerin tamamını içeriyor (ı İ ğ Ğ ş Ş ç Ç ö Ö
ü Ü — 938 glif). Dosyalar `mobile/assets/fonts/`, lisans
`mobile/assets/OFL-Nunito.txt`.

Dört ağırlık gömülü: Regular 400, SemiBold 600, Bold 700, ExtraBold 800
(toplam ~520 KB).

**`fontWeight` kullanmayın.** Ağırlık dosya seçimiyle geliyor
(`fontFamily: 'Nunito-Bold'`); ikisi birlikte kullanılırsa Android sahte kalın
üretiyor ve yazı bozuluyor. Bunun yerine `<Text variant="...">` kullanın:

| Varyant | Boyut/satır | Nerede |
| --- | --- | --- |
| `display` | 30/37 ExtraBold | Kutlama popup'ı, tek cümlelik büyük başlık |
| `title` | 24/31 Bold | Ekran başlığı |
| `heading` | 19/25 Bold | Kart / bölüm başlığı |
| `subheading` | 16/22 SemiBold | Liste satırı başlığı |
| `body` / `bodyStrong` | 15/22 | Gövde metni |
| `caption` / `captionStrong` | 13/18 | Açıklama satırı |
| `label` | 12/16 SemiBold | Form etiketi |
| `micro` | 11/14 Bold, harf aralıklı | Rozet altı, "REKLAM" etiketi |

### Font dosyaları neden repoda?

React Native `.ttf` istiyor; `@fontsource` paketleri yalnızca `.woff2`
veriyor ve alfabelere göre parçalanmış (Türkçe karakterler `latin-ext`
altında, tek parça eksik kalıyordu). `@expo-google-fonts/nunito` tam `.ttf`
dosyalarını içerdiği için oradan alındı; paketin kendisi bağımlılık değil.

Fontlar `react-native.config.js` + `npx react-native-asset` ile bağlandı:
Android `assets/fonts/`, iOS `Info.plist`'teki `UIAppFonts` + Xcode projesi.
Dosya adları PostScript adlarıyla birebir aynı (`Nunito-Bold.ttf` →
`Nunito-Bold`) çünkü Android font ailesini dosya adından, iOS PostScript
adından okuyor; eşleşince tek bir `fontFamily` değeri iki platformda da
çalışıyor.

**Font eklendikten sonra native build gerekiyor** (`npm run ios` /
`npm run android`). Sadece Metro'yu yeniden başlatmak yetmez.

`react-native-asset` Android tarafına dosyaları **kopyalıyor**
(`android/app/src/main/assets/fonts/`), yani `.ttf`'ler depoda iki kez duruyor
(~520 KB fazladan). Gradle'ı kaynak klasöre yönlendirip bu kopyayı kaldırmak
mümkün ama o zaman kurulum aracın belgelenmiş akışından ayrılıyor; şimdilik
kopya bilerek bırakıldı. Font dosyaları değişirse `npx react-native-asset`
tekrar çalıştırılmalı, yoksa iki kopya ayrışır.

## 3. Boşluk, köşe, gölge — `mobile/src/theme/layout.ts`

- `spacing`: 4 / 8 / 12 / 16 / 24 / 32 / 48 (`xs`…`xxxl`). Ara değer yazmayın.
- `radius`: 8 / 12 / 16 / 22 / 999 (`pill`). Marka yuvarlak hatlı, köşeler cömert.
- `shadow`: `card` / `raised` / `modal`. iOS `shadow*` ve Android `elevation`
  birlikte veriliyor; yalnız biri yazılırsa diğer platformda kart düz kalıyor.
  Gölge rengi sıcak (`palette.shadow`), gri gölge krem zeminde kirli duruyor.
- `minTouch`: 44 — dokunma hedefinin alt sınırı.

## 4. Çekirdek bileşenler — `mobile/src/components/ui/`

Ekranlar bunları `import { ... } from '../components/ui'` ile alır.

| Bileşen | Ne işe yarar |
| --- | --- |
| `Text` | Tüm yazılar buradan geçer; `variant` + `color` alır |
| `Button` | `primary` / `secondary` / `ghost` / `danger` / `success`, `sm/md/lg`, `loading`, `icon` |
| `Card` | `raised` (gölgeli) / `flat` (çerçeveli) / `tinted`; `onPress` verilirse basılabilir |
| `Screen` | Krem zemin + güvenli alan + isteğe bağlı kaydırma/yenileme |
| `Input` | Etiketli metin alanı; odakta kenarlık markaya döner, `error`/`hint` alır |
| `Chip` | Filtre düğmesi ve salt okunur etiket; `tone` ile durum renkleri |
| `Banner` | Ekran içi durum kutusu (sol kenarda renkli şerit) |
| `Avatar` | Yuvarlak profil görseli; fotoğraf yoksa baş harf |
| `SectionHeader` | Bölüm başlığı + sağda "Tümünü gör" bağlantısı |
| `EmptyState` / `LoadingState` | Boş liste ve yükleniyor hâllerinin ortak görünümü |
| `Divider` | Kart içi ayraç |

## 5. Marka bileşenleri — `mobile/src/components/brand/`

- **`Logo`** — dört parmak yastığı + içinde kalp olan harita pini. SVG olarak
  çizildi ki 24 px sekme ikonundan 160 px açılış ekranına kadar net kalsın ve
  renk tek prop'la değişsin. İki kullanım: krem zeminde turuncu (varsayılan),
  turuncu zeminde beyaz (`<Logo color="#fff" accent={palette.brand} />`).
- **`Wordmark`** — logo + "pati" yazısı, isteğe bağlı slogan. Giriş/kayıt
  ekranlarının tepesinde.
- **`Icon`** — ince çizgili, yuvarlak uçlu 20 ikonluk set (`pin`, `paw`,
  `user`, `users`, `plus`, `trophy`, `food`, `water`, `heart`, `chat`,
  `camera`, `health`, `bell`, `chevronRight`, `close`, `check`, `crosshair`,
  `star`, `logout`, `refresh`). **Emoji yerine bunu kullanın:** emoji her
  cihazda farklı çiziliyor ve marka rengini alamıyor. İstisna rozet
  kademeleri (🥇🥈🥉💎) ve seviye amblemleri — onlar bilerek emoji.

## 6. Navigasyon teması — `mobile/src/theme/navigation.ts`

`navigationTheme` react-navigation'a veriliyor; verilmezse ekran geçişlerinde
bir an beyaz zemin görünüyor ve krem arka planla çarpışıyor. Stack başlıkları
krem zeminli ve gölgesiz, sekme çubuğu beyaz, seçili sekme marka turuncusu.
Sekme çubuğuna sabit yükseklik verilmedi: `bottom-tabs` alt güvenli alanı
kendi ekliyor, sabit yükseklik çentikli telefonlarda etiketleri kırpıyor.

---

## Yeni ekran eklerken

1. En dışta `<Screen>`; liste varsa `padded={false}` verip `FlatList`'in
   `contentContainerStyle`'ına boşluğu kendiniz koyun.
2. Yazılar `<Text variant="...">`, butonlar `<Button>`, gruplar `<Card>`.
3. Renk lazımsa `palette.<isim>`, boşluk lazımsa `spacing.<isim>`.
4. Boş liste ve yükleniyor hâllerini `EmptyState` / `LoadingState` ile verin —
   ekran hiçbir durumda boş kalmasın.
5. Yeni bir ikon gerekiyorsa `Icon.tsx`'e ekleyin, ekrana emoji koymayın.

Bunlara uyulduğu sürece yeni ekran eklemek tema sistemini zorlamaz: marka
rengi ya da yazı tipi değişirse tek dosya güncellenir.

## Bilinen eksikler

- **Karanlık mod yok.** Renkler tek bir açık palet olarak tanımlı. Eklenmesi
  gerekirse `palette` bir tema nesnesine ve `useTheme()` kancasına dönüşmeli;
  bileşenler zaten token okuduğu için ekranlar değişmez.
- **Uygulama ikonu ve açılış görseli hâlâ şablon.** `Logo` bileşeni var ama
  `ios/.../Images.xcassets` ve `android/.../mipmap-*` içindeki PNG'ler
  üretilmedi; bunun için tasarım dosyasından dışa aktarım gerekiyor.
- **Paket adı ve depo adı "Stray" kaldı.** Ana ekranda görünen ad `pati` yapıldı
  (`app.json`, `strings.xml`, `Info.plist`), ancak `com.straymobile` paket
  adı mağazaya yüklendikten sonra değiştirilemediği için o karar yayına çıkma
  sprint'ine bırakıldı.
