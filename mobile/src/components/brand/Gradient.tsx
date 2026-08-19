import React, { useId, useState } from 'react';
import { StyleSheet, StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';

type Props = {
  /** Corner radius of the filled rectangle; match the parent's borderRadius. */
  radius?: number;
  /** 135° (default, top-left → bottom-right) or 90° for progress bars. */
  direction?: 'diagonal' | 'horizontal';
  style?: StyleProp<ViewStyle>;
};

/**
 * The brand gradient as a background layer.
 *
 * React Native has no gradient primitive and we deliberately avoid adding a
 * native module for it (`react-native-linear-gradient` would mean another
 * pod install for every contributor); react-native-svg is already a linked
 * dependency, so the gradient is an absolutely positioned SVG rectangle
 * behind the content.
 *
 * Use it in the four places the handoff allows — the logo, the primary
 * button, the progress bar and the selected chip — and nowhere else.
 */
export default function Gradient({ radius = 18, direction = 'diagonal', style }: Props) {
  const { colors } = useTheme();
  // SVG clamps rx to width/2 and ry to height/2 *independently*, so a pill
  // radius (999) on a wide rect turned into an ellipse ("egg"). Measure the
  // layer and clamp both to the same value: min(radius, half the short side).
  const [size, setSize] = useState({ w: 0, h: 0 });
  const r = Math.min(radius, size.w / 2, size.h / 2) || 0;
  // Several gradients can live on one screen; a per-instance id keeps their
  // <Defs> from colliding.
  const id = `pati-grad-${useId()}`;
  const horizontal = direction === 'horizontal';

  return (
    // The Svg sits inside a plain View that Yoga lays out (absoluteFill); the
    // Svg itself gets explicit 100% width/height. A bare absoluteFill Svg
    // measured itself once at mount and never grew with the parent (the
    // label re-measures when Quicksand loads), so the gradient covered only a
    // corner and white labels vanished on white.
    <View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2={horizontal ? '0' : '1'}>
            <Stop offset="0" stopColor={colors.gradStart} />
            <Stop offset="1" stopColor={colors.gradEnd} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={r} ry={r} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
