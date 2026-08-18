import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { palette, spacing } from '../../theme';

/** Kart içi ayraç. */
export default function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.line, style]} />;
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginVertical: spacing.md,
  },
});
