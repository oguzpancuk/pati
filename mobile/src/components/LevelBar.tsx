import React from 'react';
import { View } from 'react-native';
import type { UserLevel } from '../api/users';
import Text from './ui/Text';
import { LevelMark } from './badges';
import { makeStyles, radius, spacing } from '../theme';

interface Props {
  level: UserLevel | null | undefined;
  points: number;
}

/**
 * The level emblem + a bar showing points left to the next level.
 * Level data comes from the server; thresholds are not repeated here.
 */
export default function LevelBar({ level, points }: Props) {
  const styles = useStyles();
  if (!level) return null;

  const remaining =
    level.nextLevelPoints !== null ? Math.max(0, level.nextLevelPoints - points) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.mark}>
          <LevelMark level={level.level} size={44} />
        </View>
        <View style={styles.titleBox}>
          <Text variant="micro">SEVİYE {level.level}</Text>
          <Text variant="subheading">{level.title}</Text>
        </View>
        <Text variant="bodyStrong" color="brand">
          {points} puan
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(level.progress * 100)}%` }]} />
      </View>

      <Text variant="caption" style={styles.hint}>
        {level.nextTitle ? `${level.nextTitle} için ${remaining} puan daha` : 'En üst seviyedesin'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  container: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  mark: { marginRight: spacing.md },
  titleBox: { flex: 1 },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: c.disabled,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: c.brand },
  hint: { marginTop: spacing.sm },
}));
