import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Logo from './brand/Logo';
import { makeStyles } from '../theme';

/**
 * The user's own position, marked with the app icon's glyph (owner
 * decision, 2026-08-31 — it replaced the charcoal dot in a white ring; no
 * backing disc, the paw-pin stands directly on the map). The heart cutout
 * is transparent so the map ground shows through it like the icon's own
 * negative space. A breathing halo at the pin tip says "you are here"
 * (owner choice over a bouncing marker, 2026-08-31).
 */
export default function UserLocationMarker() {
  const styles = useStyles();
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1.6,
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
      <Logo size={30} accent="transparent" />
    </View>
  );
}

// The halo swells to ~42×22 around the pin tip; the wrap is sized so the
// fully-scaled halo stays INSIDE the view bounds — Android marker
// containers may clip children that overflow, which would shave the halo
// on one platform only. MapScreen's anchor compensates for the extra
// height below the tip (see PIN_TIP_ANCHOR_Y).
export const USER_MARKER_WIDTH = 44;
export const USER_MARKER_HEIGHT = 45;
const LOGO_HEIGHT = 33; // Logo size 30 at the 120×130 aspect ratio.
/** Anchor fraction that puts the pin tip on the coordinate. */
export const PIN_TIP_ANCHOR_Y = LOGO_HEIGHT / USER_MARKER_HEIGHT;

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  // A soft shadow instead of a white ring: the mark must separate from the
  // map ground without a backing disc.
  wrap: {
    ...shadow.float,
    width: USER_MARKER_WIDTH,
    height: USER_MARKER_HEIGHT,
    alignItems: 'center',
  },
  // Flattened ellipse (ground perspective) centered at the pin tip.
  halo: {
    position: 'absolute',
    top: LOGO_HEIGHT - 7,
    width: 26,
    height: 14,
    borderRadius: 13,
    backgroundColor: c.brand,
  },
}));
