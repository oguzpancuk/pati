import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  addAnimalPhoto,
  Animal,
  createAnimal,
  fetchAnimals,
  reportSighting,
} from '../api/animals';
import type { PhotoAsset } from '../api/care';
import AnimalAvatar from '../components/AnimalAvatar';
import { Coordinates, getCurrentLocation } from '../location';

type Species = 'cat' | 'dog';

// Aynı hayvanın ikinci kez kaydedilmesini önlemek için form açılmadan önce
// yakındaki kayıtlı hayvanlar gösterilir. Yapay zekâ ile fotoğraf eşleştirme
// yerine kullanıcı seçimine dayanıyor (bkz. PRD 4.3, sonraki faz).
const DUPLICATE_CHECK_RADIUS_METERS = 500;

const BREED_OPTIONS: Record<Species, string[]> = {
  cat: [
    'Tekir',
    'Sarman',
    'Siyah',
    'Beyaz',
    'Van Kedisi',
    'Ankara Kedisi',
    'Halı (Calico)',
    'Sokak Melezi',
    'Diğer',
  ],
  dog: [
    'Kangal',
    'Akbaş',
    'Çoban Köpeği',
    'Terrier Tipi',
    'Av Köpeği Tipi',
    'Golden/Labrador Tipi',
    'Sokak Melezi',
    'Diğer',
  ],
};

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 6;

