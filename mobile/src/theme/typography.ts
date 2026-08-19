import { TextStyle } from 'react-native';
import type { ColorName } from './colors';

/**
 * Typography. The brand identity calls for a "round, warm, reassuring"
 * character; Nunito (SIL OFL) fits and covers every Turkish character
 * (ı İ ğ Ğ ş Ş ç Ç ö Ö ü Ü — under assets/fonts, license
 * assets/OFL-Nunito.txt).
 *
 * File names match the PostScript names, so a single fontFamily value works
 * on both iOS and Android. Do NOT use fontWeight: weight comes from file
 * selection, and combining both makes Android produce faux bold.
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
 * NO color in the scale — color is theme-bound, so the `Text` component
 * adds it at runtime via `VARIANT_COLOR`.
 */
export const type: Record<Variant, TextStyle> = {
  // Large one-line headings: the welcome screen, the celebration popup
  display: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 37 },
  // Screen title
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 31 },
  // Card title, section title
  heading: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 25 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  // Body text
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  // Description lines
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  captionStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  // Form etiketi
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  // Tiny text on badges/labels
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

/** Each variant's default color role. The `color` prop overrides it. */
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
