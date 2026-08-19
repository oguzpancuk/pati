import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import { hitSlop, makeStyles, spacing } from '../../theme';

export type SectionHeaderProps = {
  title: string;
  /** The link on the right, e.g. "tümünü gör". */
  actionLabel?: string;
  onAction?: () => void;
  /** Draw the hairline that separates this section from the one above. */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A section heading in the micro-label language: lowercase, 10.5pt, widely
 * spaced — the studio aesthetic's replacement for uppercase headings. The
 * optional hairline above it is what separates sections now that cards no
 * longer stack.
 */
export default function SectionHeader({
  title,
  actionLabel,
  onAction,
  divider = true,
  style,
}: SectionHeaderProps) {
  const styles = useStyles();
  return (
    <View style={[divider && styles.divider, style]}>
      <View style={styles.row}>
        <Text variant="micro" style={styles.title}>
          {title.toLocaleLowerCase('tr-TR')}
        </Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={hitSlop} accessibilityRole="button">
            <Text variant="captionStrong" color="brand">
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  divider: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { flexShrink: 1, marginRight: spacing.md },
}));
