import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { makeStyles, spacing } from '../../theme';

/** Kart içi ayraç. */
export default function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.line, style]} />;
}

const useStyles = makeStyles(({ colors: c }) => ({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginVertical: spacing.md,
  },
}));
