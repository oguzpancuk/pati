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

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  // A soft shadow instead of a white ring: the mark must separate from the
  // map ground without a backing disc.
  wrap: { ...shadow.float, alignItems: 'center' },
  // Flattened ellipse (ground perspective) centered at the pin tip — the
  // marker anchors bottom, so the tip is the actual coordinate.
  halo: {
    position: 'absolute',
    bottom: -7,
    width: 26,
    height: 14,
    borderRadius: 13,
    backgroundColor: c.brand,
  },
}));
