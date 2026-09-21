import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import Gradient from '../brand/Gradient';
import { makeStyles, minTouch, radius, spacing, useTheme, type Palette } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid' | 'success';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  /** Element placed left of the label (icon, emoji, etc.). */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * `primary` is the only gradient-filled button in the app (handoff rule);
 * every other variant is an outline or plain text, except `dangerSolid`, the
 * one flat fill (owner, 2026-09-21). `danger`/`success` keep flat status
 * colors — they carry meaning, not brand.
 */
function variantColors(c: Palette, variant: Variant) {
  switch (variant) {
    case 'secondary':
      return { bg: c.surface, pressedBg: c.brandTint, fg: c.brand, border: c.borderStrong };
    case 'ghost':
      return { bg: 'transparent', pressedBg: c.brandTint, fg: c.brand, border: undefined };
    case 'danger':
      return { bg: c.surface, pressedBg: c.dangerSoft, fg: c.onDanger, border: c.danger };
    // The one filled button besides `primary` (owner, 2026-09-21): "Hesabımı
    // sil" is to read as the same button as "Şifreyi değiştir" above it, in
    // red. Flat, not a gradient — the gradient stays the brand's alone.
    // Two token choices that look odd and are deliberate (review, WCAG maths):
    // pressed is `dangerDark`, which darkens in BOTH themes — `onDanger` is
    // "text on dangerSoft", lighter than `danger` in dark mode, so pressing
    // made the button fade (white label at 1.94:1). And the label is
    // `surface`, not `textOnBrand`: white on the light theme's red, but the
    // dark page colour on the dark theme's salmon `danger` — 7.3:1 where
    // white would be 2.5:1.
    case 'dangerSolid':
      return { bg: c.danger, pressedBg: c.dangerDark, fg: c.surface, border: undefined };
    case 'success':
      return { bg: c.surface, pressedBg: c.successSoft, fg: c.onSuccess, border: c.success };
    default:
      return { bg: 'transparent', pressedBg: 'transparent', fg: c.textOnBrand, border: undefined };
  }
}

// lineHeight is set too: overriding only fontSize makes `Text` drop the
// variant's line height and the button's height falls to the font default.
// Fixing it here keeps buttons predictable.
const SIZES: Record<
  Size,
  { paddingV: number; paddingH: number; fontSize: number; lineHeight: number }
> = {
  sm: { paddingV: spacing.sm, paddingH: spacing.md, fontSize: 13, lineHeight: 18 },
  md: { paddingV: 14, paddingH: spacing.lg, fontSize: 15, lineHeight: 20 },
  lg: { paddingV: spacing.lg, paddingH: spacing.xl, fontSize: 16, lineHeight: 22 },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
}: ButtonProps) {
  const { colors, shadow } = useTheme();
  const styles = useStyles();
  const v = variantColors(colors, variant);
  const s = SIZES[size];
  const isOff = disabled || loading;
  // Small buttons stay pills (filter rows, "✓ recovered"); the full-size
  // primary action uses the handoff's 18pt radius.
  const r = size === 'sm' ? radius.pill : radius.lg;
  const gradient = variant === 'primary' && !isOff;

  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      accessibilityRole="button"
      accessibilityState={{ disabled: isOff, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        gradient ? shadow.button : null,
        {
          borderRadius: r,
          backgroundColor: isOff ? colors.disabled : pressed ? v.pressedBg : v.bg,
          paddingVertical: s.paddingV,
          paddingHorizontal: s.paddingH,
          borderWidth: v.border ? 1 : 0,
          borderColor: isOff ? colors.disabled : v.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: pressed && gradient ? 0.9 : 1,
        },
        style,
      ]}
    >
      {gradient ? <Gradient radius={r} /> : null}
      {loading ? (
        <ActivityIndicator size="small" color={isOff ? colors.disabledText : v.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text
            variant="button"
            style={{
              color: isOff ? colors.disabledText : v.fg,
              fontSize: s.fontSize,
              lineHeight: s.lineHeight,
            }}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  base: {
    minHeight: minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: spacing.sm },
}));
