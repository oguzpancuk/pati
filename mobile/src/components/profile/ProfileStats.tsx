import React from 'react';
import { View } from 'react-native';
import type { UserRank } from '../../api/users';
import StatStrip from '../StatStrip';
import { Text } from '../ui';
import { makeStyles, spacing } from '../../theme';

export type ProfileCounts = {
  food: number;
  water: number;
  animals: number;
  friends: number;
};

export type ProfileStatsProps = {
  points: number;
  rank: UserRank | null;
  level: number;
  /** Showcase account: it does not compete, so the rank cell names it. */
  demo?: boolean;
  /** Omitted for a showcase account — it is not on the board (review finding). */
  onOpenLeaderboard?: () => void;
  counts: ProfileCounts;
};

/**
 * The numbers under the header, identical on both profiles: the three-cell
 * strip (puan / sıra / seviye) over the four small counts.
 */
export default function ProfileStats({
  points,
  rank,
  level,
  demo = false,
  onOpenLeaderboard,
  counts,
}: ProfileStatsProps) {
  const styles = useStyles();

  return (
    <>
      <StatStrip
        style={styles.strip}
        stats={[
          { value: String(points), label: 'puan' },
          {
            // Rank alone; the total is on the leaderboard (the cell is
            // narrow). A showcase account does not compete (owner,
            // 2026-09-09), so its cell names what the account is instead.
            value: demo ? 'demo' : rank ? `${rank.rank}.` : '—',
            label: demo ? 'hesabı' : 'sıra',
            onPress: demo ? undefined : onOpenLeaderboard,
          },
          { value: String(level), label: 'seviye' },
        ]}
      />
      <View style={styles.counts}>
        {[
          { value: counts.food, label: 'mama' },
          { value: counts.water, label: 'su' },
          // "hayvan", not "kayıt": the drop-history row-button a few pixels
          // below says "N kayıt" about the food/water total, and one word
          // could not mean both things that close together (review finding).
          { value: counts.animals, label: 'hayvan' },
          { value: counts.friends, label: 'arkadaş' },
        ].map((cell) => (
          <View key={cell.label} style={styles.cell}>
            <Text variant="subheading">{String(cell.value)}</Text>
            <Text variant="micro">{cell.label}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const useStyles = makeStyles(() => ({
  strip: { marginBottom: spacing.md },
  counts: { flexDirection: 'row', marginBottom: spacing.lg },
  cell: { flex: 1, alignItems: 'center' },
}));
