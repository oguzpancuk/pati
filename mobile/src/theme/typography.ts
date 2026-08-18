import { TextStyle } from 'react-native';
import type { ColorName } from './colors';

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

/**
 * Ölçekte renk YOK — renk temaya bağlı olduğu için `Text` bileşeni
 * `VARIANT_COLOR` üzerinden çalışma anında ekliyor.
 */
export const type: Record<Variant, TextStyle> = {
  // Karşılama ekranı, kutlama popup'ı gibi tek cümlelik büyük başlıklar
  display: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 37 },
  // Ekran başlığı
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 31 },
  // Kart başlığı, bölüm başlığı
  heading: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 25 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  // Gövde metni
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  // Açıklama satırı
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  captionStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  // Form etiketi
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  // Rozet/etiket üstü küçük yazı
  micro: {
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
  },
  button: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
};

/** Her varyantın varsayılan renk rolü. `color` prop'u bunu ezer. */
export const VARIANT_COLOR: Record<Variant, ColorName> = {
  display: 'text',
  title: 'text',
  heading: 'text',
  subheading: 'text',
  body: 'text',
  bodyStrong: 'text',
  caption: 'textMuted',
  captionStrong: 'textMuted',
  label: 'textMuted',
  micro: 'textSubtle',
  button: 'text',
};

export type TypeVariant = Variant;
