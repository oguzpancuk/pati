import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Circle, Marker, Region as MapRegion } from 'react-native-maps';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import {
  addCareAction,
  CareAction,
  CareStatus,
  fetchCareActionsInBounds,
  fetchCareStatus,
} from '../api/care';
import { Animal, fetchAnimals } from '../api/animals';
import AdBanner from '../components/AdBanner';
import AnimalAvatar from '../components/AnimalAvatar';
import HeartBurst, { HEART_BURST_DURATION_MS, heartRiseFor } from '../components/HeartBurst';
import UserLocationMarker from '../components/UserLocationMarker';
import { Coordinates, distanceMeters, getCurrentLocation } from '../location';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import { Button, Text } from '../components/ui';
import { Gradient, Icon } from '../components/brand';
import { caredFill, makeStyles, mapColors, radius, spacing, useTheme } from '../theme';

// Turkey's approximate geographic bounding box (not an exact administrative
// border). The map focuses on this area and the user can't pan far outside.
const TURKEY_BOUNDS = {
  minLat: 35.8,
  maxLat: 42.1,
  minLng: 25.6,
  maxLng: 44.8,
};
const TURKEY_REGION: MapRegion = {
  latitude: (TURKEY_BOUNDS.minLat + TURKEY_BOUNDS.maxLat) / 2,
  longitude: (TURKEY_BOUNDS.minLng + TURKEY_BOUNDS.maxLng) / 2,
  latitudeDelta: TURKEY_BOUNDS.maxLat - TURKEY_BOUNDS.minLat,
  longitudeDelta: TURKEY_BOUNDS.maxLng - TURKEY_BOUNDS.minLng,
};

const ACTION_CIRCLE_RADIUS_METERS = 100;
// Animals are fetched only near the user (200 m): their business is with
// the animals on their own street, distant ones crowded the map. (Same rule
// as the web map.)
const ANIMAL_RADIUS_METERS = 200;
const USER_ZOOM_DELTA = 0.03;
const MIN_DELTA = 0.001;
const MAX_DELTA = 40;

// Animal avatars draw only when zoomed well into building/street scale
// (~0.004° ≈ a 450 m viewport); from farther out dozens of avatars piled up
// and covered the map.
const ANIMAL_VISIBLE_MAX_DELTA = 0.004;

// The scale the map focuses to after leaving food/water: slightly below
// street scale so the green circle (100 m) and the animals in it fit
// comfortably.
const CELEBRATE_ZOOM_DELTA = 0.003;
const CELEBRATE_ZOOM_MS = 400;
const ANIMAL_MARKER_SIZE = 36;
const HEART_RISE = heartRiseFor(ANIMAL_MARKER_SIZE);

// react-native-maps' Heatmap component only works with the Google Maps
// provider (we use Apple Maps on iOS, and switching to Google would force an
// API key on iOS too). Instead we draw green circles that fade with weight:
// where actions are fresh/numerous, circles overlap into a solid green. A
// red base layer used to cover the whole country underneath ("everywhere is
// an alarm"); it was removed — it blurred the map and carried a tension at
// odds with the app's tone. Uncared areas are now plain map; the "no food
// around here" message moved to the top banner. The green is a bit bolder
// in exchange. Opacity stays low regardless: street/business names beneath
// must remain readable.
const MAX_GREEN_ALPHA = 0.5;

function weightToGreenAlpha(weight: number) {
  return Math.min(Math.max(weight, 0), 1) * MAX_GREEN_ALPHA;
}

