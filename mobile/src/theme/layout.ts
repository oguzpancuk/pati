import { Platform, ViewStyle } from 'react-native';
import type { Palette } from './colors';

/** 4'ün katları. Ekranlarda 13, 17 gibi tek tük değerler kalmasın diye. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Marka yuvarlak hatlı; köşeler cömert. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export type Shadows = Record<'card' | 'raised' | 'modal', ViewStyle>;

/**
 * Gölgeler. iOS shadow* + Android elevation birlikte veriliyor; ikisi ayrı
 * ayrı ayarlanmazsa Android'de kart düz kalıyor.
 *
 * Renge bağlı olduğu için fonksiyon: koyu temada gölge siyah, açık temada
 * sıcak kahve.
 */
export function makeShadows(colors: Palette): Shadows {
  const dark = colors.shadow === '#000000';
  return {
    card: Platform.select({
      ios: {
        shadowColor: colors.shadow,
        // Koyu zeminde gölge neredeyse görünmüyor; biraz güçlendirildi.
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

/** Dokunma hedefi en az 44pt (Apple HIG / Material'ın ortak alt sınırı). */
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const minTouch = 44;
