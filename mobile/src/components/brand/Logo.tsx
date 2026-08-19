import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Ellipse, G, Path } from 'react-native-svg';
import { useTheme } from '../../theme';

export type LogoProps = {
  size?: number;
  /** The paw color. Defaults to the theme's brand color. */
  color?: string;
  /** The color of the heart inside the main pad. Defaults to the screen background. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The pati logo: four toe pads, with the main pad as a map pin holding a
 * heart. Covers both uses in the brand identity:
 *   <Logo />                                      orange on the background
 *   <Logo color="#fff" accent={colors.brand} />   white on orange
 *
 * Drawn as SVG so it stays sharp at every size (24px tab icon, 160px launch
 * screen) and the color changes with one prop. Without a color it comes
 * from the theme, so in dark mode the heart sits on the dark background.
 */
export default function Logo({ size = 64, color, accent, style }: LogoProps) {
  const { colors } = useTheme();
  const pawColor = color ?? colors.brand;
  const heartColor = accent ?? colors.background;
  return (
    <View style={style}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* Toe pads — the outer ones tilted, the inner ones larger */}
        <G fill={pawColor}>
          <Ellipse cx={16} cy={42} rx={9} ry={12} transform="rotate(-22 16 42)" />
          <Ellipse cx={37} cy={26} rx={9.5} ry={13} transform="rotate(-8 37 26)" />
          <Ellipse cx={63} cy={26} rx={9.5} ry={13} transform="rotate(8 63 26)" />
          <Ellipse cx={84} cy={42} rx={9} ry={12} transform="rotate(22 84 42)" />
        </G>

        {/* Main pad = map pin */}
        <Path
          d="M50 97 C40 81 29 75 29 66 A21 21 0 1 1 71 66 C71 75 60 81 50 97 Z"
          fill={pawColor}
        />

        {/* The heart inside the pin */}
        <Path
          d="M50 73 C50 73 38.5 65.5 38.5 58.6 C38.5 54.4 41.6 51.6 45.2 51.6 C47.5 51.6 49.2 52.9 50 54.2 C50.8 52.9 52.5 51.6 54.8 51.6 C58.4 51.6 61.5 54.4 61.5 58.6 C61.5 65.5 50 73 50 73 Z"
          fill={heartColor}
        />
      </Svg>
    </View>
  );
}
