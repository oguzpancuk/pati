import React, { useCallback, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Animal, fetchAnimals } from '../api/animals';
import { getCurrentLocation } from '../location';

const NEARBY_RADIUS_METERS = 5000;

function formatDistance(meters?: number) {
  if (meters === undefined) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function AnimalsScreen({ navigation }: any) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loc = await getCurrentLocation();
      const data = await fetchAnimals(loc.lat, loc.lng, NEARBY_RADIUS_METERS);
      setAnimals(data);
    } catch (err: any) {
      Alert.alert('Hayvanlar yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button title="Yeni Hayvan Ekle" onPress={() => navigation.navigate('AddAnimal')} />
      </View>
      <FlatList
        data={animals}
        keyExtractor={(item) => String(item.id)}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('AnimalProfile', { animalId: item.id })}
          >
            <Text style={styles.name}>{item.name ?? (item.species === 'cat' ? 'Kedi' : 'Köpek')}</Text>
            <Text style={styles.meta}>
              {item.color ?? '-'} · {formatDistance(item.distance_meters)}
            </Text>
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
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#555', marginTop: 4 },
  empty: { textAlign: 'center', color: '#888', marginTop: 32 },
});
