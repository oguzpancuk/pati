import React from 'react';
import type { UserRank } from '../../api/users';
import StatStrip from '../StatStrip';
import { makeStyles, spacing } from '../../theme';

export type ProfileStatsProps = {
  points: number;
  rank: UserRank | null;
  level: number;
  /** Showcase account: it does not compete, so the rank cell names it. */
  demo?: boolean;
  /** Omitted for a showcase account — it is not on the board (review finding). */
  onOpenLeaderboard?: () => void;
};

/**
 * The numbers under the header, identical on both profiles: one three-cell
 * strip, puan / sıra / seviye. The four small counts (mama · su · hayvan ·
 * arkadaş) that used to sit under it are gone — no item ever asked for them
 * and the owner had them removed (2026-09-11).
 */
export default function ProfileStats({
  points,
  rank,
  level,
  demo = false,
  onOpenLeaderboard,
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
    </>
  );
}

const useStyles = makeStyles(() => ({
  // The strip is the last thing before the level bar now, so it carries the
  // gap the counts row used to.
  strip: { marginBottom: spacing.lg },
}));
