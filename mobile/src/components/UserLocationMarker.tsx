import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { makeStyles } from '../theme';

/**
 * The user's own position as a small brand-orange dot in a white ring with
 * a breathing halo — the Google Maps idiom (owner decision, 2026-09-08,
 * P7 item 9; it retires the paw-pin of 2026-08-31, which was too big once
 * records and avatars started fanning around the spot). Centred on the
 * coordinate: MapScreen anchors it at (0.5, 0.5).
 */
export default function UserLocationMarker() {
  const styles = useStyles();
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 2.2,
          duration: 2000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.halo, { opacity, transform: [{ scale }] }]} />
      <View style={styles.dot} />
    </View>
  );
}

// The halo swells to ~2.2× the dot; the wrap is sized so the fully-scaled
// halo stays INSIDE the view bounds — Android marker containers may clip
// children that overflow.
export const USER_MARKER_SIZE = 40;
const DOT_SIZE = 14;
const HALO_SIZE = 18;

const useStyles = makeStyles(({ colors: c }) => ({
  wrap: {
    width: USER_MARKER_SIZE,
    height: USER_MARKER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: c.brand,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: c.brand,
    borderWidth: 2.5,
    borderColor: c.surface,
    shadowColor: c.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
}));
