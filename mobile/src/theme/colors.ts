/**
 * pati marka paleti — açık ve koyu iki sürüm.
 *
 * Marka kimliğinden gelen beş renk sabit, gerisi bunlardan türetildi:
 *   #F47A4A turuncu  — marka, birincil eylem
 *   #FFF3E7 krem     — arka plan
 *   #2B2B2B koyu gri — metin
 *   #34A853 yeşil    — haritada "bakım var"
 *   #FF5C5C kırmızı  — haritada "bakım yok"
 *
 * Koyu temada nötr gri değil **sıcak kahve** tonları kullanıldı; marka kremi
 * sıcak olduğu için soğuk gri bir koyu tema aynı uygulama gibi durmuyor.
 * Durum renkleri koyu zeminde bir tık açıldı: aynı yeşil/kırmızı koyu zeminde
 * sönük kalıyor.
 *
 * Kural: ekran dosyalarında hex yazmayın. Renk lazımsa `useTheme()` ya da
 * `makeStyles((t) => ...)` üzerinden isim kullanın.
 */
export const lightPalette = {
  // Marka
  brand: '#F47A4A',
  brandDark: '#D9633A', // basılı hâl
  brandSoft: '#FDE7DB', // turuncu üzerine yazı okunacak açık zemin
  brandTint: '#FFF0E7', // çok açık vurgu (seçili satır vb.)

  // Zeminler
  background: '#FFF3E7', // ekran arka planı (krem)
  surface: '#FFFFFF', // kart
  surfaceAlt: '#FFF9F2', // kart içi ikincil blok
  overlay: 'rgba(43, 43, 43, 0.45)', // modal perdesi

  // Metin
  text: '#2B2B2B',
  textMuted: '#7A6E66', // ikincil satır, açıklama
  textSubtle: '#A2948A', // ipucu, zaman damgası
  textOnBrand: '#FFFFFF',

  // Çizgiler
  border: '#F0DCC8', // krem zeminde sıcak ayraç
  borderStrong: '#E2C9AE',

  // Durum — haritadaki iki renk uygulamanın geneline de yayıldı.
  // *Soft: açık zemin, on*: o zemin üstünde okunacak yazı.
  success: '#34A853',
  successSoft: '#E3F3E7',
  successDark: '#2C8F46',
  onSuccess: '#22703A',
  danger: '#FF5C5C',
  dangerSoft: '#FFE8E8',
  dangerDark: '#E24C4C',
  onDanger: '#C93B3B',
  warning: '#F2A83B',
  warningSoft: '#FDF0DA',
  onWarning: '#9A6512',
  info: '#4A8FF4',
  infoSoft: '#E5EFFE',
  onInfo: '#2A5FB0',

  // Nötr yardımcılar
  disabled: '#E8DCD0',
  disabledText: '#B5A99E',
  skeleton: '#F3E6D9',
  shadow: '#7A4A2A', // gölge de sıcak; gri gölge kremde kirli duruyor
} as const;

export type Palette = { -readonly [K in keyof typeof lightPalette]: string };

export const darkPalette: Palette = {
  // Marka turuncusu koyu zeminde biraz açıldı; #F47A4A koyu kahve üstünde
  // matlaşıyor.
  brand: '#FF8F5E',
  brandDark: '#E0714A',
  brandSoft: '#4A2E22',
  brandTint: '#37241C',

  background: '#1C1714',
  surface: '#262019',
  surfaceAlt: '#2F2721',
  overlay: 'rgba(0, 0, 0, 0.62)',

  text: '#F5EDE4',
  textMuted: '#B8A99C',
  textSubtle: '#8C7D71',
  textOnBrand: '#FFFFFF',

  border: '#3A3029',
  borderStrong: '#4A3E35',

  success: '#4CC46B',
  successSoft: '#1E3A26',
  successDark: '#3FA85B',
  onSuccess: '#8FE0A5',
  danger: '#FF7B7B',
  dangerSoft: '#3E2222',
  dangerDark: '#E86A6A',
  onDanger: '#FFAFAF',
  warning: '#F5B855',
  warningSoft: '#3D2F17',
  onWarning: '#F7CE8A',
  info: '#6BA5FF',
  infoSoft: '#1E2C42',
  onInfo: '#A6C8FF',

  disabled: '#3A322B',
  disabledText: '#7A6E63',
  skeleton: '#332B24',
  shadow: '#000000',
};

export type ThemeName = 'light' | 'dark';

export const palettes: Record<ThemeName, Palette> = {
  light: lightPalette,
  dark: darkPalette,
};

/**
 * Haritanın kendi sözlüğü. Ekran kodunda "yeşil/kırmızı" yerine anlam yazalım
 * diye ayrı tutuldu. Katmanlar yarı saydam olduğu ve haritanın kendi zemini
 * (Apple/Google) sistem temasını takip ettiği için iki temada da aynı.
 */
export const mapColors = {
  cared: lightPalette.success,
  caredFill: 'rgba(52, 168, 83, 0.18)',
  needsCare: lightPalette.danger,
  needsCareFill: 'rgba(255, 92, 92, 0.18)',
  userRadius: 'rgba(244, 122, 74, 0.16)',
  userRadiusStroke: lightPalette.brand,
} as const;

/**
 * Yeşilin verilen saydamlıktaki hâli. Haritadaki bakım daireleri tazeliğe göre
 * saydamlaşıyor, o yüzden alfa çalışma anında hesaplanıyor.
 */
export function caredFill(alpha: number) {
  return `rgba(52, 168, 83, ${alpha})`;
}

export type ColorName = keyof Palette;
