import { TextStyle } from 'react-native';
import { palette } from './colors';

/**
 * Tipografi. Marka kimliği "yuvarlak, sıcak, güven veren" bir karakter istiyor;
 * Nunito (SIL OFL) bu tarife uyuyor ve Türkçe karakterlerin tamamını içeriyor
 * (ı İ ğ Ğ ş Ş ç Ç ö Ö ü Ü — assets/fonts altında, lisans assets/OFL-Nunito.txt).
 *
 * Dosya adları PostScript adlarıyla aynı olduğu için tek bir fontFamily değeri
 * hem iOS hem Android'de çalışıyor. fontWeight KULLANMAYIN: ağırlık dosya
 * seçimiyle geliyor, ikisi birlikte kullanılırsa Android sahte kalın üretiyor.
 */
export const fonts = {
  regular: 'Nunito-Regular',
  semibold: 'Nunito-SemiBold',
  bold: 'Nunito-Bold',
  extrabold: 'Nunito-ExtraBold',
} as const;

type Variant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'captionStrong'
  | 'label'
  | 'micro'
  | 'button';

export const type: Record<Variant, TextStyle> = {
  // Karşılama ekranı, kutlama popup'ı gibi tek cümlelik büyük başlıklar
  display: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 37, color: palette.text },
  // Ekran başlığı
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 31, color: palette.text },
  // Kart başlığı, bölüm başlığı
  heading: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 25, color: palette.text },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: palette.text },
  // Gövde metni
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: palette.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: palette.text },
  // Açıklama satırı
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.textMuted },
  captionStrong: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textMuted,
  },
  // Form etiketi
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    color: palette.textMuted,
  },
  // Rozet/etiket üstü küçük yazı
  micro: {
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    color: palette.textSubtle,
  },
  button: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, letterSpacing: 0.2 },
};

export type TypeVariant = Variant;
