/**
 * Tema girişi. Tek import yeter:
 *   import { useTheme, makeStyles, spacing, radius, type } from '../theme';
 *
 * Renk okumanın iki yolu var:
 *   - Stil sayfası için: `makeStyles(({ colors: c, shadow }) => ({ ... }))`
 *   - JSX içinde tek tük renk için: `const { colors } = useTheme()`
 */
export { mapColors, caredFill, tierColors, lightPalette, darkPalette, palettes } from './colors';
export type { ColorName, Palette, ThemeName, TierColorName } from './colors';
export { fonts, type, VARIANT_COLOR } from './typography';
export type { TypeVariant } from './typography';
export { spacing, radius, makeShadows, hitSlop, minTouch } from './layout';
export type { Shadows } from './layout';
export { ThemeProvider, useTheme, useThemeMode } from './ThemeContext';
export type { Theme, ThemeMode } from './ThemeContext';
export { makeStyles } from './makeStyles';
export { navigationTheme, screenOptions, tabBarOptions } from './navigation';
export { brand } from './brand';