export default function AddAnimalScreen({ navigation }: any) {
  const [species, setSpecies] = useState<Species>('cat');
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [breed, setBreed] = useState<string | null>(null);
  const [markings, setMarkings] = useState('');
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<'checking' | 'duplicate-check' | 'form'>('checking');
  const [nearby, setNearby] = useState<Animal[]>([]);
  const [location, setLocation] = useState<Coordinates | null>(null);

  const loadNearby = useCallback(async () => {
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
      const found = await fetchAnimals(loc.lat, loc.lng, DUPLICATE_CHECK_RADIUS_METERS);
      setNearby(found);
      setStep(found.length > 0 ? 'duplicate-check' : 'form');
    } catch (err: any) {
      // Konum alınamazsa mükerrer kontrolü yapamayız; kullanıcıyı engellemek
      // yerine doğrudan forma geçiriyoruz.
      Alert.alert('Konum alınamadı', err?.message ?? 'Yakındaki hayvanlar kontrol edilemedi');
      setStep('form');
    }
  }, []);

  useEffect(() => {
    loadNearby();
  }, [loadNearby]);

  async function handleExistingAnimal(animal: Animal) {
    if (!location) {
      navigation.replace('AnimalProfile', { animalId: animal.id });
      return;
    }
    setSubmitting(true);
    try {
      await reportSighting(animal.id, location.lat, location.lng);
      navigation.replace('AnimalProfile', { animalId: animal.id });
    } catch (err: any) {
      Alert.alert('Güncellenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSpeciesChange(next: Species) {
    setSpecies(next);
    setBreed(null);
  }

  async function handleAddPhotos() {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (result.didCancel || !result.assets) return;
    const picked = result.assets
      .filter((a) => a.uri)
      .map((a) => ({ uri: a.uri!, type: a.type, fileName: a.fileName }));
    setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (photos.length < MIN_PHOTOS) {
      Alert.alert('Fotoğraf gerekli', `En az ${MIN_PHOTOS} fotoğraf eklemelisiniz.`);
      return;
    }

    setSubmitting(true);
    try {
      const loc = await getCurrentLocation();
      const animal = await createAnimal({
        species,
        name: name || undefined,
        color: color || undefined,
        breed: breed || undefined,
        markings: markings || undefined,
        lat: loc.lat,
        lng: loc.lng,
      });

      await Promise.all(photos.map((photo) => addAnimalPhoto(animal.id, photo)));

      navigation.replace('AnimalProfile', { animalId: animal.id });
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.checkingText}>Yakındaki kayıtlı hayvanlar kontrol ediliyor...</Text>
      </View>
    );
  }

  if (step === 'duplicate-check') {
    return (
      <ScrollView style={styles.container}>
        <Text style={styles.duplicateTitle}>Bu hayvan zaten kayıtlı olabilir</Text>
        <Text style={styles.duplicateSubtitle}>
          Yakınınızda kayıtlı hayvanlar var. Eklemek istediğiniz hayvan bunlardan biriyse
          seçin — konumu güncellenecek ve bakım listenize eklenecek.
        </Text>

        {nearby.map((animal) => (
          <TouchableOpacity
            key={animal.id}
            style={styles.nearbyRow}
            onPress={() => handleExistingAnimal(animal)}
            disabled={submitting}
          >
            <AnimalAvatar species={animal.species} photoUrl={animal.cover_photo_url} size={52} />
            <View style={styles.nearbyText}>
              <Text style={styles.nearbyName}>
                {animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}
              </Text>
              <Text style={styles.nearbyMeta}>
                {animal.breed ?? '-'}
                {animal.distance_meters !== undefined
                  ? ` · ${Math.round(animal.distance_meters)} m uzakta`
                  : ''}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.newAnimalButton}>
          <Button
            title="Hiçbiri — Yeni Hayvan Kaydet"
            onPress={() => setStep('form')}
            disabled={submitting}
          />
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Tür</Text>
      <View style={styles.chipRow}>
        <View style={styles.speciesButton}>
          <Button
            title="Kedi"
            onPress={() => handleSpeciesChange('cat')}
            color={species === 'cat' ? '#2e7d32' : undefined}
          />
        </View>
        <View style={styles.speciesButton}>
          <Button
            title="Köpek"
            onPress={() => handleSpeciesChange('dog')}
            color={species === 'dog' ? '#2e7d32' : undefined}
          />
        </View>
      </View>

      <Text style={styles.label}>Cins / Desen</Text>
      <View style={styles.chipRow}>
        {BREED_OPTIONS[species].map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.chip, breed === option && styles.chipSelected]}
            onPress={() => setBreed(option)}
          >
            <Text style={[styles.chipText, breed === option && styles.chipTextSelected]}>
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>İsim (opsiyonel)</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Örn. Pamuk" />

      <Text style={styles.label}>Renk</Text>
      <TextInput style={styles.input} value={color} onChangeText={setColor} placeholder="Örn. Sarı-beyaz" />

      <Text style={styles.label}>İşaretler / Notlar</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={markings}
        onChangeText={setMarkings}
        placeholder="Örn. Sol kulakta çentik"
        multiline
      />

      <Text style={styles.label}>Fotoğraflar (en az {MIN_PHOTOS})</Text>
      <View style={styles.chipRow}>
        {photos.map((photo, index) => (
          <View key={photo.uri} style={styles.thumbnailWrapper}>
            <Image source={{ uri: photo.uri }} style={styles.thumbnail} />
            <TouchableOpacity style={styles.removeButton} onPress={() => removePhoto(index)}>
              <Text style={styles.removeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      {photos.length < MAX_PHOTOS && (
        <Button title="Fotoğraf Ekle" onPress={handleAddPhotos} />
      )}

      <Text style={styles.locationNote}>Konumunuz otomatik olarak kaydedilecek.</Text>

      <Button
        title={submitting ? 'Kaydediliyor...' : 'Hayvanı Kaydet'}
        onPress={handleSubmit}
        disabled={submitting}
      />
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  checkingText: { color: '#666', marginTop: 12, textAlign: 'center' },
  duplicateTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  duplicateSubtitle: { color: '#666', marginBottom: 16 },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  nearbyText: { flex: 1, marginLeft: 12 },
  nearbyName: { fontSize: 16, fontWeight: '600' },
  nearbyMeta: { color: '#555', marginTop: 2 },
  newAnimalButton: { marginTop: 24 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  speciesButton: { flex: 1 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  chipText: { color: '#333' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  thumbnailWrapper: { position: 'relative' },
  thumbnail: { width: 72, height: 72, borderRadius: 8 },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#c62828',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: { color: '#fff', fontWeight: '700', lineHeight: 18 },
  locationNote: { color: '#888', marginTop: 16, marginBottom: 16, textAlign: 'center' },
  bottomSpacer: { height: 40 },
});
