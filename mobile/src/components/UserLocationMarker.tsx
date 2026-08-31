import React from 'react';
import { View } from 'react-native';
import Logo from './brand/Logo';
import { makeStyles } from '../theme';

/**
 * The user's own position, marked with the app icon's glyph (owner
 * decision, 2026-08-31 — it replaced the charcoal dot in a white ring; no
 * backing disc, the paw-pin stands directly on the map). The heart cutout
 * is transparent so the map ground shows through it like the icon's own
 * negative space.
 */
export default function UserLocationMarker() {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <Logo size={30} accent="transparent" />
    </View>
  );
}

const useStyles = makeStyles(({ shadow }) => ({
  // A soft shadow instead of a white ring: the mark must separate from the
  // map ground without a backing disc.
  wrap: { ...shadow.float },
}));
