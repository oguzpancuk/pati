import React, { useEffect, useState } from 'react';
import { FlatList, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimalDetail, fetchAnimal } from '../api/animals';

export default function AnimalProfileScreen({ route }: any) {
  const { animalId } = route.params;
  const [animal, setAnimal] = useState<AnimalDetail | null>(null);

  useEffect(() => {
    fetchAnimal(animalId).then(setAnimal);
  }, [animalId]);

  if (!animal) {
    return (
      <View style={styles.center}>
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}</Text>
      <Text style={styles.meta}>
        {animal.color ?? '-'} · {animal.breed ?? '-'}
      </Text>
      {animal.markings ? <Text style={styles.meta}>İşaretler: {animal.markings}</Text> : null}

      <FlatList
        horizontal
        data={animal.photos}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <Image source={{ uri: item.url }} style={styles.photo} />}
        style={styles.photoList}
      />

      <Text style={styles.sectionTitle}>Sağlık Kayıtları</Text>
      {animal.healthRecords.length === 0 ? (
        <Text style={styles.meta}>Henüz kayıt yok.</Text>
      ) : (
        animal.healthRecords.map((record) => (
          <View key={record.id} style={styles.recordCard}>
            <Text style={styles.recordType}>
              {record.record_type} {record.vet_verified ? '· Veteriner Onaylı' : ''}
            </Text>
            <Text>{record.description}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#555', marginTop: 4 },
  photoList: { marginVertical: 16 },
  photo: { width: 120, height: 120, borderRadius: 8, marginRight: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 8, marginBottom: 8 },
  recordCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  recordType: { fontWeight: '600', marginBottom: 4, textTransform: 'capitalize' },
});
