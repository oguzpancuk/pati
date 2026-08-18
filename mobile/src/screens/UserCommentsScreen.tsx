import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchUserComments, UserComment } from '../api/users';
import AnimalAvatar from '../components/AnimalAvatar';

const PAGE_SIZE = 30;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function UserCommentsScreen({ route, navigation }: any) {
  // userId verilmezse kendi yorumlarımız listelenir.
  const userId: number | 'me' = route.params?.userId ?? 'me';
  const [comments, setComments] = useState<UserComment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const data = await fetchUserComments(userId, PAGE_SIZE, offset);
        setTotal(data.total);
        setComments((prev) => (offset === 0 ? data.comments : [...prev, ...data.comments]));
        if (offset === 0) {
          navigation.setOptions({
            title: route.params?.name ? `${route.params.name} · Yorumlar` : 'Yorumlarım',
          });
        }
      } catch (err: any) {
        Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
      } finally {
        setLoading(false);
      }
    },
    [userId, navigation, route.params?.name]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  return (
    <FlatList
      style={styles.container}
      data={comments}
      keyExtractor={(item) => String(item.id)}
      refreshing={loading && comments.length === 0}
      onRefresh={() => load(0)}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && comments.length < total) load(comments.length);
      }}
      ListHeaderComponent={
        total > 0 ? <Text style={styles.header}>Toplam {total} yorum</Text> : null
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.push('AnimalProfile', { animalId: item.animal_id })}
        >
          <AnimalAvatar species={item.animal_species} photoUrl={item.animal_photo_url} size={44} />
          <View style={styles.body}>
            <View style={styles.metaRow}>
              <Text style={styles.animalName}>
                {item.animal_name ?? (item.animal_species === 'cat' ? 'Kedi' : 'Köpek')}
              </Text>
              <Text style={styles.date}>{formatDate(item.created_at)}</Text>
            </View>
            <Text style={styles.text}>{item.body}</Text>
            {item.health_record_id !== null && (
              <Text style={styles.healthTag}>Sağlık kaydına bağlı</Text>
            )}
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        !loading ? <Text style={styles.empty}>Henüz yorum yapılmamış.</Text> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { color: '#888', fontSize: 12, paddingHorizontal: 16, paddingTop: 12 },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  body: { flex: 1, marginLeft: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  animalName: { fontWeight: '600', fontSize: 15, flexShrink: 1 },
  date: { color: '#888', fontSize: 11, marginLeft: 8 },
  text: { color: '#333', marginTop: 4, lineHeight: 20 },
  healthTag: { color: '#ef6c00', fontSize: 11, marginTop: 4, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginTop: 32 },
});
