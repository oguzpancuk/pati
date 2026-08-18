# pati — tasarım sistemi

Marka kimliği "pati" / **birlikte bakıyoruz**. Bu doküman arayüzün nasıl
kurulduğunu ve yeni ekran eklerken nelere uyulacağını anlatır.

Kısa kural: **ekran dosyalarında sabit renk, sabit yazı tipi ve rastgele boşluk
değeri yazmayın.** Hepsi `mobile/src/theme/` altından geliyor.

---

## 1. Renkler — `mobile/src/theme/colors.ts`

Marka kimliğinden gelen beş renk sabit, gerisi bunlardan türetildi. **İki
palet var** (`lightPalette` / `darkPalette`), token adları birebir aynı.

| Token | Açık | Koyu | Nerede |
| --- | --- | --- | --- |
| `brand` | `#F47A4A` | `#FF8F5E` | Birincil buton, seçili sekme, bağlantı |
| `brandDark` | `#D9633A` | `#E0714A` | Basılı buton |
| `brandSoft` / `brandTint` | `#FDE7DB` / `#FFF0E7` | `#4A2E22` / `#37241C` | Marka renginin açık/koyu zemin hâli |
| `background` | `#FFF3E7` | `#1C1714` | Ekran arka planı |
| `surface` / `surfaceAlt` | `#FFFFFF` / `#FFF9F2` | `#262019` / `#2F2721` | Kart / kart içi ikincil blok |
| `text` / `textMuted` / `textSubtle` | `#2B2B2B` / `#7A6E66` / `#A2948A` | `#F5EDE4` / `#B8A99C` / `#8C7D71` | Ana yazı / açıklama / zaman damgası |
| `border` | `#F0DCC8` | `#3A3029` | Sıcak ayraç |
| `success` | `#34A853` | `#4CC46B` | Haritada "bakım var", iyileşti |
| `danger` | `#FF5C5C` | `#FF7B7B` | Haritada "bakım yok", hata |
| `warning` | `#F2A83B` | `#F5B855` | Tedavi sürüyor, mükerrer kayıt uyarısı |

Koyu temada nötr gri değil **sıcak kahve** tonları kullanıldı: marka kremi
sıcak olduğu için soğuk gri bir koyu tema aynı uygulama gibi durmuyor. Durum
renkleri bir tık açıldı, aynı yeşil/kırmızı koyu zeminde sönük kalıyor.

Her durum renginin üç varyantı var: ana ton (`danger`), açık/koyu zemin
(`dangerSoft`) ve o zeminde okunacak yazı (`onDanger`). Zemin üstünde ana tonu
yazı rengi olarak kullanmayın — kontrast yetmiyor.

Haritanın kendi sözlüğü `mapColors` altında (`cared`, `needsCare`,
`userRadius`). Bakım daireleri tazeliğe göre saydamlaştığı için alfa çalışma
anında `caredFill(alpha)` ile üretiliyor. Harita katmanları iki temada da aynı:
yarı saydamlar ve haritanın kendi zemini (Apple/Google) sistem temasını zaten
takip ediyor.

### Karanlık mod nasıl çalışıyor

```
App.tsx
└── ThemeProvider              useColorScheme() + AsyncStorage'daki seçim
    └── useTheme()  →  { name, colors, shadow, map }
```

- **Seçim üç durumlu:** `system` (varsayılan) / `light` / `dark`. Kullanıcı
  Profilim ekranının altındaki **Görünüm** bölümünden değiştiriyor, seçim
  cihazda saklanıyor (`AsyncStorage`, anahtar `pati.themeMode`).
- **Stil sayfaları `makeStyles` ile yazılıyor:**

  ```ts
  const useStyles = makeStyles(({ colors: c, shadow }) => ({
    card: { backgroundColor: c.surface, ...shadow.card },
  }));

  function Component() {
    const styles = useStyles();
  }
  ```

  `StyleSheet.create` doğrudan kullanılmıyor: modül yüklenirken çalıştığı için
  tema değiştiğinde renkler donup kalıyordu. `makeStyles` stil sayfasını tema
  başına bir kez üretip saklıyor, yani her render'da yeniden hesap yok.
- **JSX içindeki tek tük renkler** (`<Icon color={...}>` gibi) için
  `const { colors } = useTheme()`.

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
- `shadow`: `card` / `raised` / `modal` — `makeStyles` içinde ikinci alan olarak
  geliyor. iOS `shadow*` ve Android `elevation` birlikte veriliyor; yalnız biri
  yazılırsa diğer platformda kart düz kalıyor. Gölge rengi açık temada sıcak
  kahve (gri gölge kremde kirli duruyor), koyu temada siyah ve daha opak —
  koyu zeminde kahve gölge hiç görünmüyor.
- `minTouch`: 44 — dokunma hedefinin alt sınırı.

## 4. Çekirdek bileşenler — `mobile/src/components/ui/`

Ekranlar bunları `import { ... } from '../components/ui'` ile alır.

| Bileşen | Ne işe yarar |
| --- | --- |
| `Text` | Tüm yazılar buradan geçer; `variant` + `color` alır |
| `Button` | `primary` / `secondary` / `ghost` / `danger` / `success`, `sm/md/lg`, `loading`, `icon` |
| `Card` | `raised` (gölgeli) / `flat` (çerçeveli) / `tinted`; `onPress` verilirse basılabilir |
| `Screen` | Tema zemini + güvenli alan + isteğe bağlı kaydırma/yenileme |
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
  renk tek prop'la değişsin. Renk verilmezse temadan geliyor (koyu modda kalp
  koyu zemine oturuyor); turuncu zemin için `<Logo color="#fff"
  accent={colors.brand} />`.
