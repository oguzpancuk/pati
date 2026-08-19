import React from 'react';
import { View } from 'react-native';
import type { UserLevel } from '../api/users';
import Text from './ui/Text';
import Gradient from './brand/Gradient';
import { makeStyles, radius, spacing } from '../theme';

interface Props {
  level: UserLevel | null | undefined;
  points: number;
}

/**
 * The level card (handoff 3d): the title, "in N points: the next title", and
 * a 4pt gradient progress bar — one of the four places the gradient is
 * allowed. The medallion and the point total live in the stat strip above,
 * so this card stays a single quiet line of progress.
 *
 * Level data comes from the server; thresholds are not repeated here.
 */
export default function LevelBar({ level, points }: Props) {
  const styles = useStyles();
  if (!level) return null;

  const remaining =
    level.nextLevelPoints !== null ? Math.max(0, level.nextLevelPoints - points) : 0;
  const pct = Math.max(2, Math.round(level.progress * 100));

  return (
    <View style={styles.container}>
      <Text variant="subheading">{level.title}</Text>
      <Text variant="caption" style={styles.hint}>
        {level.nextTitle ? `${remaining} puan sonra: ${level.nextTitle}` : 'En üst seviyedesin'}
      </Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]}>
          <Gradient radius={radius.pill} direction="horizontal" />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  container: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  hint: { marginTop: 2 },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: c.disabled,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
}));
