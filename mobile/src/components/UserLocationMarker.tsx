import React from 'react';
import { View } from 'react-native';
import { makeStyles, mapColors, radius } from '../theme';

// The familiar "location dot" seen on maps: a charcoal dot inside a white
// ring (handoff 3b). It used to be brand orange, but with the studio palette
// orange means "action" — the user's own position is a neutral fact, and
// charcoal also stops it competing with the green care circles.
export default function UserLocationMarker() {
  const styles = useStyles();
  return (
    <View style={styles.halo}>
      <View style={styles.dot} />
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  halo: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 15,
    height: 15,
    borderRadius: radius.pill,
    // The dot sits over the map; the map ground doesn't follow the app theme,
    // so the ring stays white in both themes.
    backgroundColor: mapColors.userDot,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: c.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
}));