- **`Wordmark`** — logo + "pati" yazısı, isteğe bağlı slogan. Giriş/kayıt
  ekranlarının tepesinde.
- **`Icon`** — ince çizgili, yuvarlak uçlu 20 ikonluk set (`pin`, `paw`,
  `user`, `users`, `plus`, `trophy`, `food`, `water`, `heart`, `chat`,
  `camera`, `health`, `bell`, `chevronRight`, `close`, `check`, `crosshair`,
  `star`, `logout`, `refresh`). **Emoji yerine bunu kullanın:** emoji her
  cihazda farklı çiziliyor ve marka rengini alamıyor. İstisna rozet
  kademeleri (🥇🥈🥉💎) ve seviye amblemleri — onlar bilerek emoji.

## 6. Navigasyon teması — `mobile/src/theme/navigation.ts`

`navigationTheme(theme)` react-navigation'a veriliyor; verilmezse ekran
geçişlerinde bir an beyaz zemin görünüyor ve arka planla çarpışıyor. Üçü de
(`navigationTheme`, `screenOptions`, `tabBarOptions`) temayı parametre alan
fonksiyon — sabit nesne olsalardı tema değiştiğinde başlık ve sekme renkleri
donup kalırdı. Sekme çubuğuna sabit yükseklik verilmedi: `bottom-tabs` alt
güvenli alanı kendi ekliyor, sabit yükseklik çentikli telefonlarda etiketleri
kırpıyor.

## 7. Uygulama ikonu ve açılış ekranı

İkonlar `Logo.tsx`'teki **aynı SVG yollarından** üretiliyor:

```bash
cd mobile && npm run icons     # Chromium gerektirir (Playwright)
```

`scripts/generate-icons.mjs` şunları yazıyor:

| Çıktı | Ne |
| --- | --- |
| `ios/.../AppIcon.appiconset/icon-*.png` | 40–1024 px, turuncu zeminli, **alfa kanalsız** (App Store saydamlık kabul etmiyor) |
| `ios/.../LaunchLogo.imageset/*` | Açılış ekranı logosu, saydam zeminli |
| `android/.../mipmap-*/ic_launcher.png` | Klasik ikon (Android 7 ve altı) |
| `android/.../mipmap-*/ic_launcher_round.png` | Yuvarlak varyant, köşeleri saydam |
| `android/.../mipmap-*/ic_launcher_foreground.png` | Uyarlanabilir ikonun ön planı |

Android 8+ **uyarlanabilir ikon** kullanıyor: zemin
`values/colors.xml → ic_launcher_background`, ön plan yukarıdaki PNG.
Launcher ön planı kendi maskesiyle kırptığı için logo 108dp tuvalin ortasındaki
66dp güvenli alana sığacak şekilde küçük çiziliyor.

Açılış ekranları:
- **iOS:** `LaunchScreen.storyboard` — krem zemin, logo, "pati" + slogan.
  Native tarafta çizildiği için renkler token'lardan okunamıyor, elle yazılı;
  palet değişirse storyboard da güncellenmeli.
- **Android:** ayrı bir açılış ekranı yok; `styles.xml` içindeki
  `android:windowBackground` krem yapıldı ki soğuk açılışta beyaz flaş olmasın.

---

## Yeni ekran eklerken

1. En dışta `<Screen>`; liste varsa `padded={false}` verip `FlatList`'in
   `contentContainerStyle`'ına boşluğu kendiniz koyun.
2. Yazılar `<Text variant="...">`, butonlar `<Button>`, gruplar `<Card>`.
3. Stil sayfası `makeStyles(({ colors: c }) => ({ ... }))`, boşluk
   `spacing.<isim>`. **`StyleSheet.create` kullanmayın** — karanlık modda
   renkler donar.
4. Boş liste ve yükleniyor hâllerini `EmptyState` / `LoadingState` ile verin —
   ekran hiçbir durumda boş kalmasın.
5. Yeni bir ikon gerekiyorsa `Icon.tsx`'e ekleyin, ekrana emoji koymayın.
6. Yeni ekranı **iki temada da** açıp bakın; `npm run format` ile biçimlendirin.

Bunlara uyulduğu sürece yeni ekran eklemek tema sistemini zorlamaz: marka
rengi ya da yazı tipi değişirse tek dosya güncellenir.

## Bilinen eksikler

- **Turuncu üstünde beyaz yazı WCAG AA'yı geçmiyor.** `#F47A4A` üzerinde beyaz
  kontrast oranı **2,7:1** (normal boy yazı için gereken 4,5:1). Marka kimliği
  bu kombinasyonu gösterdiği için değiştirilmedi. İki çözüm var: buton dolgusunu
  koyulaştırmak (yaklaşık `#C2551F` ile 4,6:1) ya da turuncu butonda koyu yazı
  kullanmak (`#2B2B2B` ile 5,3:1). Karar marka sahibinin.
- **Erişilebilirlik denetimi tamamlanmadı.** Dokunma alanları 44 pt'ye çekildi
  ve butonlara `accessibilityRole` verildi, ama ekran okuyucu etiketleri uçtan
  uca test edilmedi.
- **Admin paneli mobil paletle hizalı değil.** `admin/src/styles.css` hâlâ kendi
  renk değişkenlerinde (`--moss`, `--clay`).
