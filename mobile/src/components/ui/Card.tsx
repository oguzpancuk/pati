import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { makeStyles, radius, spacing } from '../../theme';

export type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  /**
   * `flat` (default) is the studio card: white with a hairline border and no
   * shadow. `tinted` fills with the cream tone (comment input, inner blocks).
   * `raised` is kept as an alias of flat so older call sites still read well —
   * nothing in the app casts a card shadow any more.
   */
  variant?: 'raised' | 'flat' | 'tinted';
  padding?: keyof typeof spacing | 'none';
  style?: StyleProp<ViewStyle>;
};

/** A grouping container: white surface, hairline border, generous radius. */
export default function Card({
  children,
  onPress,
  variant = 'flat',
  padding = 'lg',
  style,
}: CardProps) {
  const styles = useStyles();
  const boxStyle: StyleProp<ViewStyle> = [
    styles.base,
    variant === 'tinted' ? styles.tinted : styles.flat,
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

const useStyles = makeStyles(({ colors: c }) => ({
  base: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
  },
  flat: {
    borderWidth: 1,
    borderColor: c.border,
  },
  tinted: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  pressed: { opacity: 0.9 },
}));
