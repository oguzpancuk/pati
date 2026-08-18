/**
 * pati marka paleti.
 *
 * Marka kimliğinden gelen beş renk sabit, gerisi bunlardan türetildi:
 *   #F47A4A turuncu  — marka, birincil eylem
 *   #FFF3E7 krem     — arka plan
 *   #2B2B2B koyu gri — metin
 *   #34A853 yeşil    — haritada "bakım var"
 *   #FF5C5C kırmızı  — haritada "bakım yok"
 *
 * Kural: ekran dosyalarında hex yazmayın, buradan bir isim kullanın. Marka
 * rengi değişirse tek dosya güncellenir.
 */
export const palette = {
  // Marka
  brand: '#F47A4A',
  brandDark: '#D9633A', // basılı hâl, koyu zeminde kontrast
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
  // *Soft: açık zemin, on*: o zemin üstünde okunacak koyu yazı (kontrast için
  // ana tondan koyulaştırıldı; ana ton açık zeminde yeterince okunmuyor).
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
  shadow: '#7A4A2A', // gölge rengi de sıcak, gri gölge kremde kirli duruyor
} as const;

/**
 * Haritanın kendi sözlüğü. Ekran kodunda "yeşil/kırmızı" yerine anlam yazalım
 * diye ayrı tutuldu.
 */
export const mapColors = {
  cared: palette.success,
  caredFill: 'rgba(52, 168, 83, 0.18)',
  needsCare: palette.danger,
  needsCareFill: 'rgba(255, 92, 92, 0.18)',
  userRadius: 'rgba(244, 122, 74, 0.16)',
  userRadiusStroke: palette.brand,
} as const;

/**
 * palette.success'in (#34A853) verilen saydamlıktaki hâli. Haritadaki bakım
 * daireleri tazeliğe göre saydamlaşıyor, o yüzden alfa çalışma anında hesaplanıyor.
 */
export function caredFill(alpha: number) {
  return `rgba(52, 168, 83, ${alpha})`;
}

export type ColorName = keyof typeof palette;
