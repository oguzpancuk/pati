import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { UserLevel } from '../api/users';

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
        <Text style={styles.emoji}>{level.emoji}</Text>
        <View style={styles.titleBox}>
          <Text style={styles.levelLabel}>Seviye {level.level}</Text>
          <Text style={styles.title}>{level.title}</Text>
        </View>
        <Text style={styles.points}>{points} puan</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(level.progress * 100)}%` }]} />
      </View>

      <Text style={styles.hint}>
        {level.nextTitle
          ? `${level.nextTitle} için ${remaining} puan daha`
          : 'En üst seviyedesin 👑'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f4f7f4',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  emoji: { fontSize: 28, marginRight: 10 },
  titleBox: { flex: 1 },
  levelLabel: { color: '#888', fontSize: 11, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700' },
  points: { fontSize: 14, fontWeight: '700', color: '#2e7d32' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dfe6df',
    marginTop: 12,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#2e7d32' },
  hint: { color: '#666', fontSize: 12, marginTop: 6 },
});
