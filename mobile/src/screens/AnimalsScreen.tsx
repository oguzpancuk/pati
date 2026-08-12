import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Animal, fetchAnimals } from '../api/animals';
import { getCurrentLocation } from '../location';

const NEARBY_RADIUS_METERS = 5000;

type SpeciesFilter = 'all' | 'cat' | 'dog';

function formatDistance(meters?: number) {
  if (meters === undefined) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function AnimalsScreen({ navigation }: any) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [filter, setFilter] = useState<SpeciesFilter>('all');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (species: SpeciesFilter) => {
    setLoading(true);
    try {
      const loc = await getCurrentLocation();
      const data = await fetchAnimals(
        loc.lat,
        loc.lng,
        NEARBY_RADIUS_METERS,
        species === 'all' ? undefined : species
      );
      setAnimals(data);
    } catch (err: any) {
      Alert.alert('Hayvanlar yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter])
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button title="Yeni Hayvan Ekle" onPress={() => navigation.navigate('AddAnimal')} />
        <View style={styles.filterRow}>
          {(['all', 'cat', 'dog'] as SpeciesFilter[]).map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.filterChip, filter === option && styles.filterChipSelected]}
              onPress={() => setFilter(option)}
            >
              <Text style={[styles.filterText, filter === option && styles.filterTextSelected]}>
                {option === 'all' ? 'Tümü' : option === 'cat' ? 'Kedi' : 'Köpek'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={animals}
        keyExtractor={(item) => String(item.id)}
        refreshing={loading}
        onRefresh={() => load(filter)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('AnimalProfile', { animalId: item.id })}
          >
            {item.cover_photo_url ? (
              <Image source={{ uri: item.cover_photo_url }} style={styles.thumbnail} />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                <Text style={styles.thumbnailPlaceholderText}>
                  {item.species === 'cat' ? '🐱' : '🐶'}
                </Text>
              </View>
            )}
            <View style={styles.rowText}>
              <Text style={styles.name}>
                {item.name ?? (item.species === 'cat' ? 'Kedi' : 'Köpek')}
              </Text>
              <Text style={styles.meta}>
                {item.breed ?? '-'} · {formatDistance(item.distance_meters)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>Yakınınızda kayıtlı hayvan bulunamadı.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filterChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  filterChipSelected: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  filterText: { color: '#333' },
  filterTextSelected: { color: '#fff', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  thumbnail: { width: 52, height: 52, borderRadius: 8, marginRight: 12 },
  thumbnailPlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: { fontSize: 24 },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#555', marginTop: 4 },
  empty: { textAlign: 'center', color: '#888', marginTop: 32 },
});
