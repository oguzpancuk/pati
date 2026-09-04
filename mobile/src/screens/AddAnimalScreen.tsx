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
import {
  alertLocationPermission,
  Coordinates,
  getCurrentLocation,
  LocationPermissionError,
} from '../location';
import {
  Banner,
  Button,
  Card,
  Chip,
  ChoiceField,
  Input,
  MULTI_CHOICE_SEPARATOR,
  MultiChoiceField,
  Screen,
  Text,
} from '../components/ui';
import { Icon } from '../components/brand';
import {
  colorsFor,
  fixedColorFor,
  isPresetChoice,
  OTHER,
  patternsFor,
  type Species,
} from '../taxonomy';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 6;

/**
 * Minimum time the "matching" screen stays visible. The server currently
 * only checks species/pattern/color/distance and returns instantly; the wait
 * makes the user feel a comparison happened. When photo-based AI matching
 * arrives, real processing time replaces this and the constant goes away
 * (see docs/NOTES.md).
 */
// The matching screen stays up for the real comparison (ADR-0005), which
// takes seconds; this floor only keeps the field-only answer — instant when
// the model is off — from flashing past as a glitch.
const MIN_MATCHING_MS = 800;

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
  photo_same: 'Fotoğrafta aynı hayvan',
  photo_similar: 'Fotoğraf benziyor',
  breed: 'Aynı desen',
  color: 'Aynı renk',
  distance: 'Aynı sokakta',
};

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m uzakta`;
  return `${(meters / 1000).toFixed(1)} km uzakta`;
}

type Step = 'form' | 'matching' | 'results';

export default function AddAnimalScreen({ navigation, route }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { celebrate } = useBadgeAwards();
  // No species preselected: the pattern and color pickers are species-bound
  // and stay hidden until this choice is made (sprint item 3 decision).
  const [species, setSpecies] = useState<Species | null>(null);
  const [name, setName] = useState('');
  // Animals are often multi-colored; the picks flatten into the single
  // `color` column joined with MULTI_CHOICE_SEPARATOR (backend takes free
  // text up to 120 chars, so no schema change).
  const [colorChoices, setColorChoices] = useState<string[]>([]);
  const [breed, setBreed] = useState<string | null>(null);
  const [markings, setMarkings] = useState('');
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  // Whether the model compared the photo — the results banner says which
  // comparison the tiers came from.
  const [photoChecked, setPhotoChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Flow: form → (save) → matching wait → candidates → new record or an
  // existing profile. Duplicate checking used to run before the form opened,
  // but then there was nothing to compare — only distance was checked.
  const [step, setStep] = useState<Step>('form');
  const [candidates, setCandidates] = useState<AnimalMatch[]>([]);
  const [matchRadius, setMatchRadius] = useState(1000);
  const [location, setLocation] = useState<Coordinates | null>(null);

  // The DB column value: a fixed-color pattern auto-stores its canonical
  // color (no picker was shown); otherwise preset picks and/or the "Diğer"
  // text, joined.
  const fixedColor = species ? fixedColorFor(species, breed) : null;
  const color =
    fixedColor ?? (colorChoices.length > 0 ? colorChoices.join(MULTI_CHOICE_SEPARATOR) : null);

  function handleSpeciesChange(next: Species) {
    setSpecies(next);
    // Pattern and color lists change per species; a cat pick makes no sense
    // for a dog, so it resets.
    setBreed(null);
    setColorChoices([]);
  }

  /**
   * A pattern switch changes which three colors are on offer, so the picks
   * reset with it — otherwise colors chosen under the previous pattern
   * survive invisibly and get submitted (review finding on 205b9b0). The
   * reset keys on the preset-pattern identity, not the raw text: free
   * "Diğer" typing changes the value per keystroke and must not wipe picks.
   */
  function handleBreedChange(next: string | null) {
    if (species) {
      const prevKey = breed && isPresetChoice(breed, patternsFor(species)) ? breed : OTHER;
      const nextKey = next && isPresetChoice(next, patternsFor(species)) ? next : OTHER;
      if (prevKey !== nextKey) setColorChoices([]);
    }
    setBreed(next);
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

  /** Form submitted: match first, decide after. */
  async function handleSubmit() {
    if (!species) {
      Alert.alert('Tür gerekli', 'Önce kedi mi köpek mi olduğunu seçmelisin.');
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      Alert.alert('Fotoğraf gerekli', `En az ${MIN_PHOTOS} fotoğraf eklemelisin.`);
      return;
    }

    setStep('matching');
    const startedAt = Date.now();
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
      const result = await matchAnimals({
        lat: loc.lat,
        lng: loc.lng,
        species,
        breed,
        color,
        photo: photos[0],
      });

      // Show the waiting screen for at least MIN_MATCHING_MS; if the server
      // returned faster, hold for the remainder.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_MATCHING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_MATCHING_MS - elapsed));
      }

      setCandidates(result.candidates);
      setMatchRadius(result.radiusMeters);
      setPhotoChecked(result.photoChecked);
      if (result.candidates.length === 0) {
        // No same-species records nearby: nothing to ask, save directly.
        await createNewAnimal(loc);
      } else {
        setStep('results');
      }
    } catch (err: any) {
      // Location or server error: instead of blocking the user we return
      // them to the form to retry.
      if (err instanceof LocationPermissionError) {
        alertLocationPermission();
      } else {
        Alert.alert(
          'Eşleştirme yapılamadı',
          err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
        );
      }
      setStep('form');
    }
  }

  async function createNewAnimal(loc: Coordinates) {
    if (!species) return; // unreachable: handleSubmit gates on species
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

  // Tapping a candidate opens the profile in "review" mode: let the user
  // study the photos and health records and decide. The decision comes from
  // the profile's bottom bar — "that's the one" drops us back here with the
  // confirmedAnimalId param.
  function handleReviewCandidate(animal: AnimalMatch) {
    navigation.navigate('AnimalProfile', { animalId: animal.id, matchReview: true });
  }

  const confirmedAnimalId: number | undefined = route.params?.confirmedAnimalId;
  useEffect(() => {
    if (confirmedAnimalId) {
      navigation.setParams({ confirmedAnimalId: undefined });
      handleExistingAnimal(confirmedAnimalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedAnimalId]);

  async function handleExistingAnimal(animalId: number) {
    if (!location) {
      navigation.replace('AnimalProfile', { animalId });
      return;
    }
    setSubmitting(true);
    try {
      await reportSighting(animalId, location.lat, location.lng);
      navigation.replace('AnimalProfile', { animalId });
    } catch (err: any) {
      Alert.alert(
        'Güncellenemedi',
        err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'matching' && species) {
    return (
      <Screen>
        <MatchingState species={species} breed={breed} />
      </Screen>
    );
  }

  if (step === 'results' && species) {
    return (
      <Screen scroll>
        <Banner
          tone="info"
          emoji="🔎"
          title="Benzer kayıtlar bulundu"
          description={`${photoChecked ? 'Fotoğrafın ve girdiğin bilgiler' : 'Girdiğin bilgiler'} ${
            matchRadius >= 1000 ? `${matchRadius / 1000} km` : `${matchRadius} m`
          } içindeki ${
            species === 'cat' ? 'kedilerle' : 'köpeklerle'
          } karşılaştırıldı. Birine dokunup profiline bak; oysa "bu o" de — konumu güncellenir ve bakım listene eklenir.`}
          style={styles.resultsBanner}
        />

        {candidates.map((animal) => (
          <Card
            key={animal.id}
            variant="flat"
            padding="md"
            style={styles.candidateRow}
            onPress={() => handleReviewCandidate(animal)}
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
              {/* Two lines: the photo reasons ("Fotoğrafta aynı hayvan") pushed
                  the distance off the end of one. */}
              <Text variant="micro" color="brand" numberOfLines={2} style={styles.candidateReasons}>
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
      {/* The animal's "face" appears here instantly from the chosen
          species/pattern: the user sees what they're registering and knows
          in advance how it will look in lists/on the map. */}
      <View style={styles.previewWrap}>
        {species ? (
          <AnimalAvatar species={species} breed={breed} size={96} />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Icon name="paw" size={40} color={colors.textSubtle} />
          </View>
        )}
        <Text variant="caption" center style={styles.previewCaption}>
          {species
            ? 'Profil resmi tür ve desene göre otomatik oluşur'
            : 'Önce tür seç; profil resmi tür ve desene göre oluşur'}
        </Text>
      </View>

      <Text variant="micro" style={styles.label}>
        tür
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

      {/* The pickers cascade (owner decision, sprint item 3 revision):
          species opens the pattern list, and the COLOR list opens only once
          a pattern is chosen — ordered by that pattern's most common street
          colors. The `key` remounts them so internal "Diğer" state resets;
          for the color field it keys on the preset pattern only, because
          free "Diğer" text changes on every keystroke and would remount
          (and wipe) the color picks mid-typing. */}
      {species && (
        <>
          {/* We don't say "breed": street cats belong to no breed, names like
              tekir/sarman describe coat patterns; dogs are mixed too (see
              taxonomy.ts). */}
          <ChoiceField
            key={`desen-${species}`}
            label="tür / desen"
            options={patternsFor(species)}
            value={breed}
            onChange={handleBreedChange}
            otherPlaceholder={
              species === 'cat' ? 'Örn. Ankara kedisi kırması' : 'Örn. Golden kırması'
            }
          />

          {/* Fixed-color patterns (sarman, siyah, calico, smokin, akbaş)
              show no color picker at all — the canonical color is stored
              silently (owner decision). */}
          {breed && !fixedColor && (
            <MultiChoiceField
              key={`renk-${species}-${isPresetChoice(breed, patternsFor(species)) ? breed : OTHER}`}
              label="renk (birden fazla seçebilirsin)"
              options={colorsFor(species, breed)}
              value={colorChoices}
              onChange={setColorChoices}
              otherPlaceholder="Örn. Gri-beyaz alacalı"
            />
          )}
        </>
      )}

      <Input
        label="isim (isteğe bağlı)"
        value={name}
        onChangeText={setName}
        placeholder="Örn. Pamuk"
        containerStyle={styles.field}
      />
      <Input
        label="işaretler / notlar"
        value={markings}
        onChangeText={setMarkings}
        placeholder="Örn. Sol kulakta çentik"
        multiline
        containerStyle={styles.field}
      />

      <Text variant="micro" style={styles.label}>
        fotoğraflar (en az {MIN_PHOTOS})
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
 * The "matching" waiting screen: the chosen avatar breathes in and out with
 * a scanning ring spinning below. The wait is short (2 s), but an empty
 * spinner felt "stuck"; the text says what is happening.
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
        Fotoğrafın ve girdiğin bilgiler yakındaki kayıtlarla karşılaştırılıyor. Aynı hayvanın iki
        kez kaydedilmesini önlemek için birkaç saniye sürebilir.
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  previewWrap: { alignItems: 'center', marginBottom: spacing.xl },
  // Same footprint as the 96px avatar so choosing a species doesn't shift
  // the form below it.
  previewPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  // The scanning ring: a rotating dashed border reads as "scanning".
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
