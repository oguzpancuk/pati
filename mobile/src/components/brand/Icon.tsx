import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from '../../theme';

/**
 * A thin-stroke (outline), round-capped set like the brand identity's icons.
 * Used instead of emoji: emoji render differently on every device and can't
 * take the brand color.
 */
export type IconName =
  | 'pin'
  | 'paw'
  | 'user'
  | 'users'
  | 'plus'
  | 'trophy'
  | 'food'
  | 'water'
  | 'heart'
  | 'chat'
  | 'camera'
  | 'health'
  | 'bell'
  | 'chevronRight'
  | 'close'
  | 'check'
  | 'crosshair'
  | 'star'
  | 'logout'
  | 'refresh'
  | 'settings'
  | 'flag';

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export default function Icon({ name, size = 24, color, strokeWidth = 1.8 }: IconProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.text;
  const stroke = {
    stroke: tint,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox={VIEW_BOXES[name] ?? '0 0 24 24'}>
      <G {...stroke}>{PATHS[name](tint, strokeWidth)}</G>
    </Svg>
  );
}

/**
 * Every mark is drawn inside a 24-unit box with room for its own stroke — bar
 * `settings`, whose outer teeth sit on the edges. Its box is inset by the
 * stroke width so the ring is not shaved off at the top and bottom.
 */
const VIEW_BOXES: Partial<Record<IconName, string>> = {
  settings: '-1.4 -1.4 26.8 26.8',
};

const PATHS: Record<IconName, (color: string, sw: number) => React.ReactNode> = {
  pin: () => (
    <>
      <Path d="M12 21c0 0 7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <Circle cx={12} cy={10} r={2.6} />
    </>
  ),
  paw: (color) => (
    <G fill={color} stroke="none">
      <Circle cx={6.4} cy={10.6} r={2.1} />
      <Circle cx={9.9} cy={7.2} r={2.2} />
      <Circle cx={14.1} cy={7.2} r={2.2} />
      <Circle cx={17.6} cy={10.6} r={2.1} />
      <Path d="M12 12.2c2.6 0 5 2.1 5 4.5 0 1.8-1.4 2.9-3 2.9-.9 0-1.4-.4-2-.4s-1.1.4-2 .4c-1.6 0-3-1.1-3-2.9 0-2.4 2.4-4.5 5-4.5Z" />
    </G>
  ),
  user: () => (
    <>
      <Circle cx={12} cy={8.2} r={3.6} />
      <Path d="M4.6 20a7.4 7.4 0 0 1 14.8 0" />
    </>
  ),
  users: () => (
    <>
      <Circle cx={9.2} cy={8.4} r={3.2} />
      <Path d="M2.8 20a6.4 6.4 0 0 1 12.8 0" />
      <Path d="M16.4 5.8a3.2 3.2 0 0 1 0 5.2" />
      <Path d="M17.4 14.4A6.4 6.4 0 0 1 21.2 20" />
    </>
  ),
  plus: () => <Path d="M12 5.5v13M5.5 12h13" />,
  trophy: () => (
    <>
      <Path d="M7.5 4h9v4.2a4.5 4.5 0 0 1-9 0V4Z" />
      <Path d="M7.5 5.8H5a2.5 2.5 0 0 0 2.6 4" />
      <Path d="M16.5 5.8H19a2.5 2.5 0 0 1-2.6 4" />
      <Path d="M12 12.7V16" />
      <Path d="M8.5 20h7" />
      <Path d="M9.8 20c0-2 .9-4 2.2-4s2.2 2 2.2 4" />
    </>
  ),
  food: () => (
    <>
      <Path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z" />
      <Path d="M7.5 8.5c0-1.4 1-1.9 1-2.9M12 8.5c0-1.4 1-1.9 1-2.9M16.5 8.5c0-1.4 1-1.9 1-2.9" />
    </>
  ),
  water: () => <Path d="M12 3.4s6.2 6.5 6.2 10.2a6.2 6.2 0 0 1-12.4 0C5.8 9.9 12 3.4 12 3.4Z" />,
  heart: () => (
    <Path d="M12 20.2S4.4 15.3 4.4 10.5A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.6 2.8c0 4.8-7.6 9.7-7.6 9.7Z" />
  ),
  chat: () => <Path d="M20.2 11.8a7.6 7.6 0 0 1-11.2 6.7L4 20l1.6-4.5a7.6 7.6 0 1 1 14.6-3.7Z" />,
  camera: () => (
    <>
      <Path d="M4 8.4h3l1.5-2.2h7L17 8.4h3a1 1 0 0 1 1 1v8.6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.4a1 1 0 0 1 1-1Z" />
      <Circle cx={12} cy={13.4} r={3.4} />
    </>
  ),
  health: () => (
    <>
      <Path d="M12 4 5.2 6.8v4.6c0 4.1 2.9 6.8 6.8 7.6 3.9-.8 6.8-3.5 6.8-7.6V6.8L12 4Z" />
      <Path d="M12 9v5M9.5 11.5h5" />
    </>
  ),
  bell: () => (
    <>
      <Path d="M6.6 10.4a5.4 5.4 0 0 1 10.8 0c0 4 1.6 5.4 1.6 5.4H5s1.6-1.4 1.6-5.4Z" />
      <Path d="M10 18.6a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  chevronRight: () => <Path d="m9.8 6 6 6-6 6" />,
  close: () => <Path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4" />,
  check: () => <Path d="m5 12.6 4.6 4.6L19 7.4" />,
  crosshair: () => (
    <>
      <Circle cx={12} cy={12} r={7.4} />
      <Circle cx={12} cy={12} r={2.2} />
      <Path d="M12 2.4v2.6M12 19v2.6M2.4 12H5M19 12h2.6" />
    </>
  ),
  star: () => (
    <Path d="m12 4 2.4 5 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.8 9.6 9 12 4Z" />
  ),
  logout: () => (
    <>
      <Path d="M15 8.2V6.4A1.6 1.6 0 0 0 13.4 4.8H6.6A1.6 1.6 0 0 0 5 6.4v11.2a1.6 1.6 0 0 0 1.6 1.6h6.8a1.6 1.6 0 0 0 1.6-1.6v-1.8" />
      <Path d="M10.4 12H20m-3 -3 3 3-3 3" />
    </>
  ),
  refresh: () => (
    <>
      <Path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.3" />
      <Path d="M18 3.6v3.6h-3.6" />
    </>
  ),
  // The report action's mark: a pole with a waving flag. Web draws the same
  // paths inline (web/src/pages/AnimalPage.tsx).
  flag: () => (
    <>
      <Path d="M6 20.4V4.2" />
      <Path d="M6 4.8c2.2-1.2 4.4-1.2 6.6 0s4.2 1.2 6.4 0v8.4c-2.2 1.2-4.2 1.2-6.4 0s-4.4-1.2-6.6 0" />
    </>
  ),
  settings: () => (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
};
