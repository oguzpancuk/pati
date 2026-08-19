import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Logo from './Logo';
import Text from '../ui/Text';
import { brand, fonts, makeStyles, spacing, useTheme } from '../../theme';

export type WordmarkProps = {
  size?: 'sm' | 'md' | 'lg';
  /** Show the tagline too. */
  tagline?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

// `line` is set on purpose: with `fontSize` but no `lineHeight` the text
// would squeeze into the variant's line height and clip. Ratio 1.2 — so
// Nunito ExtraBold's protruding letters (p, t, the dot on i) fit easily.
const SIZES = {
  sm: { logo: 28, name: 22, line: 27 },
  md: { logo: 44, name: 32, line: 39 },
  lg: { logo: 72, name: 46, line: 56 },
} as const;

/** Logo + the "pati" text. Used at the top of the login/register screens. */
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
