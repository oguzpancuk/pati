import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import { makeStyles, minTouch, radius, spacing, useTheme, type Palette } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
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

function variantColors(c: Palette, variant: Variant) {
  switch (variant) {
    case 'secondary':
      return {
        bg: c.surface,
        pressedBg: c.brandTint,
        fg: c.brand,
        border: c.brand,
      };
    case 'ghost':
      return {
        bg: 'transparent',
        pressedBg: c.brandTint,
        fg: c.brand,
        border: undefined,
      };
    case 'danger':
      return {
        bg: c.danger,
        pressedBg: c.dangerDark,
        fg: c.textOnBrand,
        border: undefined,
      };
    case 'success':
      return {
        bg: c.success,
        pressedBg: c.successDark,
        fg: c.textOnBrand,
        border: undefined,
      };
    default:
      return {
        bg: c.brand,
        pressedBg: c.brandDark,
        fg: c.textOnBrand,
        border: undefined,
      };
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
  md: { paddingV: spacing.md, paddingH: spacing.lg, fontSize: 15, lineHeight: 20 },
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
  const { colors } = useTheme();
  const styles = useStyles();
  const v = variantColors(colors, variant);
  const s = SIZES[size];
  const isOff = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      accessibilityRole="button"
      accessibilityState={{ disabled: isOff, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isOff ? colors.disabled : pressed ? v.pressedBg : v.bg,
          paddingVertical: s.paddingV,
          paddingHorizontal: s.paddingH,
          borderWidth: v.border ? 1.5 : 0,
          borderColor: isOff ? colors.disabled : v.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
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
    borderRadius: radius.pill,
    minHeight: minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: spacing.sm },
}));
