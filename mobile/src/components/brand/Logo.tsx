import React, { useId } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';

export type LogoProps = {
  /** Width in points; the height follows the 120×130 aspect ratio. */
  size?: number;
  /** Flat paw color. Omit it to get the brand gradient (the default). */
  color?: string;
  /** The color of the heart cutout. Defaults to the screen background. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The pati logo (studio aesthetic): four toe pads and a map pin with a heart
 * cutout. The geometry is taken verbatim from the design handoff
 * (docs/design/studio-aesthetic-handoff.md — viewBox 0 0 120 130) and is
 * identical to the web generator in `shared/logoSvg.ts`; if one changes, so
 * does the other.
 *
 * The fill defaults to the vertical orange gradient — the logo is one of the
 * four places the gradient is allowed. Pass `color` where a flat mark is
 * needed (a tab icon, white on orange). The heart cutout ALWAYS takes the
 * background color, never a color of its own, so it reads as a hole in both
 * themes.
 */
export default function Logo({ size = 64, color, accent, style }: LogoProps) {
  const { colors } = useTheme();
  const height = Math.round((size * 130) / 120);
  const heartColor = accent ?? colors.background;
  // Several logos can share a screen (tab bar + header); a per-instance id
  // keeps their gradient definitions apart.
  const gradId = `pati-logo-${useId()}`;
  const fill = color ?? `url(#${gradId})`;

  return (
    <View style={style}>
      <Svg width={size} height={height} viewBox="0 0 120 130">
        {color ? null : (
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.gradStart} />
              <Stop offset="1" stopColor={colors.gradEnd} />
            </LinearGradient>
          </Defs>
        )}

        <G fill={fill}>
          {/* Toe pads — the outer ones tilted outward, the inner ones taller */}
          <Ellipse cx={18} cy={47} rx={12.5} ry={16.5} transform="rotate(-24 18 47)" />
          <Ellipse cx={44} cy={25} rx={12.5} ry={17.5} transform="rotate(-9 44 25)" />
          <Ellipse cx={76} cy={25} rx={12.5} ry={17.5} transform="rotate(9 76 25)" />
          <Ellipse cx={102} cy={47} rx={12.5} ry={16.5} transform="rotate(24 102 47)" />
          {/* Main pad = map pin */}
          <Path d="M60 48C76.6 48 90 61.4 90 78c0 18-22 38-30 44-8-6-30-26-30-44 0-16.6 13.4-30 30-30z" />
        </G>

        {/* The heart cutout inside the pin */}
        <Path
          d="M60 90c-13-9-17-15.5-17-21 0-5.2 3.8-9 8.6-9 3.4 0 6.6 2 8.4 5 1.8-3 5-5 8.4-5 4.8 0 8.6 3.8 8.6 9 0 5.5-4 12-17 21z"
          fill={heartColor}
        />
      </Svg>
    </View>
  );
}
