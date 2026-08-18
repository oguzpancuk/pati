import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Logo from './Logo';
import Text from '../ui/Text';
import { brand, fonts, makeStyles, spacing, useTheme } from '../../theme';

export type WordmarkProps = {
  size?: 'sm' | 'md' | 'lg';
  /** Sloganı da göster. */
  tagline?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

// `line` bilerek yazılıyor: `fontSize` verilip `lineHeight` verilmeseydi yazı
// varyantın satır yüksekliğine sıkışıp kırpılırdı. Oran 1,2 — Nunito
// ExtraBold'un çıkıntılı harfleri (p, t, i noktası) rahat sığsın diye.
const SIZES = {
  sm: { logo: 28, name: 22, line: 27 },
  md: { logo: 44, name: 32, line: 39 },
  lg: { logo: 72, name: 46, line: 56 },
} as const;

/** Logo + "pati" yazısı. Giriş/kayıt ekranlarının tepesinde kullanılıyor. */
export default function Wordmark({ size = 'md', tagline = false, color, style }: WordmarkProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const s = SIZES[size];
  const tint = color ?? colors.brand;
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <Logo size={s.logo} color={tint} />
        <Text style={[styles.name, { fontSize: s.name, lineHeight: s.line, color: tint }]}>
          {brand.name}
        </Text>
      </View>
      {tagline ? (
        <Text variant="caption" style={styles.tagline}>
          {brand.tagline}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: {
    fontFamily: fonts.extrabold,
    marginLeft: spacing.md,
    letterSpacing: -0.5,
  },
  tagline: { marginTop: spacing.xs },
}));
