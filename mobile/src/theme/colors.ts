/**
 * The pati palette — "studio aesthetic", light and dark
 * (docs/design/studio-aesthetic-handoff.md).
 *
 * The discipline: screens are pure white, structure comes from **hairlines**
 * rather than stacked cards, and the orange **gradient** is reserved for four
 * places only — the logo, the primary button, the progress bar and the
 * selected chip. Everywhere else orange appears as the flat accent
 * (`brand`, #E05E2B): links, active icons, micro labels.
 *
 * The dark theme is not in the handoff; it is derived here as a warm-charcoal
 * variant of the same discipline (white → #161412), and it matches the web
 * client's tokens one to one (web/src/theme.css).
 *
 * Rule: no hex in screen files. When you need a color, use a name via
 * `useTheme()` or `makeStyles((t) => ...)`.
 */
export const lightPalette = {
  // The gradient — forbidden outside its four uses. `gradStart`/`gradEnd`
  // feed the SVG gradient in components/brand/Gradient.
  gradStart: '#F4581C',
  gradEnd: '#F9A052',

  // Flat accent orange
  brand: '#E05E2B',
  brandDark: '#C94F20', // pressed state
  brandSoft: '#FFE9DA', // light ground under accent text
  brandTint: '#FFF3EA', // very light accent (selected rows etc.)

  // Grounds
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF6EC', // cream fills like the comment input
  cream: '#FFF3E7', // photo placeholder fill
  mapGround: '#F7F0E7',
  overlay: 'rgba(33, 32, 30, 0.45)',

  // Text
  text: '#21201E',
  textBody: '#4A4744',
  textMuted: '#8A8580',
  textSubtle: '#B5AFA8',
  textOnBrand: '#FFFFFF',

  // Hairlines
  border: '#F6E8DA', // card border
  borderStrong: '#F3E4D4', // input/outer border
  borderDashed: '#EFD9C4', // dashed photo frame

  // Status — dot-style tags, not filled pills (see ui/Tag).
  success: '#34A853',
  successSoft: '#E7F5EB',
  successDark: '#2A8A45',
  onSuccess: '#2A8A45',
  danger: '#E24C4C',
  dangerSoft: '#FDEAE8',
  dangerDark: '#C93B3B',
  onDanger: '#B23B2E',
  warning: '#F5B841',
  warningSoft: '#FDF3DC',
  onWarning: '#B27D0A',
  info: '#4A8FF4',
  infoSoft: '#E9F1FE',
  onInfo: '#2A5FB0',

  // Neutral helpers
  disabled: '#F0EBE4',
  disabledText: '#B5AFA8',
  skeleton: '#F6F1EA',
  shadow: 'rgba(20, 20, 20, 1)', // only under the primary button / floating map items
} as const;

export type Palette = { -readonly [K in keyof typeof lightPalette]: string };

export const darkPalette: Palette = {
  // The gradient keeps its identity in dark mode — it is the brand mark.
  gradStart: '#F4581C',
  gradEnd: '#F9A052',

  brand: '#F9824E',
  brandDark: '#E0693A',
  brandSoft: '#47301F',
  brandTint: '#33241A',

  background: '#161412',
  surface: '#161412',
  surfaceAlt: '#241F19',
  cream: '#2A231B',
  mapGround: '#1D1A16',
  overlay: 'rgba(0, 0, 0, 0.6)',

  text: '#F3EEE8',
  textBody: '#CFC8C0',
  textMuted: '#9B948C',
  textSubtle: '#6E675F',
  textOnBrand: '#FFFFFF',

  border: '#2B2620',
  borderStrong: '#363028',
  borderDashed: '#453B30',

  success: '#4CC46B',
  successSoft: '#1E3324',
  successDark: '#3FA85B',
  onSuccess: '#8FE0A5',
  danger: '#FF7B6B',
  dangerSoft: '#3C2320',
  dangerDark: '#E86A6A',
  onDanger: '#FFA294',
  warning: '#F5B841',
  warningSoft: '#35290F',
  onWarning: '#F0C572',
  info: '#6BA5FF',
  infoSoft: '#1E2C42',
  onInfo: '#A6C8FF',

  disabled: '#35302A',
  disabledText: '#756E66',
  skeleton: '#241F19',
  shadow: 'rgba(0, 0, 0, 1)',
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
  caredStroke: 'rgba(52, 168, 83, 0.45)',
  // The map has no red base anymore (see MapScreen); the "care missing"
  // color is used in banners and status text.
  needsCare: lightPalette.danger,
  // The user's 200 m range as a dashed charcoal circle (handoff); the
  // location mark itself is the brand logo glyph (UserLocationMarker).
  userRadius: 'transparent',
  userRadiusStroke: 'rgba(33, 32, 30, 0.35)',
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
