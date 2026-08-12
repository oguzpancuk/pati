import React, { useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createAnimal } from '../api/animals';
import { getCurrentLocation } from '../location';

type Species = 'cat' | 'dog';

export default function AddAnimalScreen({ navigation }: any) {
  const [species, setSpecies] = useState<Species>('cat');
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [markings, setMarkings] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const loc = await getCurrentLocation();
      const animal = await createAnimal({
        species,
        name: name || undefined,
        color: color || undefined,
        size: size || undefined,
        markings: markings || undefined,
        lat: loc.lat,
        lng: loc.lng,
      });
      navigation.replace('AnimalProfile', { animalId: animal.id });
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Tür</Text>
      <View style={styles.speciesRow}>
        <View style={styles.speciesButton}>
          <Button
            title="Kedi"
            onPress={() => setSpecies('cat')}
            color={species === 'cat' ? '#2e7d32' : undefined}
          />
        </View>
        <View style={styles.speciesButton}>
          <Button
            title="Köpek"
            onPress={() => setSpecies('dog')}
            color={species === 'dog' ? '#2e7d32' : undefined}
          />
        </View>
      </View>

      <Text style={styles.label}>İsim (opsiyonel)</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Örn. Pamuk" />

      <Text style={styles.label}>Renk</Text>
      <TextInput style={styles.input} value={color} onChangeText={setColor} placeholder="Örn. Sarı-beyaz" />

      <Text style={styles.label}>Boy</Text>
      <TextInput style={styles.input} value={size} onChangeText={setSize} placeholder="Örn. small/medium/large" />

      <Text style={styles.label}>İşaretler / Notlar</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={markings}
        onChangeText={setMarkings}
        placeholder="Örn. Sol kulakta çentik"
        multiline
      />

      <Text style={styles.locationNote}>Konumunuz otomatik olarak kaydedilecek.</Text>

      <Button
        title={submitting ? 'Kaydediliyor...' : 'Hayvanı Kaydet'}
        onPress={handleSubmit}
        disabled={submitting}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  speciesRow: { flexDirection: 'row', gap: 12 },
  speciesButton: { flex: 1 },
  locationNote: { color: '#888', marginTop: 16, marginBottom: 16, textAlign: 'center' },
});
