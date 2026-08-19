import { Platform, ViewStyle } from 'react-native';
import type { Palette } from './colors';

/** Multiples of 4, so no stray 13s and 17s remain on screens. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** The brand is round-edged; corners are generous. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export type Shadows = Record<'card' | 'raised' | 'modal', ViewStyle>;

/**
 * Shadows. iOS shadow* + Android elevation set together; without both, the
 * card stays flat on Android.
 *
 * A function because it depends on color: the shadow is black in the dark
 * theme, warm coffee in the light one.
 */
export function makeShadows(colors: Palette): Shadows {
  const dark = colors.shadow === '#000000';
  return {
    card: Platform.select({
      ios: {
        shadowColor: colors.shadow,
        // Shadows are nearly invisible on a dark ground; strengthened a bit.
        shadowOpacity: dark ? 0.35 : 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      default: { elevation: 2 },
    }) as ViewStyle,
    raised: Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOpacity: dark ? 0.5 : 0.14,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      },
      default: { elevation: 6 },
    }) as ViewStyle,
    modal: Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOpacity: dark ? 0.65 : 0.22,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
      },
      default: { elevation: 12 },
    }) as ViewStyle,
  };
}

/** Touch target at least 44pt (the shared floor of Apple HIG / Material). */
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const minTouch = 44;
