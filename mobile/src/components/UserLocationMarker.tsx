import React from 'react';
import { View } from 'react-native';
import { makeStyles, mapColors, radius } from '../theme';

// The familiar "location dot" seen on maps: the outer ring implies the
// location is approximate, the white-bordered inner dot stays legible over
// the map at all times. The plain Circle used before looked like a smudge
// that vanished into the map ground and resized with zoom.
// The color is brand orange: it doesn't blend with the green care circles.
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
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: mapColors.userRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    // The dot sits over the map; the map ground doesn't follow the theme,
    // so the border stays light in both themes.
    backgroundColor: mapColors.userRadiusStroke,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: c.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
}));
