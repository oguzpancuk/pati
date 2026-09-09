import React, { useCallback, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchLeaderboard, LeaderboardEntry, LeaderboardResponse } from '../api/users';
import { TIER_LABELS } from '../badges';
import { Avatar, Card, EmptyState, Screen, Text } from '../components/ui';
import { LevelMark } from '../components/badges';
import { makeStyles, radius, spacing } from '../theme';

function medalFor(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export default function LeaderboardScreen({ navigation }: any) {
  const styles = useStyles();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchLeaderboard(100));
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function renderRow(entry: LeaderboardEntry, highlight: boolean) {
    const medal = medalFor(entry.rank);
    return (
      <Card
        variant="flat"
        padding="md"
        style={[styles.row, highlight && styles.rowHighlight]}
        onPress={() => navigation.navigate('PublicProfile', { userId: entry.id })}
      >
        <View style={styles.rankBox}>
          <Text
            variant={medal ? 'heading' : 'bodyStrong'}
            color={highlight ? 'brand' : 'textMuted'}
          >
            {medal ?? entry.rank}
          </Text>
        </View>
        <Avatar uri={entry.avatar_url} name={entry.name} size={40} style={styles.avatar} />
        <View style={styles.info}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {entry.name}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {entry.level ? `Sv.${entry.level.level} ${entry.level.title} · ` : ''}
            {entry.badgeCount} rozet
            {entry.topTier ? ` · en yüksek ${TIER_LABELS[entry.topTier]}` : ''}
          </Text>
        </View>
        <View style={styles.pointsBox}>
          <Text variant="subheading" color="brand">
            {entry.points}
          </Text>
          <Text variant="micro">puan</Text>
        </View>
      </Card>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={data?.entries ?? []}
        keyExtractor={(item) => String(item.id)}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          data?.me ? (
            <Card style={styles.myCard}>
              <Text variant="micro">sıralaman</Text>
              <Text variant="display" style={styles.myRank}>
                {data.me.rank}
                <Text variant="heading" color="textMuted">
                  {' '}
                  / {data.totalUsers}
                </Text>
              </Text>
              <Text variant="caption">
                {data.me.points} puan · rozetlerden {data.me.badgePoints}, yorumlardan{' '}
                {data.me.commentPoints}
              </Text>
              {data.me.level && (
                <View style={styles.levelPill}>
                  <LevelMark level={data.me.level.level} size={22} />
                  <Text variant="captionStrong" color="brandDark" style={styles.levelPillText}>
                    Seviye {data.me.level.level} · {data.me.level.title}
                  </Text>
                </View>
              )}
            </Card>
          ) : null
        }
        renderItem={({ item }) => renderRow(item, item.id === data?.me?.id)}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              emoji="🏆"
              title="Sıralama henüz boş"
              description="İlk mama ve su kaydını bırakan buraya çıkar."
            />
          ) : null
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  myCard: { marginBottom: spacing.lg },
  myRank: { marginTop: 2, marginBottom: spacing.xs },
  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    backgroundColor: c.brandSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  levelPillText: { marginLeft: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  rowHighlight: { borderColor: c.brand, backgroundColor: c.brandTint },
  rankBox: { width: 34, alignItems: 'center' },
  avatar: { marginHorizontal: spacing.md },
  info: { flex: 1, marginRight: spacing.sm },
  pointsBox: { alignItems: 'flex-end' },
}));
