import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Pressable, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  addAnimalPhoto,
  AnimalMatch,
  createAnimal,
  matchAnimals,
  reportSighting,
  SimilarityLevel,
  SimilarityReason,
} from '../api/animals';
import type { PhotoAsset } from '../api/care';
import AnimalAvatar from '../components/AnimalAvatar';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import { Coordinates, getCurrentLocation } from '../location';
import { Banner, Button, Card, Chip, ChoiceField, Input, Screen, Text } from '../components/ui';
import { Icon } from '../components/brand';
import { colorsFor, patternsFor, type Species } from '../taxonomy';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 6;

/**
 * "Eşleştiriliyor" ekranının en az ne kadar görüneceği. Şu an sunucu yalnızca
 * tür/desen/renk/mesafeye bakıyor ve anında dönüyor; bekleme, kullanıcıya bir
 * karşılaştırma yapıldığını hissettirmek için. Fotoğraf tabanlı yapay zekâ
 * eşleştirme geldiğinde gerçek işlem süresi bunun yerini alacak ve bu sabit
 * kaldırılacak (bkz. docs/NOTLAR.md).
 */
const MIN_MATCHING_MS = 2000;

const SIMILARITY_LABEL: Record<SimilarityLevel, string> = {
  high: 'Yüksek benzerlik',
  medium: 'Orta benzerlik',
  low: 'Düşük benzerlik',
};
const SIMILARITY_TONE: Record<SimilarityLevel, 'success' | 'warning' | 'neutral'> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
};
const REASON_LABEL: Record<SimilarityReason, string> = {
  breed: 'Aynı desen',
  color: 'Aynı renk',
  distance: 'Aynı sokakta',
};

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m uzakta`;
  return `${(meters / 1000).toFixed(1)} km uzakta`;
}

type Step = 'form' | 'matching' | 'results';

export default function AddAnimalScreen({ navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { celebrate } = useBadgeAwards();
  const [species, setSpecies] = useState<Species>('cat');
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [breed, setBreed] = useState<string | null>(null);
  const [markings, setMarkings] = useState('');
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Akış: form → (kaydet) → eşleştirme beklemesi → adaylar → yeni kayıt ya da
  // mevcut profil. Eskiden mükerrer kontrolü form açılmadan yapılıyordu; ama
  // o zaman elimizde karşılaştıracak bilgi yoktu, yalnızca mesafeye bakılıyordu.
  const [step, setStep] = useState<Step>('form');
  const [candidates, setCandidates] = useState<AnimalMatch[]>([]);
  const [matchRadius, setMatchRadius] = useState(1000);
  const [location, setLocation] = useState<Coordinates | null>(null);

  function handleSpeciesChange(next: Species) {
    setSpecies(next);
    // Desen ve renk listeleri türe göre değişiyor; kediye ait bir seçim köpekte
    // anlamsız kalacağı için sıfırlanıyor.
    setBreed(null);
    setColor(null);
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

  /** Form gönderildi: önce eşleştir, sonra karar ver. */
  async function handleSubmit() {
    if (photos.length < MIN_PHOTOS) {
      Alert.alert('Fotoğraf gerekli', `En az ${MIN_PHOTOS} fotoğraf eklemelisin.`);
      return;
    }

    setStep('matching');
    const startedAt = Date.now();
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
      const result = await matchAnimals({ lat: loc.lat, lng: loc.lng, species, breed, color });

      // Bekleme ekranı en az MIN_MATCHING_MS görünsün; sunucu ondan hızlı
      // döndüyse kalan süre kadar tutuluyor.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_MATCHING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_MATCHING_MS - elapsed));
      }

      setCandidates(result.candidates);
      setMatchRadius(result.radiusMeters);
      if (result.candidates.length === 0) {
        // Yakında aynı türden hiç kayıt yok: soracak bir şey yok, doğrudan kaydet.
        await createNewAnimal(loc);
      } else {
        setStep('results');
      }
    } catch (err: any) {
      // Konum ya da sunucu hatası: kullanıcıyı engellemek yerine forma geri
      // döndürüyoruz, tekrar deneyebilir.
      Alert.alert(
        'Eşleştirme yapılamadı',
        err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
      );
      setStep('form');
    }
  }

  async function createNewAnimal(loc: Coordinates) {
    setSubmitting(true);
    try {
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
      setStep(candidates.length > 0 ? 'results' : 'form');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExistingAnimal(animal: AnimalMatch) {
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

  if (step === 'matching') {
    return (
      <Screen>
        <MatchingState species={species} breed={breed} />
      </Screen>
    );
  }

  if (step === 'results') {
    return (
      <Screen scroll>
        <Banner
          tone="info"
          emoji="🔎"
          title="Benzer kayıtlar bulundu"
          description={`Girdiğin bilgiler ${
            matchRadius >= 1000 ? `${matchRadius / 1000} km` : `${matchRadius} m`
          } içindeki ${
            species === 'cat' ? 'kedilerle' : 'köpeklerle'
          } karşılaştırıldı. Eklemek istediğin hayvan bunlardan biriyse seç — konumu güncellenir ve bakım listene eklenir.`}
          style={styles.resultsBanner}
        />

        {candidates.map((animal) => (
          <Card
            key={animal.id}
            variant="flat"
            padding="md"
            style={styles.candidateRow}
            onPress={() => handleExistingAnimal(animal)}
          >
            <AnimalAvatar species={animal.species} breed={animal.breed} size={52} />
            <View style={styles.candidateText}>
              <View style={styles.candidateHead}>
                <Text variant="subheading" numberOfLines={1} style={styles.candidateName}>
                  {animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}
                </Text>
                <Chip
                  label={SIMILARITY_LABEL[animal.similarity]}
                  tone={SIMILARITY_TONE[animal.similarity]}
                />
              </View>
              <Text variant="caption" numberOfLines={1}>
                {[animal.breed, animal.color].filter(Boolean).join(' · ') || 'Desen belirtilmemiş'}
              </Text>
              <Text variant="micro" color="brand" numberOfLines={1} style={styles.candidateReasons}>
                {[
                  ...animal.similarity_reasons.map((r) => REASON_LABEL[r]),
                  formatDistance(animal.distance_meters),
                ].join(' · ')}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textSubtle} />
          </Card>
        ))}

        <Button
          title="Hiçbiri — yeni hayvan kaydet"
          onPress={() => location && createNewAnimal(location)}
          loading={submitting}
          fullWidth
          size="lg"
          style={styles.newAnimalButton}
        />
        <Button
          title="Forma dön"
          variant="ghost"
          onPress={() => setStep('form')}
          disabled={submitting}
          fullWidth
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {/* Seçilen tür/desene göre hayvanın "yüzü" anında burada beliriyor:
          kullanıcı ne kaydettiğini görsün, listede/haritada nasıl
          görüneceğini önceden bilsin. */}
      <View style={styles.previewWrap}>
        <AnimalAvatar species={species} breed={breed} size={96} />
        <Text variant="caption" center style={styles.previewCaption}>
          Profil resmi tür ve desene göre otomatik oluşur
        </Text>
      </View>

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

      {/* "Cins" demiyoruz: sokak kedileri bir ırka ait değil, tekir/sarman gibi
          adlar post desenini anlatıyor; köpekler de melez (bkz. taxonomy.ts). */}
      <ChoiceField
        label="TÜR / DESEN"
        options={patternsFor(species)}
        value={breed}
        onChange={setBreed}
        otherPlaceholder={species === 'cat' ? 'Örn. Ankara kedisi kırması' : 'Örn. Golden kırması'}
      />

      <ChoiceField
        label="RENK"
        options={colorsFor(species)}
        value={color}
        onChange={setColor}
        otherPlaceholder="Örn. Gri-beyaz alacalı"
      />

      <Input
        label="İSİM (İSTEĞE BAĞLI)"
        value={name}
        onChangeText={setName}
        placeholder="Örn. Pamuk"
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
        Konumun otomatik olarak kaydedilecek. Kaydetmeden önce yakındaki kayıtlarla
        karşılaştırılacak.
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

/**
 * "Eşleştiriliyor" bekleme ekranı: seçilen avatar nefes alır gibi büyüyüp
 * küçülüyor, altında tarama halkası dönüyor. Süre kısa (2 sn) ama boş bir
 * spinner "takıldı" hissi veriyordu; ne yapıldığı yazıyla söyleniyor.
 */
function MatchingState({ species, breed }: { species: Species; breed: string | null }) {
  const styles = useStyles();
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(spin, {
          toValue: 1,
          duration: 1400,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, spin]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.matchingWrap}>
      <View style={styles.matchingStage}>
        <Animated.View style={[styles.matchingRing, { transform: [{ rotate }] }]} />
        <Animated.View style={{ transform: [{ scale }] }}>
          <AnimalAvatar species={species} breed={breed} size={96} />
        </Animated.View>
      </View>
      <Text variant="heading" center style={styles.matchingTitle}>
        Yapay zekâ eşleştiriyor…
      </Text>
      <Text variant="caption" center style={styles.matchingDesc}>
        Girdiğin bilgiler sistemdeki hayvanlarla karşılaştırılıyor. Aynı hayvanın iki kez
        kaydedilmesini önlemek için yakındaki kayıtlar taranıyor.
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  previewWrap: { alignItems: 'center', marginBottom: spacing.xl },
  previewCaption: { marginTop: spacing.sm },
  resultsBanner: { marginBottom: spacing.lg },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  candidateText: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  candidateHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  candidateName: { flex: 1, marginRight: spacing.sm },
  candidateReasons: { marginTop: 2 },
  newAnimalButton: { marginTop: spacing.xl, marginBottom: spacing.sm },
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
  matchingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  matchingStage: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  // Tarama halkası: kesik kenarlık dönünce "tarıyor" hissi veriyor.
  matchingRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: c.brand,
    borderStyle: 'dashed',
  },
  matchingTitle: { marginBottom: spacing.sm },
  matchingDesc: { maxWidth: 320 },
}));
