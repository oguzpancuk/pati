import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { fetchUserComments, UserComment } from '../api/users';
import AnimalAvatar from '../components/AnimalAvatar';
import { Card, Chip, EmptyState, Screen, Text } from '../components/ui';
import { spacing } from '../theme';

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
    <Screen padded={false}>
      <FlatList
        data={comments}
        keyExtractor={(item) => String(item.id)}
        refreshing={loading && comments.length === 0}
        onRefresh={() => load(0)}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (!loading && comments.length < total) load(comments.length);
        }}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          total > 0 ? (
            <Text variant="label" style={styles.header}>
              TOPLAM {total} YORUM
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Card
            variant="flat"
            padding="md"
            style={styles.row}
            onPress={() => navigation.push('AnimalProfile', { animalId: item.animal_id })}
          >
            <AnimalAvatar species={item.animal_species} photoUrl={item.animal_photo_url} size={44} />
            <View style={styles.body}>
              <View style={styles.metaRow}>
                <Text variant="bodyStrong" style={styles.animalName} numberOfLines={1}>
                  {item.animal_name ?? (item.animal_species === 'cat' ? 'Kedi' : 'Köpek')}
                </Text>
                <Text variant="micro" style={styles.date}>
                  {formatDate(item.created_at)}
                </Text>
              </View>
              <Text variant="body" style={styles.text}>
                {item.body}
              </Text>
              {item.health_record_id !== null && (
                <Chip label="Sağlık kaydı" tone="warning" style={styles.healthTag} />
              )}
            </View>
          </Card>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState emoji="💬" title="Yorum yok" description="Henüz yorum yapılmamış." />
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.md },
  row: { flexDirection: 'row', marginBottom: spacing.sm },
  body: { flex: 1, marginLeft: spacing.md },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  animalName: { flexShrink: 1 },
  date: { marginLeft: spacing.sm },
  text: { marginTop: spacing.xs },
  healthTag: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
