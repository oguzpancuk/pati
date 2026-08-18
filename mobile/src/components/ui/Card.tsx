import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { palette, radius, shadow, spacing } from '../../theme';

export type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  /** flat: gölge yok, sadece ince çerçeve (liste içi yoğun kullanımda). */
  variant?: 'raised' | 'flat' | 'tinted';
  padding?: keyof typeof spacing | 'none';
  style?: StyleProp<ViewStyle>;
};

/** Krem zemin üzerinde beyaz kart. Uygulamadaki temel gruplama kabı. */
export default function Card({
  children,
  onPress,
  variant = 'raised',
  padding = 'lg',
  style,
}: CardProps) {
  const boxStyle: StyleProp<ViewStyle> = [
    styles.base,
    variant === 'raised' && shadow.card,
    variant === 'flat' && styles.flat,
    variant === 'tinted' && styles.tinted,
    padding !== 'none' && { padding: spacing[padding] },
    style,
  ];

  if (!onPress) {
    return <View style={boxStyle}>{children}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [boxStyle, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
  },
  flat: {
    borderWidth: 1,
    borderColor: palette.border,
  },
  tinted: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
});
