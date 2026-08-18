import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchLeaderboard, LeaderboardEntry, LeaderboardResponse } from '../api/users';
import { TIER_EMOJI } from '../badges';

function medalFor(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export default function LeaderboardScreen({ navigation }: any) {
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
      <TouchableOpacity
        style={[styles.row, highlight && styles.rowHighlight]}
        onPress={() => navigation.navigate('PublicProfile', { userId: entry.id })}
      >
        <Text style={styles.rank}>{medal ?? entry.rank}</Text>
        {entry.avatar_url ? (
          <Image source={{ uri: entry.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{entry.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name}>{entry.name}</Text>
          <Text style={styles.meta}>
            {entry.badgeCount} rozet
            {entry.topTier ? ` · en yüksek ${TIER_EMOJI[entry.topTier]}` : ''}
          </Text>
        </View>
        <View style={styles.pointsBox}>
          <Text style={styles.points}>{entry.points}</Text>
          <Text style={styles.pointsLabel}>puan</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {data?.me && (
        <View style={styles.myCard}>
          <Text style={styles.myTitle}>Sıralamanız</Text>
          <Text style={styles.myRank}>
            {data.me.rank}. / {data.totalUsers}
          </Text>
          <Text style={styles.myMeta}>
            {data.me.points} puan · rozetlerden {data.me.badgePoints}, yorumlardan{' '}
            {data.me.commentPoints}
          </Text>
        </View>
      )}

      <FlatList
        data={data?.entries ?? []}
        keyExtractor={(item) => String(item.id)}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => renderRow(item, item.id === data?.me?.id)}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Henüz sıralama verisi yok.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  myCard: {
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
  },
  myTitle: { color: '#2e7d32', fontWeight: '600', fontSize: 12 },
  myRank: { fontSize: 26, fontWeight: '700', marginTop: 2 },
  myMeta: { color: '#555', fontSize: 12, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowHighlight: { backgroundColor: '#f1f8e9' },
  rank: { width: 34, fontSize: 15, fontWeight: '700', color: '#555' },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  avatarPlaceholder: { backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { color: '#888', fontSize: 12, marginTop: 2 },
  pointsBox: { alignItems: 'flex-end' },
  points: { fontSize: 16, fontWeight: '700' },
  pointsLabel: { color: '#888', fontSize: 10 },
  empty: { textAlign: 'center', color: '#888', marginTop: 32 },
});
