import { TextStyle } from 'react-native';
import type { ColorName } from './colors';

/**
 * Typography — "studio aesthetic": a single family, **Quicksand** (SIL OFL,
 * assets/fonts), in four weights. It covers every Turkish character
 * (ı İ ğ Ğ ş Ş ç Ç ö Ö ü Ü — verified against the font's cmap before the
 * switch; the old Nunito files stay linked but are no longer referenced).
 *
 * File names match the PostScript names, so a single fontFamily value works
 * on both iOS and Android. Do NOT use fontWeight: weight comes from file
 * selection, and combining both makes Android produce faux bold.
 *
 * The scale carries the handoff's discipline: headings are **medium weight
 * with air**, not bold, and emphasis comes from letter spacing + color. Sizes
 * follow docs/design/studio-aesthetic-handoff.md. RN takes letterSpacing in
 * points, so the handoff's em values are multiplied by the font size
 * (.24em at 10.5px → 2.5).
 */
export const fonts = {
  regular: 'Quicksand-Regular',
  medium: 'Quicksand-Medium',
  semibold: 'Quicksand-SemiBold',
  bold: 'Quicksand-Bold',
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
  | 'stat'
  | 'tab'
  | 'button';

/**
 * NO color in the scale — color is theme-bound, so the `Text` component
 * adds it at runtime via `VARIANT_COLOR`.
 */
export const type: Record<Variant, TextStyle> = {
  // Single-sentence large headings: the celebration popup, the empty states
  display: { fontFamily: fonts.medium, fontSize: 28, lineHeight: 35 },
  // Screen title / a person's or animal's name
  title: { fontFamily: fonts.medium, fontSize: 25, lineHeight: 32 },
  // Bottom sheet title, card title
  heading: { fontFamily: fonts.medium, fontSize: 21, lineHeight: 27 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21 },
  // Body text
  body: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  // Secondary lines
  caption: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17 },
  captionStrong: { fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 17 },
  // The label inside an input box: lowercase, small, spaced
  label: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 2.5,
  },
  // Section micro label — the replacement for UPPERCASE headings
  micro: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 2.5,
  },
  // Large numerals in the stat strip
  stat: { fontFamily: fonts.regular, fontSize: 26, lineHeight: 32 },
  // Bottom tab labels
  tab: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.8,
  },
  button: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
};

/** Each variant's default color role. The `color` prop overrides it. */
export const VARIANT_COLOR: Record<Variant, ColorName> = {
  display: 'text',
  title: 'text',
  heading: 'text',
  subheading: 'text',
  body: 'textBody',
  bodyStrong: 'text',
  caption: 'textMuted',
  captionStrong: 'textBody',
  label: 'textMuted',
  micro: 'textMuted',
  stat: 'text',
  tab: 'textMuted',
  button: 'text',
};

export type TypeVariant = Variant;
