import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import Text from './Text';
import { palette, radius, spacing, minTouch } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  /** Butonun soluna konacak öge (ikon, emoji vb.). */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const VARIANTS: Record<Variant, { bg: string; pressedBg: string; fg: string; border?: string }> = {
  primary: { bg: palette.brand, pressedBg: palette.brandDark, fg: palette.textOnBrand },
  secondary: {
    bg: palette.surface,
    pressedBg: palette.brandTint,
    fg: palette.brand,
    border: palette.brand,
  },
  ghost: { bg: 'transparent', pressedBg: palette.brandTint, fg: palette.brand },
  danger: { bg: palette.danger, pressedBg: palette.dangerDark, fg: palette.textOnBrand },
  success: { bg: palette.success, pressedBg: palette.successDark, fg: palette.textOnBrand },
};

const SIZES: Record<Size, { paddingV: number; paddingH: number; fontSize: number }> = {
  sm: { paddingV: spacing.sm, paddingH: spacing.md, fontSize: 13 },
  md: { paddingV: spacing.md, paddingH: spacing.lg, fontSize: 15 },
  lg: { paddingV: spacing.lg, paddingH: spacing.xl, fontSize: 16 },
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
  const v = VARIANTS[variant];
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
          backgroundColor: isOff ? palette.disabled : pressed ? v.pressedBg : v.bg,
          paddingVertical: s.paddingV,
          paddingHorizontal: s.paddingH,
          borderWidth: v.border ? 1.5 : 0,
          borderColor: isOff ? palette.disabled : v.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isOff ? palette.disabledText : v.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text
            variant="button"
            style={{ color: isOff ? palette.disabledText : v.fg, fontSize: s.fontSize }}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    minHeight: minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: spacing.sm },
});
