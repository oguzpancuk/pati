/**
 * The pati brand palette — light and dark versions.
 *
 * Five colors from the brand identity are fixed, the rest derived:
 *   #F47A4A orange    — brand, primary action
 *   #FFF3E7 cream     — background
 *   #2B2B2B dark gray — text
 *   #34A853 green     — "care present" on the map
 *   #FF5C5C red       — "no care" warnings (the map ground isn't painted)
 *
 * The dark theme uses **warm coffee** tones, not neutral gray; the brand
 * cream is warm, and a cold gray dark theme didn't read as the same app.
 * Status colors are lightened a notch on dark: the same green/red goes dull
 * on a dark ground.
 *
 * Rule: no hex in screen files. When you need a color, use a name via
 * `useTheme()` or `makeStyles((t) => ...)`.
 */
export const lightPalette = {
  // Marka
  brand: '#F47A4A',
  brandDark: '#D9633A', // pressed state
  brandSoft: '#FDE7DB', // light ground for text over orange
  brandTint: '#FFF0E7', // very light accent (selected rows etc.)

  // Grounds
  background: '#FFF3E7', // screen background (cream)
  surface: '#FFFFFF', // kart
  surfaceAlt: '#FFF9F2', // secondary block inside a card
  overlay: 'rgba(43, 43, 43, 0.45)', // modal perdesi

  // Metin
  text: '#2B2B2B',
  textMuted: '#7A6E66', // secondary lines, descriptions
  textSubtle: '#A2948A', // hints, timestamps
  textOnBrand: '#FFFFFF',

  // Lines
  border: '#F0DCC8', // a warm divider on cream
  borderStrong: '#E2C9AE',

  // Status — the map's two colors spread across the whole app.
  // *Soft: light ground; on*: text readable on that ground.
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

  // Neutral helpers
  disabled: '#E8DCD0',
  disabledText: '#B5A99E',
  skeleton: '#F3E6D9',
  shadow: '#7A4A2A', // the shadow is warm too; gray shadows look dirty on cream
} as const;

export type Palette = { -readonly [K in keyof typeof lightPalette]: string };

export const darkPalette: Palette = {
  // The brand orange is lightened a bit on dark; #F47A4A goes flat over
  // dark coffee.
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
 * The map's own vocabulary. Kept separate so screen code says meaning
 * instead of "green/red". Identical in both themes: the layers are
 * translucent and the map's own ground (Apple/Google) follows the system
 * theme.
 */
export const mapColors = {
  cared: lightPalette.success,
  caredFill: 'rgba(52, 168, 83, 0.18)',
  // The map has no red base anymore (see MapScreen); the "care missing"
  // color is used in banners and status text.
  needsCare: lightPalette.danger,
  userRadius: 'rgba(244, 122, 74, 0.16)',
  userRadiusStroke: lightPalette.brand,
} as const;

/**
 * The green at a given opacity. Care circles on the map fade with freshness,
 * so the alpha is computed at runtime.
 */
export function caredFill(alpha: number) {
  return `rgba(52, 168, 83, ${alpha})`;
}

/**
 * The metallic colors of the badge tiers. We use our own drawn medallion
 * instead of emoji medals (🥉🥈🥇💎): emoji render differently per device,
 * don't align with the brand typography and can't be tinted.
 *
 * Each tier is three tones: `ring` the outer ring, `fill` the inner disc,
 * `ink` the central symbol. The metal's own color doesn't change with the
 * theme (gold is gold in dark mode too), so one set suffices; `ink`/`fill`
 * contrast was chosen to read in both themes.
 */
export const tierColors = {
  bronze: { ring: '#B87333', fill: '#F0D6BC', ink: '#7A4A1E' },
  silver: { ring: '#9AA5B1', fill: '#E6EAEF', ink: '#59636D' },
  gold: { ring: '#D9A520', fill: '#FBEEC4', ink: '#8A6408' },
  diamond: { ring: '#4FB0C6', fill: '#D9F1F7', ink: '#1F6B7D' },
  /** A badge not yet earned: colorless, but not looking like an empty box either. */
  locked: { ring: '#C4C9CF', fill: '#EFF1F3', ink: '#8B9198' },
} as const;

export type TierColorName = keyof typeof tierColors;

export type ColorName = keyof Palette;
