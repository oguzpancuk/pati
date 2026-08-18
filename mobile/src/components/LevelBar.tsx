import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { UserLevel } from '../api/users';
import Text from './ui/Text';
import { palette, radius, spacing } from '../theme';

interface Props {
  level: UserLevel | null | undefined;
  points: number;
}

/**
 * Seviye rozeti + bir sonraki seviyeye kalan puanı gösteren çubuk.
 * Seviye bilgisi sunucudan geliyor; eşikler burada tekrarlanmıyor.
 */
export default function LevelBar({ level, points }: Props) {
  if (!level) return null;

  const remaining =
    level.nextLevelPoints !== null ? Math.max(0, level.nextLevelPoints - points) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.emojiBox}>
          <Text style={styles.emoji}>{level.emoji}</Text>
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
        {level.nextTitle
          ? `${level.nextTitle} için ${remaining} puan daha`
          : 'En üst seviyedesin 👑'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  emojiBox: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: palette.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  emoji: { fontSize: 24, lineHeight: 30 },
  titleBox: { flex: 1 },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.disabled,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: palette.brand },
  hint: { marginTop: spacing.sm },
});
