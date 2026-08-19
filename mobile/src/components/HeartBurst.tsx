import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { makeStyles, useTheme } from '../theme';

// The hearts' total duration; when it ends, MapScreen switches the marker
// back to "frozen" mode (tracksViewChanges=false). This value and the wait
// there must match, or the animation gets cut short or the map keeps
// redrawing needlessly.
export const HEART_BURST_DURATION_MS = 1500;

const HEART_COUNT = 5;
const STAGGER_MS = 110;
const RISE_MS = HEART_BURST_DURATION_MS - STAGGER_MS * (HEART_COUNT - 1);

// The heart path from Icon.tsx; kept separately because it's drawn filled here.
const HEART_PATH =
  'M12 20.2S4.4 15.3 4.4 10.5A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.6 2.8c0 4.8-7.6 9.7-7.6 9.7Z';

// Each heart's horizontal drift and size are fixed (not random): when
// several markers burst at once they all fly in the same rhythm and the
// screen doesn't turn chaotic.
const SPREAD = [-14, 8, -4, 14, 2];
const SCALES = [1, 0.8, 1.15, 0.85, 0.95];

/** How far the hearts rise from the avatar's center; the component placing
 * the layer (MapScreen) sizes the box from this. */
export function heartRiseFor(size: number) {
  return Math.round(size * 1.6);
}

type Props = {
  /** Diameter of the avatar the hearts rise from; the rise distance scales with it. */
  size: number;
};

/**
 * Hearts drifting up from the top of an avatar and fading. The "thank you"
 * of the animals in range when food/water is left. The component plays once
 * by itself; replaying means remounting (MapScreen does it with key).
 */
export default function HeartBurst({ size }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const progress = useRef(Array.from({ length: HEART_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = progress.map((value, index) =>
      Animated.sequence([
        Animated.delay(index * STAGGER_MS),
        Animated.timing(value, {
          toValue: 1,
          duration: RISE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    const group = Animated.parallel(animations);
    group.start();
    return () => group.stop();
  }, [progress]);

  const rise = heartRiseFor(size);
  const heartSize = Math.max(12, Math.round(size * 0.42));

  return (
    <View pointerEvents="none" style={[styles.layer, { width: size, height: size + rise }]}>
      {progress.map((value, index) => {
        const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] });
        const translateX = value.interpolate({
          inputRange: [0, 1],
          outputRange: [0, SPREAD[index]],
        });
        // Appears first, fades later: visible from 0→15%, gone after 55%.
        // The heart looks like it's "born" out of the avatar.
        const opacity = value.interpolate({
          inputRange: [0, 0.15, 0.55, 1],
          outputRange: [0, 1, 0.9, 0],
        });
        const scale = value.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0.5, SCALES[index], SCALES[index] * 0.9],
        });
        return (
          <Animated.View
            key={index}
            style={[
              styles.heart,
              {
                left: size / 2 - heartSize / 2,
                bottom: size * 0.55,
                opacity,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
          >
            <Svg width={heartSize} height={heartSize} viewBox="0 0 24 24">
              <Path d={HEART_PATH} fill={colors.brand} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  // The layer sits over the avatar; hearts rise from the avatar's center.
  layer: { position: 'absolute', left: 0, bottom: 0 },
  heart: { position: 'absolute' },
}));
