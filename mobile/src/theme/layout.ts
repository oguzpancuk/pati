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

/**
 * Corner radii from the handoff: cards 18, inputs/buttons 16-18, pills 999.
 * `sm`/`md` remain for small inner elements (tags, thumbnails).
 */
export const radius = {
  sm: 8,
  md: 12,
  input: 16,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export type Shadows = Record<'card' | 'button' | 'float' | 'modal', ViewStyle>;

/**
 * Shadows. In the studio aesthetic almost nothing casts one: structure comes
 * from hairlines. Only two survive — under the primary (gradient) button, and
 * under elements floating over the map. `card` is deliberately empty so the
 * old call sites stay valid while rendering flat.
 *
 * iOS shadow* + Android elevation are set together; without both, the element
 * stays flat on Android.
 */
export function makeShadows(colors: Palette): Shadows {
  const dark = colors.background === '#161412';
  return {
    // Cards are flat now: a hairline border carries the separation.
    card: {},
    button: Platform.select({
      ios: {
        // The handoff's 0 14px 28px -14px rgba(224,94,43,.6): a warm shadow
        // tinted by the button itself, not a neutral gray.
        shadowColor: dark ? '#000000' : '#E05E2B',
        shadowOpacity: dark ? 0.5 : 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      default: { elevation: 4 },
    }) as ViewStyle,
    float: Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOpacity: dark ? 0.6 : 0.16,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      default: { elevation: 5 },
    }) as ViewStyle,
    modal: Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOpacity: dark ? 0.65 : 0.18,
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

/** The one hairline width used everywhere (StyleSheet.hairlineWidth is too thin on 3x). */
export const hairline = 1;
