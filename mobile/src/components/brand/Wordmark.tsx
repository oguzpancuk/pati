import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Logo from './Logo';
import Text from '../ui/Text';
import { brand, fonts, palette, spacing } from '../../theme';

export type WordmarkProps = {
  size?: 'sm' | 'md' | 'lg';
  /** Sloganı da göster. */
  tagline?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

const SIZES = {
  sm: { logo: 28, name: 22 },
  md: { logo: 44, name: 32 },
  lg: { logo: 72, name: 46 },
} as const;

/** Logo + "pati" yazısı. Giriş/kayıt ekranlarının tepesinde kullanılıyor. */
export default function Wordmark({
  size = 'md',
  tagline = false,
  color = palette.brand,
  style,
}: WordmarkProps) {
  const s = SIZES[size];
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <Logo size={s.logo} color={color} />
        <Text style={[styles.name, { fontSize: s.name, color }]}>{brand.name}</Text>
      </View>
      {tagline ? (
        <Text variant="caption" style={styles.tagline}>
          {brand.tagline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: {
    fontFamily: fonts.extrabold,
    marginLeft: spacing.md,
    // Nunito'nun satır kutusu geniş; logoya göre optik olarak yukarı kaçıyor.
    marginTop: 2,
    letterSpacing: -0.5,
  },
  tagline: { marginTop: spacing.xs },
});