export default function MapScreen({ navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { celebrate } = useBadgeAwards();
  const mapRef = useRef<MapView>(null);
  const currentRegionRef = useRef<MapRegion>(TURKEY_REGION);
  const mapReadyRef = useRef(false);
  const pendingCenterRef = useRef<Coordinates | null>(null);
  const hasCenteredOnUser = useRef(false);
  const [actions, setActions] = useState<CareAction[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [myLocation, setMyLocation] = useState<Coordinates | null>(null);
  const [viewType, setViewType] = useState<'food' | 'water'>('food');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [animalsVisible, setAnimalsVisible] = useState(false);
  // Heart bursts draw in a separate layer above the map at screen
  // coordinates (not embedded in the marker): iOS rasterizes the marker view
  // once, so an animation inside it stuttered or appeared in the wrong
  // place. `round` increments on every record so the same animal bursts
  // again on back-to-back records (HeartBurst is one-shot; new key = new
  // mount).
  const [hearts, setHearts] = useState<{
    bursts: { id: number; x: number; y: number }[];
    round: number;
  }>({ bursts: [], round: 0 });
  const heartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The celebration waits for the zoom to finish; screen points are
  // computed once the map settles (points taken mid-motion land wrong).
  const pendingHeartsRef = useRef<Animal[] | null>(null);

  const typeLabel = viewType === 'food' ? 'mama' : 'su';

  function centerOnUser(loc: Coordinates) {
    if (hasCenteredOnUser.current) return;
    if (!mapReadyRef.current) {
      // animateToRegion can be silently ignored while the native map isn't
      // ready yet; the location is stored to retry once it is.
      pendingCenterRef.current = loc;
      return;
    }
    hasCenteredOnUser.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: loc.lat,
        longitude: loc.lng,
        latitudeDelta: USER_ZOOM_DELTA,
        longitudeDelta: USER_ZOOM_DELTA,
      },
      500
    );
  }

  function handleMapReady() {
    mapReadyRef.current = true;
    if (pendingCenterRef.current) {
      const loc = pendingCenterRef.current;
      pendingCenterRef.current = null;
      centerOnUser(loc);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actionData, loc] = await Promise.all([
        fetchCareActionsInBounds(TURKEY_BOUNDS, viewType),
        getCurrentLocation().catch(() => null),
      ]);
      setActions(actionData);
      if (loc) {
        setMyLocation(loc);
        const [statusData, animalData] = await Promise.all([
          fetchCareStatus(loc.lat, loc.lng, viewType),
          fetchAnimals({ lat: loc.lat, lng: loc.lng, radiusMeters: ANIMAL_RADIUS_METERS }),
        ]);
        setStatus(statusData);
        setAnimals(animalData);
        centerOnUser(loc);
        return animalData;
      }
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleRegionChangeComplete(region: MapRegion) {
    currentRegionRef.current = region;
    setAnimalsVisible(region.latitudeDelta <= ANIMAL_VISIBLE_MAX_DELTA);
    if (pendingHeartsRef.current) flushPendingHearts();

    const { latitude, longitude } = region;
    if (
      latitude < TURKEY_BOUNDS.minLat ||
      latitude > TURKEY_BOUNDS.maxLat ||
      longitude < TURKEY_BOUNDS.minLng ||
      longitude > TURKEY_BOUNDS.maxLng
    ) {
      mapRef.current?.animateToRegion(TURKEY_REGION, 300);
    }
  }

  function handleAnimalPress(animalId: number) {
    navigation.navigate('AnimalProfile', { animalId });
  }

  /**
   * Hearts rise from the avatars of the animals within the dropped
   * food/water's range (the green circle, 100 m). The map also zooms to
   * that area: the user usually sits above street scale where avatars don't
   * draw; the animals must become visible before the animation can be seen.
   */
  function celebrateNearbyAnimals(origin: Coordinates, currentAnimals: Animal[]) {
    const affected = currentAnimals.filter(
      (animal) =>
        distanceMeters(origin, {
          lat: animal.location.coordinates[1],
          lng: animal.location.coordinates[0],
        }) <= ACTION_CIRCLE_RADIUS_METERS
    );

    mapRef.current?.animateToRegion(
      {
        latitude: origin.lat,
        longitude: origin.lng,
        latitudeDelta: CELEBRATE_ZOOM_DELTA,
        longitudeDelta: CELEBRATE_ZOOM_DELTA,
      },
      CELEBRATE_ZOOM_MS
    );
    setAnimalsVisible(true);
    if (affected.length === 0) return;

    // Normally onRegionChangeComplete fires; if the map is already in that
    // area there may be no animation, hence the fallback timer.
    pendingHeartsRef.current = affected;
    if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
    heartTimerRef.current = setTimeout(flushPendingHearts, CELEBRATE_ZOOM_MS + 600);
  }

  async function flushPendingHearts() {
    const affected = pendingHeartsRef.current;
    const map = mapRef.current;
    if (!affected || !map) return;
    pendingHeartsRef.current = null;
    if (heartTimerRef.current) clearTimeout(heartTimerRef.current);

    const bursts = await Promise.all(
      affected.map(async (animal) => {
        const point = await map.pointForCoordinate({
          latitude: animal.location.coordinates[1],
          longitude: animal.location.coordinates[0],
        });
        return { id: animal.id, x: point.x, y: point.y };
      })
    );
    setHearts((prev) => ({ bursts, round: prev.round + 1 }));
    heartTimerRef.current = setTimeout(
      () => setHearts((prev) => ({ bursts: [], round: prev.round })),
      HEART_BURST_DURATION_MS + 200
    );
  }

  /**
   * The record always drops at the user's current spot. The location is read
   * **after** the photo is taken: the user may have walked while the camera
   * was open, and the record needs the freshest location to land right.
   */
  async function handleChooseAction(actionType: 'food' | 'water') {
    try {
      let photoResult = await launchCamera({
        mediaType: 'photo',
        saveToPhotos: false,
      });

      // Simulators have no real camera hardware. Picking from the gallery is
      // allowed during development so the rest of the flow can be tested;
      // this branch never triggers on a real device.
      if (__DEV__ && photoResult.errorCode === 'camera_unavailable') {
        photoResult = await launchImageLibrary({ mediaType: 'photo' });
      }

      if (photoResult.didCancel) {
        return;
      }
      const asset = photoResult.assets?.[0];
      if (!asset?.uri) {
        Alert.alert(
          'Fotoğraf alınamadı',
          photoResult.errorMessage ?? photoResult.errorCode ?? 'Bilinmeyen hata'
        );
        return;
      }

      setSubmitting(true);

      const device = await getCurrentLocation();
      const created = await addCareAction(device.lat, device.lng, actionType, {
        uri: asset.uri,
        type: asset.type,
        fileName: asset.fileName,
      });
      setConfirmOpen(false);
      const refreshed = await load();
      celebrateNearbyAnimals(device, refreshed ?? animals);
      celebrate(created);
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  }

  function zoomBy(factor: number) {
    const current = currentRegionRef.current;
    const nextRegion: MapRegion = {
      ...current,
      latitudeDelta: Math.min(MAX_DELTA, Math.max(MIN_DELTA, current.latitudeDelta * factor)),
      longitudeDelta: Math.min(MAX_DELTA, Math.max(MIN_DELTA, current.longitudeDelta * factor)),
    };
    currentRegionRef.current = nextRegion;
    mapRef.current?.animateToRegion(nextRegion, 200);
  }

  const sheetNeedsCare = !status || status.needsAttention;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType="standard"
        initialRegion={TURKEY_REGION}
        onMapReady={handleMapReady}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {actions.map((action) => {
          const alpha = weightToGreenAlpha(Number(action.weight));
          const center = {
            latitude: action.location.coordinates[1],
            longitude: action.location.coordinates[0],
          };
          return (
            <React.Fragment key={action.id}>
              {/* Studio language: a soft fill with a thin outline in the same
                  tone. Freshness still lives in the fill — newer records are
                  bolder. */}
              <Circle
                center={center}
                radius={ACTION_CIRCLE_RADIUS_METERS}
                fillColor={caredFill(alpha)}
                strokeColor={caredFill(Math.min(alpha + 0.25, 0.75))}
                strokeWidth={1.5}
              />
              {/* The center dot only at street scale: from afar hundreds of
                  dots would speckle the map for no gain. */}
              {animalsVisible && (
                <Circle
                  center={center}
                  radius={6}
                  fillColor={mapColors.cared}
                  strokeColor="transparent"
                />
              )}
            </React.Fragment>
          );
        })}

        {myLocation && (
          <Marker
            coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <UserLocationMarker />
          </Marker>
        )}

        {/* The dashed 200 m ring marks the range where animals are drawn —
            the depiction in the handoff. */}
        {myLocation && animalsVisible && (
          <Circle
            center={{ latitude: myLocation.lat, longitude: myLocation.lng }}
            radius={ANIMAL_RADIUS_METERS}
            fillColor="transparent"
            strokeColor={mapColors.userRadiusStroke}
            strokeWidth={1.2}
            lineDashPattern={[4, 6]}
          />
        )}

        {animalsVisible &&
          animals.map((animal) => (
            <Marker
              key={`animal-${animal.id}`}
              coordinate={{
                latitude: animal.location.coordinates[1],
                longitude: animal.location.coordinates[0],
              }}
              onPress={() => handleAnimalPress(animal.id)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {/* The avatar sits in a 42pt white disc (handoff size) so it
                  separates from the map ground at any zoom. */}
              <View style={styles.animalMarker}>
                <AnimalAvatar
                  species={animal.species}
                  breed={animal.breed}
                  size={ANIMAL_MARKER_SIZE}
                />
              </View>
            </Marker>
          ))}
      </MapView>

      {/* The heart layer: with the map fullscreen, the point from
          pointForCoordinate is directly this layer's coordinate. Each burst
          sits at the avatar's center and hearts drift up from there. */}
      {hearts.bursts.length > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {hearts.bursts.map((burst) => (
            <View
              key={`hearts-${hearts.round}-${burst.id}`}
              style={{
                position: 'absolute',
                left: burst.x - ANIMAL_MARKER_SIZE / 2,
                top: burst.y - ANIMAL_MARKER_SIZE / 2 - HEART_RISE,
                width: ANIMAL_MARKER_SIZE,
                height: ANIMAL_MARKER_SIZE + HEART_RISE,
              }}
            >
              <HeartBurst size={ANIMAL_MARKER_SIZE} />
            </View>
          ))}
        </View>
      )}

      {/* Top layer: the map is fullscreen, controls float above it. */}
      <SafeAreaView style={styles.topLayer} edges={['top']} pointerEvents="box-none">
        {/* A white pill shell whose selected half carries the gradient — one
            of the four places the gradient is allowed. */}
        <View style={styles.segment}>
          {(['food', 'water'] as const).map((option) => {
            const selected = viewType === option;
            return (
              <Pressable
                key={option}
                onPress={() => setViewType(option)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={styles.segmentItem}
              >
                {selected ? <Gradient radius={radius.pill} /> : null}
                <Icon
                  name={option === 'food' ? 'food' : 'water'}
                  size={17}
                  color={selected ? colors.textOnBrand : colors.textMuted}
                />
                <Text
                  variant="captionStrong"
                  style={[
                    styles.segmentLabel,
                    { color: selected ? colors.textOnBrand : colors.textMuted },
                  ]}
                >
                  {option === 'food' ? 'mama' : 'su'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      <View style={styles.sideControls} pointerEvents="box-none">
        {!animalsVisible && animals.length > 0 && (
          <View style={styles.hint} pointerEvents="none">
            <Text variant="caption" center>
              Hayvanları görmek için yakınlaştır
            </Text>
          </View>
        )}
        <View style={styles.roundStack}>
          <Pressable
            style={styles.roundButton}
            onPress={() => zoomBy(0.5)}
            accessibilityLabel="Yakınlaştır"
          >
            <Text style={styles.roundButtonText}>+</Text>
          </Pressable>
          <Pressable
            style={styles.roundButton}
            onPress={() => zoomBy(2)}
            accessibilityLabel="Uzaklaştır"
          >
            <Text style={styles.roundButtonText}>−</Text>
          </Pressable>
          {/* The handoff's FAB: registering a new animal is always one tap
              away from the map. */}
          <Pressable
            style={[styles.roundButton, styles.fab]}
            onPress={() => navigation.navigate('AddAnimal')}
            accessibilityLabel="Yeni hayvan ekle"
          >
            <Icon name="plus" size={22} color={colors.brand} />
          </Pressable>
        </View>
      </View>

      {/* The bottom sheet carries the area's status and the call to action
          (handoff 3b). The button stays even when everything is covered —
          leaving a record is always possible. */}
      {/* No bottom safe-area edge here: the tab bar below already absorbs the
          home-indicator inset, so an extra one left a strip of map between the
          sheet and the bar and the sheet looked like it was floating. */}
      <SafeAreaView style={styles.bottomLayer} edges={[]} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text variant="micro" style={styles.sheetMicro}>
            {status
              ? sheetNeedsCare
                ? `${status.radiusMeters} m çevrede kayıt yok`
                : `${status.radiusMeters} m çevrede ${status.actionCount} kayıt`
              : ' '}
          </Text>
          <Text variant="heading" style={styles.sheetTitle}>
            {sheetNeedsCare ? `Buralarda ${typeLabel} yok` : `Bu bölgede ${typeLabel} var`}
          </Text>
          <Text variant="body" style={styles.sheetDesc}>
            {sheetNeedsCare
              ? 'İlk kaydı sen bırak, bölge yeşile dönsün.'
              : 'Taze kayıt bölgeyi canlı tutar; sen de ekleyebilirsin.'}
          </Text>
          <Button
            title={`Buraya ${typeLabel} bıraktım`}
            onPress={() => setConfirmOpen(true)}
            icon={
              <Icon
                name={viewType === 'food' ? 'food' : 'water'}
                size={18}
                color={colors.textOnBrand}
              />
            }
            fullWidth
          />
        </View>
      </SafeAreaView>

      {/* Only the open map's own action is offered: adding water while on
          the food map (or vice versa) is confusing and inconsistent with the
          displayed layer. */}
      <Modal visible={confirmOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Icon name={viewType === 'food' ? 'food' : 'water'} size={26} color={colors.brand} />
            </View>
            <Text variant="heading" center>
              Bulunduğun yere {typeLabel} bıraktın mı?
            </Text>
            <Text variant="body" center style={styles.modalDesc}>
              Fotoğrafını çek, haritada herkes görsün. Kayıt şu anki konumuna düşecek.
            </Text>

            <Button
              title={viewType === 'food' ? 'Mama bıraktım' : 'Su bıraktım'}
              onPress={() => handleChooseAction(viewType)}
              loading={submitting}
              icon={<Icon name="camera" size={18} color={colors.textOnBrand} />}
              fullWidth
            />
            <Button
              title="Vazgeç"
              variant="ghost"
              onPress={() => setConfirmOpen(false)}
              fullWidth
              style={styles.modalCancel}
            />

            {/* A food brand on the food map, a water brand on the water map. */}
            <AdBanner
              slot={viewType === 'food' ? 'food_popup' : 'water_popup'}
              visible={confirmOpen}
            />
          </View>
        </View>
      </Modal>

      {(loading || submitting) && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingPill}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  container: { flex: 1, backgroundColor: c.background },
  topLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
  segment: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: spacing.md,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    ...shadow.float,
  },
  segmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  segmentLabel: { marginLeft: spacing.sm - 2 },
  animalMarker: {
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadow.float,
  },
  // The round controls sit above the bottom sheet; otherwise the sheet covers
  // them and they stop being tappable.
  sideControls: { position: 'absolute', right: spacing.md, bottom: 250, alignItems: 'flex-end' },
  hint: {
    marginBottom: spacing.sm,
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadow.float,
  },
  roundStack: { alignItems: 'center' },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  roundButtonText: { fontSize: 20, lineHeight: 24, color: c.textMuted },
  fab: { width: 46, height: 46, marginBottom: 0, ...shadow.float },
  bottomLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    ...shadow.float,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: c.borderStrong,
    marginBottom: spacing.md,
  },
  sheetMicro: { marginBottom: spacing.xs },
  sheetTitle: { marginBottom: 2 },
  sheetDesc: { marginBottom: spacing.md },
  modalBackdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.modal,
  },
  modalIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: c.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalDesc: { marginTop: spacing.xs, marginBottom: spacing.lg },
  modalCancel: { marginTop: spacing.xs },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingPill: {
    padding: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    ...shadow.float,
  },
}));
