import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import { hitSlop, makeStyles, spacing } from '../../theme';

export type SectionHeaderProps = {
  title: string;
  /** The link on the right, e.g. "see all". */
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Section title + an optional link on the right. */
export default function SectionHeader({ title, actionLabel, onAction, style }: SectionHeaderProps) {
  const styles = useStyles();
  return (
    <View style={[styles.row, style]}>
      <Text variant="heading" style={styles.title}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={hitSlop} accessibilityRole="button">
          <Text variant="captionStrong" color="brand">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { flexShrink: 1, marginRight: spacing.md },
}));
