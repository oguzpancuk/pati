import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { makeStyles, radius, spacing } from '../../theme';

export type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  /** flat: no shadow, just a thin border (for dense in-list use). */
  variant?: 'raised' | 'flat' | 'tinted';
  padding?: keyof typeof spacing | 'none';
  style?: StyleProp<ViewStyle>;
};

/** A raised surface over the background. The app's basic grouping container. */
export default function Card({
  children,
  onPress,
  variant = 'raised',
  padding = 'lg',
  style,
}: CardProps) {
  const styles = useStyles();
  const boxStyle: StyleProp<ViewStyle> = [
    styles.base,
    variant === 'raised' && styles.raised,
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

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  base: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
  },
  raised: shadow.card,
  flat: {
    borderWidth: 1,
    borderColor: c.border,
  },
  tinted: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
}));
