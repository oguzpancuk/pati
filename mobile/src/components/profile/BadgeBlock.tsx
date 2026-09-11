import React from 'react';
import { View } from 'react-native';
import type { Badge } from '../../badges';
import { badgeProgressText, badgeTitle } from '../../badges';
import { BadgeSymbol } from '../badges';
import { Card, SectionHeader, Text } from '../ui';
import { makeStyles, spacing } from '../../theme';

export type BadgeBlockProps = {
  title: string;
  actionLabel: string;
  /** Opens the badge catalog (selectable on your own profile). */
  onAction: () => void;
  badges: Badge[];
  emptyText: string;
  /** Only your own profile invites a tap on the empty card (to pick badges). */
  emptyPressable?: boolean;
  style?: React.ComponentProps<typeof View>['style'];
};

/** The featured-badge row, identical on both profiles. */
export default function BadgeBlock({
  title,
  actionLabel,
  onAction,
  badges,
  emptyText,
  emptyPressable = false,
  style,
}: BadgeBlockProps) {
  const styles = useStyles();
  return (
    <View style={style}>
      <SectionHeader title={title} actionLabel={actionLabel} onAction={onAction} />
      {badges.length === 0 ? (
        <Card variant="flat" onPress={emptyPressable ? onAction : undefined}>
          <Text variant="caption">{emptyText}</Text>
        </Card>
      ) : (
        <View style={styles.row}>
          {badges.map((badge) => (
            <Card
              key={badge.key}
              variant="flat"
              padding="md"
              style={styles.card}
              onPress={onAction}
            >
              <View style={styles.symbol}>
                <BadgeSymbol symbol={badge.symbol} tier={badge.tier} size={40} />
              </View>
              <Text variant="captionStrong" color="text" center numberOfLines={2}>
                {badgeTitle(badge)}
              </Text>
              <Text variant="micro" center style={styles.progress}>
                {badgeProgressText(badge)}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: 'row', gap: spacing.sm },
  card: { flex: 1, alignItems: 'center' },
  symbol: { marginBottom: spacing.xs },
  progress: { marginTop: 2 },
}));
