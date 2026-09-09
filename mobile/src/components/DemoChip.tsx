import React from 'react';
import { View } from 'react-native';
import Text from './ui/Text';
import { makeStyles } from '../theme';
import { radius, spacing } from '../theme/layout';

/**
 * The mark on everything the showcase seed created (owner, 2026-09-09):
 * names stay ordinary, so a quiet chip is what tells a newcomer that this
 * animal, account or drop is part of the tour. Every viewer can switch the
 * whole showcase off from their profile.
 */
export default function DemoChip({ visible = true }: { visible?: boolean }) {
  const styles = useStyles();
  if (!visible) return null;
  return (
    <View style={styles.chip}>
      <Text variant="micro" color="textSubtle">
        demo
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  chip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
}));
