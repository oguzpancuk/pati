import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { addAnimalPhoto, Animal, createAnimal, fetchAnimals, reportSighting } from '../api/animals';
import type { PhotoAsset } from '../api/care';
import AnimalAvatar from '../components/AnimalAvatar';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import { Coordinates, getCurrentLocation } from '../location';
import { Banner, Button, Card, Chip, Input, LoadingState, Screen, Text } from '../components/ui';
import { Icon } from '../components/brand';
import { makeStyles, radius, spacing, useTheme } from '../theme';

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
  const styles = useStyles();
  const { colors } = useTheme();
  const { celebrate } = useBadgeAwards();
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
      Alert.alert(
        'Güncellenemedi',
        err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
      );
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
      Alert.alert('Fotoğraf gerekli', `En az ${MIN_PHOTOS} fotoğraf eklemelisin.`);
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
      celebrate(animal);
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'checking') {
    return (
      <Screen>
        <LoadingState label="Yakındaki kayıtlı hayvanlar kontrol ediliyor…" />
      </Screen>
    );
  }

  if (step === 'duplicate-check') {
    return (
      <Screen scroll>
        <Banner
          tone="warning"
          emoji="🔎"
          title="Bu hayvan zaten kayıtlı olabilir"
          description="Eklemek istediğin hayvan aşağıdakilerden biriyse seç — konumu güncellenir ve bakım listene eklenir."
          style={styles.duplicateBanner}
        />

        {nearby.map((animal) => (
          <Card
            key={animal.id}
            variant="flat"
            padding="md"
            style={styles.nearbyRow}
            onPress={() => handleExistingAnimal(animal)}
          >
            <AnimalAvatar species={animal.species} photoUrl={animal.cover_photo_url} size={52} />
            <View style={styles.nearbyText}>
              <Text variant="subheading" numberOfLines={1}>
                {animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {animal.breed ?? 'Cinsi belirtilmemiş'}
                {animal.distance_meters !== undefined
                  ? ` · ${Math.round(animal.distance_meters)} m uzakta`
                  : ''}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textSubtle} />
          </Card>
        ))}

        <Button
          title="Hiçbiri — yeni hayvan kaydet"
          variant="secondary"
          onPress={() => setStep('form')}
          disabled={submitting}
          fullWidth
          style={styles.newAnimalButton}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="label" style={styles.label}>
        TÜR
      </Text>
      <View style={styles.chipRow}>
        <Chip
          label="Kedi"
          selected={species === 'cat'}
          onPress={() => handleSpeciesChange('cat')}
          style={styles.speciesChip}
        />
        <Chip
          label="Köpek"
          selected={species === 'dog'}
          onPress={() => handleSpeciesChange('dog')}
          style={styles.speciesChip}
        />
      </View>

      <Text variant="label" style={styles.label}>
        CİNS / DESEN
      </Text>
      <View style={styles.chipRow}>
        {BREED_OPTIONS[species].map((option) => (
          <Chip
            key={option}
            label={option}
            selected={breed === option}
            onPress={() => setBreed(option)}
          />
        ))}
      </View>

      <Input
        label="İSİM (İSTEĞE BAĞLI)"
        value={name}
        onChangeText={setName}
        placeholder="Örn. Pamuk"
        containerStyle={styles.field}
      />
      <Input
        label="RENK"
        value={color}
        onChangeText={setColor}
        placeholder="Örn. Sarı-beyaz"
        containerStyle={styles.field}
      />
      <Input
        label="İŞARETLER / NOTLAR"
        value={markings}
        onChangeText={setMarkings}
        placeholder="Örn. Sol kulakta çentik"
        multiline
        containerStyle={styles.field}
      />

      <Text variant="label" style={styles.label}>
        FOTOĞRAFLAR (EN AZ {MIN_PHOTOS})
      </Text>
      <View style={styles.photoRow}>
        {photos.map((photo, index) => (
          <View key={photo.uri} style={styles.thumbnailWrapper}>
            <Image source={{ uri: photo.uri }} style={styles.thumbnail} />
            <Pressable
              style={styles.removeButton}
              onPress={() => removePhoto(index)}
              accessibilityLabel="Fotoğrafı kaldır"
            >
              <Icon name="close" size={12} color={colors.textOnBrand} strokeWidth={2.6} />
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <Pressable style={styles.addPhoto} onPress={handleAddPhotos}>
            <Icon name="camera" size={22} color={colors.brand} />
            <Text variant="micro" color="brand" style={styles.addPhotoText}>
              EKLE
            </Text>
          </Pressable>
        )}
      </View>

      <Text variant="caption" center style={styles.locationNote}>
        Konumun otomatik olarak kaydedilecek.
      </Text>

      <Button
        title="Hayvanı kaydet"
        onPress={handleSubmit}
        loading={submitting}
        fullWidth
        size="lg"
      />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  duplicateBanner: { marginBottom: spacing.lg },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  nearbyText: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  newAnimalButton: { marginTop: spacing.xl },
  label: { marginBottom: spacing.sm },
  field: { marginBottom: spacing.lg },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  speciesChip: { flex: 1, justifyContent: 'center' },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  thumbnailWrapper: { position: 'relative' },
  thumbnail: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: c.skeleton,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: c.danger,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: c.background,
  },
  addPhoto: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.brand,
    backgroundColor: c.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: { marginTop: 2 },
  locationNote: { marginBottom: spacing.lg },
}));
