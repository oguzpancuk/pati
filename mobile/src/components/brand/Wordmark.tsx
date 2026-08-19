import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Logo from './Logo';
import Text from '../ui/Text';
import { brand, fonts, makeStyles, spacing, useTheme } from '../../theme';

export type WordmarkProps = {
  size?: 'sm' | 'md' | 'lg';
  /** Show the tagline too. Off by default — the handoff's login screen has none. */
  tagline?: boolean;
  /** Flat color for the mark. Omit it for the gradient logo + charcoal text. */
  color?: string;
  style?: StyleProp<ViewStyle>;
};

// The logo sits above the text with a slight overlap (handoff: −8px at the
// large size). `line` is written explicitly: with `fontSize` but no
// `lineHeight` the text squeezes into the variant's line height and iOS clips
// the descenders.
const SIZES = {
  sm: { logo: 40, name: 22, line: 28, overlap: -3 },
  md: { logo: 74, name: 32, line: 40, overlap: -5 },
  lg: { logo: 118, name: 44, line: 54, overlap: -8 },
} as const;

/**
 * Logo + the "pati" wordmark, stacked vertically (handoff 3a). The text is
 * medium-weight charcoal with wide letter spacing — the gradient belongs to
 * the logo alone, so the two never compete.
 */
export default function Wordmark({ size = 'md', tagline = false, color, style }: WordmarkProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const s = SIZES[size];

  return (
    <View style={[styles.wrap, style]}>
      <Logo size={s.logo} color={color} />
      <Text
        style={[
          styles.name,
          {
            fontSize: s.name,
            lineHeight: s.line,
            marginTop: s.overlap,
            letterSpacing: s.name * 0.14,
            color: color ?? colors.text,
          },
        ]}
      >
        {brand.name}
      </Text>
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
  name: { fontFamily: fonts.semibold },
  tagline: { marginTop: spacing.sm },
}));
