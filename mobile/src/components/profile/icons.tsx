import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from '../../theme';

/**
 * The settings gear. It lives here rather than in `brand/Icon` because that
 * file belongs to the shared icon set and is outside this track's file
 * claims during the parallel run; folding it in as `Icon name="settings"` is
 * a follow-up (see the track report). Same language as the set: thin stroke,
 * round caps, brand-tintable.
 *
 * The viewBox is inset by the stroke width so the 24-unit artwork does not
 * clip at the edges.
 */
export function GearIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="-1.4 -1.4 26.8 26.8">
      <G
        stroke={color ?? colors.text}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <Circle cx="12" cy="12" r="3" />
        <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </G>
    </Svg>
  );
}

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};
