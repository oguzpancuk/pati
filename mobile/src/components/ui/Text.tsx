import React from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextProps as RNTextProps,
  StyleProp,
  TextStyle,
} from 'react-native';
import {
  useTheme,
  type as typeScale,
  VARIANT_COLOR,
  type ColorName,
  type TypeVariant,
} from '../../theme';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  /** A palette name. Overrides the variant's default color. */
  color?: ColorName;
  center?: boolean;
  style?: StyleProp<TextStyle>;
};

/**
 * All text in the app should pass through this component: fontFamily and the
 * theme-bound color are set in one place. The brand font can change in one
 * file, and no screen is left with a forgotten system font or hardcoded
 * color.
 */
export default function Text({ variant = 'body', color, center, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const base = typeScale[variant];

  // If the caller overrides `fontSize` without `lineHeight`, we drop the
  // variant's line height too. Otherwise the two decouple and iOS clips the
  // letters when the text doesn't fit its line box (46pt text on the
  // variant's 22pt line → words were cut in half).
  const override = StyleSheet.flatten(style) as TextStyle | undefined;
  const sizeOverridden = override?.fontSize !== undefined && override?.lineHeight === undefined;

  return (
    <RNText
      {...rest}
      style={[
        base,
        sizeOverridden ? { lineHeight: undefined } : null,
        { color: colors[color ?? VARIANT_COLOR[variant]] },
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}
