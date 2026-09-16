import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Pressable, View } from 'react-native';
import { capturePhoto, SaveToGalleryRow } from '../photoCapture';
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
  ensureLocationPermission,
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
  LoadingState,
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

// One photo, taken with the camera on this screen (owner batch 2026-09-14,
// C1): the animal is in front of the user, so there is no library door. Up
// to six still fit — only the first is compared, the rest help the gallery.
const MIN_PHOTOS = 1;
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

/**
 * The token from the match step first — the file is already up and
 * screened; a missing or expired one falls back to the file itself, which
 * the server screens inline.
 */
async function uploadAnimalPhoto(animalId: number, photo: PhotoAsset, token?: string) {
  if (token) {
    try {
      return await addAnimalPhoto(animalId, { photoToken: token });
    } catch (err: any) {
      if (err?.response?.data?.code !== 'photoTokenInvalid') throw err;
    }
  }
  return addAnimalPhoto(animalId, photo);
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
  // The match step screens every photo and hands back one token per photo
  // (same order); the create step redeems them so the photos travel once.
  // Any change to the list invalidates them — the order is the pairing.
  const [photoTokens, setPhotoTokens] = useState<string[]>([]);
  // The model's reason for refusing a photo, shown under the strip until
  // the list changes (the refused photo itself is taken out).
  const [photoIssue, setPhotoIssue] = useState<string | null>(null);
  // Whether the model compared the photo — the results banner says which
  // comparison the tiers came from.
  const [photoChecked, setPhotoChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // A "Bu o" confirm in flight (sighting, then every photo's upload — seconds
  // on a real model). The ref is the guard: a second confirm would report a
  // second sighting (a second notification to the followers) and redeem the
  // same tokens again (409, a false "Fotoğraflar eklenemedi"). The state
  // swaps the results for a busy screen, so no candidate stays tappable.
  const confirmingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);

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

  /** A taken photo joins the strip; any change invalidates the tokens. */
  function addPhotos(taken: PhotoAsset[]) {
    setPhotos((prev) => [...prev, ...taken].slice(0, MAX_PHOTOS));
    setPhotoTokens([]);
    setPhotoIssue(null);
  }

  async function handleTakePhoto() {
    const result = await capturePhoto();
    if (result.status === 'cancelled') return;
    if (result.status === 'error') {
      Alert.alert('Fotoğraf alınamadı', result.message);
      return;
    }
    addPhotos(result.photos);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoTokens([]);
    setPhotoIssue(null);
  }

  /** Form submitted: match first, decide after. */
  async function handleSubmit() {
    if (!species) {
      Alert.alert('Tür gerekli', 'Önce kedi mi köpek mi olduğunu seçmelisin.');
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      Alert.alert('Fotoğraf gerekli', 'En az bir fotoğraf çekmelisin.');
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
        photos,
      });

      // Show the waiting screen for at least MIN_MATCHING_MS; if the server
      // returned faster, hold for the remainder.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_MATCHING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_MATCHING_MS - elapsed));
      }

      const tokens = result.photoTokens ?? [];
      setPhotoTokens(tokens);
      setCandidates(result.candidates);
      setMatchRadius(result.radiusMeters);
      setPhotoChecked(result.photoChecked);
      if (result.candidates.length === 0) {
        // No same-species records nearby: nothing to ask, save directly.
        await createNewAnimal(loc, tokens);
      } else {
        setStep('results');
      }
    } catch (err: any) {
      // Location or server error: instead of blocking the user we return
      // them to the form to retry.
      const data = err?.response?.data;
      if (err instanceof LocationPermissionError) {
        alertLocationPermission();
      } else if (data?.code === 'photoRejected' || data?.code === 'photoUnreadable') {
        // Two different reasons, one remedy. `photoRejected`: the model saw
        // no cat/dog in a photo (ADR-0005). `photoUnreadable`: the server
        // could not decode the file at all, so it refused the batch rather
        // than store something whose EXIF it cannot strip. Either way the
        // offending photo leaves the strip, the reason stays under it, and
        // the user takes another — there is no "add anyway".
        const refused = new Set<number>(
          Array.isArray(data.photoIndexes) && data.photoIndexes.length > 0
            ? data.photoIndexes
            : [Number.isInteger(data.photoIndex) ? data.photoIndex : 0]
        );
        const reason: string = data.error ?? 'Fotoğrafta seçtiğin tür görünmüyor.';
        setPhotos((prev) => prev.filter((_, i) => !refused.has(i)));
        setPhotoTokens([]);
        setPhotoIssue(reason);
        // Both remedies are a new shot — the camera is the only door (C1),
        // so there is no other format to pick. An unreadable file still must
        // not be told the animal was missing: the photo itself may be fine.
        const many = refused.size > 1;
        const removed = `${many ? 'Bu fotoğrafları' : 'Bu fotoğrafı'} listeden kaldırdık;`;
        const advice =
          data.code === 'photoUnreadable'
            ? `${removed} ${many ? 'yenilerini' : 'yenisini'} çek.`
            : `${removed} ${species === 'dog' ? 'köpeğin' : 'kedinin'} göründüğü ${
                many ? 'yeni fotoğraflar' : 'bir fotoğraf'
              } çek.`;
        Alert.alert(
          data.code === 'photoUnreadable'
            ? many
              ? 'Fotoğraflar okunamadı'
              : 'Fotoğraf okunamadı'
            : many
              ? 'Fotoğraflar uygun görünmüyor'
              : 'Fotoğraf uygun görünmüyor',
          `${reason} ${advice}`
        );
      } else {
        Alert.alert(
          'Eşleştirme yapılamadı',
          err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
        );
      }
      setStep('form');
    }
  }

  /**
   * `tokens` pairs with `photos` by index; handleSubmit passes the fresh
   * ones because the state has not settled yet, the results step uses the
   * state.
   */
  async function createNewAnimal(loc: Coordinates, tokens: string[] = photoTokens) {
    if (!species) return; // unreachable: handleSubmit gates on species
    setSubmitting(true);
    let animal: Awaited<ReturnType<typeof createAnimal>>;
    try {
      animal = await createAnimal({
        species,
        name: name || undefined,
        color: color || undefined,
        breed: breed || undefined,
        markings: markings || undefined,
        lat: loc.lat,
        lng: loc.lng,
      });
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
      setStep(candidates.length > 0 ? 'results' : 'form');
      setSubmitting(false);
      return;
    }

    // The record exists from here on: a photo that fails still lands the
    // user on the profile (with the reason), never back on a form whose
    // save would register the animal twice.
    await addFlowPhotos(animal.id, tokens);
    setSubmitting(false);
    navigation.replace('AnimalProfile', { animalId: animal.id });
    celebrate(animal);
  }

  /**
   * The flow's photos into a gallery the user holds carer rights on: the
   * animal just created, or the existing one "Bu o — eşleştir" confirmed.
   * Never throws — the record or the sighting already stands, so a photo
   * that fails only earns the alert on the way to the profile.
   */
  async function addFlowPhotos(animalId: number, tokens: string[]) {
    const failures: string[] = [];
    await Promise.all(
      photos.map((photo, i) =>
        uploadAnimalPhoto(animalId, photo, tokens[i]).catch((err: any) => {
          failures.push(err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
        })
      )
    );
    if (failures.length > 0) {
      Alert.alert(
        failures.length === photos.length
          ? 'Fotoğraflar eklenemedi'
          : 'Bazı fotoğraflar eklenemedi',
        `${failures[0]} Fotoğrafı daha sonra profilden ekleyebilirsin.`
      );
    }
  }

  // Tapping a candidate opens the profile in "review" mode: let the user
  // study the photos and health records and decide. The decision comes from
  // the profile's bottom bar — "that's the one" drops us back here with the
  // confirmedAnimalId param.
  function handleReviewCandidate(animal: AnimalMatch) {
    // The server decided whether this confirm may report a sighting
    // (matchHit); the review bar says so and the confirm follows it.
    navigation.navigate('AnimalProfile', {
      animalId: animal.id,
      matchReview: true,
      matchHit: animal.matchHit,
      photoChecked,
    });
  }

  // The entry buttons go through the gate, but `pati://add-animal` (a
  // live deep link, not dev-only) lands here directly — so the screen
  // checks again and leaves with the Settings alert instead of showing a
  // form that cannot be saved (web parity: the refusal card; review
  // finding). With the permission already granted this is an instant read.
  useEffect(() => {
    let alive = true;
    ensureLocationPermission().catch((err) => {
      if (alive && err instanceof LocationPermissionError) {
        alertLocationPermission();
        navigation.goBack();
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmedAnimalId: number | undefined = route.params?.confirmedAnimalId;
  // The profile's verdict on the confirm: report a sighting and add the
  // photos (the server's hit, or the viewer already a carer), or only open
  // the profile.
  const confirmedSighting: boolean = !!route.params?.confirmedSighting;
  useEffect(() => {
    if (confirmedAnimalId) {
      navigation.setParams({ confirmedAnimalId: undefined, confirmedSighting: undefined });
      handleExistingAnimal(confirmedAnimalId, confirmedSighting);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedAnimalId]);

  async function handleExistingAnimal(animalId: number, sighting: boolean) {
    // The first confirm finishes and opens its profile; this one is dropped.
    if (confirmingRef.current) return;
    // Neither a hit nor a carer: the confirm is a decision, not a sighting —
    // no server call, the profile opens ("bakım ver" is the way in).
    if (!location || !sighting) {
      navigation.replace('AnimalProfile', { animalId });
      return;
    }
    confirmingRef.current = true;
    setConfirming(true);
    try {
      await reportSighting(animalId, location.lat, location.lng);
    } catch (err: any) {
      // Carers only: the hit expired (15 minutes) before the confirm. The
      // decision is still made, so the profile opens (web parity) — after
      // saying why the user is not a carer, since the flow's photos are not
      // uploaded: they need the rights the sighting failed to grant (an
      // expired hit and expired tokens come together). The screen is
      // replaced, so it stays busy until it goes.
      if (err?.response?.data?.code === 'carersOnly') {
        Alert.alert(
          'Eşleşmenin süresi doldu',
          'Bakıcısı olmak için profilden “bakım ver” ile yeni bir fotoğraf çek.'
        );
        navigation.replace('AnimalProfile', { animalId });
        return;
      }
      // Anything else keeps the user on the results, free to try again.
      confirmingRef.current = false;
      setConfirming(false);
      Alert.alert(
        'Güncellenemedi',
        err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
      );
      return;
    }
    // The sighting made (or found) the user a carer, so the photos taken
    // for this flow join the animal's gallery exactly as they would a new
    // one's (owner batch 2026-09-14, B1). The server once had a match-hit
    // door on addPhoto for this very step; no client ever sent the photos,
    // and the door was removed to match — they were silently dropped.
    await addFlowPhotos(animalId, photoTokens);
    navigation.replace('AnimalProfile', { animalId });
  }

  if (confirming) {
    return (
      <Screen>
        <LoadingState label="Kaydediliyor…" />
      </Screen>
    );
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
          } karşılaştırıldı; yalnızca yüksek ve orta benzerlikteki kayıtlar listelendi. Birine dokunup profiline bak; oysa "bu o" de — konumu güncellenir ve bakım listene eklenir.`}
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
            <AnimalAvatar
              species={animal.species}
              breed={animal.breed}
              photoUrl={animal.cover_thumb_url}
              size={52}
            />
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
            />
          )}
        </>
      )}

      {/* No example placeholders (owner, 2026-09-16): the label inside the
          box already says what the field is, and an "Örn. …" grey line reads
          as a value that is already there. */}
      <Input
        label="isim (isteğe bağlı)"
        value={name}
        onChangeText={setName}
        containerStyle={styles.field}
      />
      {/* "belirgin fiziksel özellikler" rather than "işaretler / notlar"
          (owner, 2026-09-16): what this field is for is recognising the
          animal again — a notched ear, a limp — not a diary. */}
      <Input
        label="belirgin fiziksel özellikler (varsa)"
        value={markings}
        onChangeText={setMarkings}
        multiline
        containerStyle={styles.field}
      />

      <Text variant="micro" style={styles.label}>
        fotoğraf (en az bir)
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
        {/* The camera only (owner batch 2026-09-14, C1): the animal is
            registered from a photo taken here and now, like "bakım ver" and
            the map's food/water drop. The library door (SEÇ) is gone. */}
        {photos.length < MAX_PHOTOS && (
          <Pressable
            style={styles.addPhoto}
            onPress={handleTakePhoto}
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf çek"
          >
            <Icon name="camera" size={22} color={colors.brand} />
            <Text variant="micro" color="brand" style={styles.addPhotoText}>
              ÇEK
            </Text>
          </Pressable>
        )}
      </View>
      {/* Beside the slots on purpose: whether a photo you take here also
          lands in your own gallery is a decision, not a surprise. */}
      <SaveToGalleryRow style={styles.saveRow} />
      {photoIssue && (
        <Text variant="caption" color="danger" style={styles.photoIssue}>
          {photoIssue}
        </Text>
      )}

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
  saveRow: { marginTop: -spacing.sm, marginBottom: spacing.lg },
  photoIssue: { marginTop: -spacing.sm, marginBottom: spacing.lg },
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
