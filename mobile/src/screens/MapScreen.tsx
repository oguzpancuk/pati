import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  CameraRef,
  CircleLayer,
  FillLayer,
  LineLayer,
  MapView,
  MapViewRef,
  MarkerView,
  RegionPayload,
  ShapeSource,
} from '@maplibre/maplibre-react-native';
import type { Feature, Point } from 'geojson';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import {
  addCareAction,
  CareAction,
  CareStatus,
  fetchCareActionsInBounds,
  fetchCareStatus,
  PhotoAsset,
} from '../api/care';
import { Animal, fetchAnimals } from '../api/animals';
import AdBanner from '../components/AdBanner';
import AnimalAvatar from '../components/AnimalAvatar';
import HeartBurst, { HEART_BURST_DURATION_MS, heartRiseFor } from '../components/HeartBurst';
import UserLocationMarker from '../components/UserLocationMarker';
import {
  alertLocationPermission,
  Coordinates,
  distanceMeters,
  getCurrentLocation,
  LocationPermissionError,
} from '../location';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import { circlePolygon, circleRing, featureCollection, pointFeature } from '../map/geo';
import { mapStyles } from '../map/styles';
import { Button, Text } from '../components/ui';
import { Gradient, Icon } from '../components/brand';
import { makeStyles, mapColors, radius, spacing, useTheme } from '../theme';

// Turkey's approximate geographic bounding box (not an exact administrative
// border). The map focuses on this area and the user can't pan far outside
// (the Camera's maxBounds enforces it natively).
const TURKEY_BOUNDS = {
  minLat: 35.8,
  maxLat: 42.1,
  minLng: 25.6,
  maxLng: 44.8,
};
const TURKEY_CAMERA_BOUNDS = {
  ne: [TURKEY_BOUNDS.maxLng, TURKEY_BOUNDS.maxLat],
  sw: [TURKEY_BOUNDS.minLng, TURKEY_BOUNDS.minLat],
};
const TURKEY_CENTER: [number, number] = [
  (TURKEY_BOUNDS.minLng + TURKEY_BOUNDS.maxLng) / 2,
  (TURKEY_BOUNDS.minLat + TURKEY_BOUNDS.maxLat) / 2,
];

const ACTION_CIRCLE_RADIUS_METERS = 100;
// Animals are fetched only near the user (200 m): their business is with
// the animals on their own street, distant ones crowded the map. (Same rule
// as the web map.)
const ANIMAL_RADIUS_METERS = 200;

// Zoom levels are shared numbers with web/src/pages/MapPage.tsx — the same
// MapLibre zoom scale on every platform, so the three clients behave alike.
// Change one, change the other.
const COUNTRY_ZOOM = 5;
const USER_ZOOM = 16;
const MIN_ZOOM = 5;
const MAX_ZOOM = 19;

// Animal avatars draw only when zoomed well into building/street scale;
// from farther out dozens of avatars piled up and covered the map.
const ANIMAL_VISIBLE_MIN_ZOOM = 17;

// The scale the map focuses to after leaving food/water: slightly below
// street scale so the green circle (100 m) and the animals in it fit
// comfortably.
const CELEBRATE_ZOOM = 18;
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

// The "AI is checking the photo" interstitial is a deliberate placeholder,
// the same pattern as AddAnimalScreen's MIN_MATCHING_MS: it always
// approves, the wait makes the check feel real and reserves the slot for
// an actual model. Nothing uploads during the check — after "uygun
// görünüyor" the user explicitly confirms, and only that confirm creates
// the record (owner decision). When a real model lands it plugs into this
// screen and gains a reject path; the wait constant goes.
const AI_CHECK_MIN_MS = 2000;

function weightToGreenAlpha(weight: number) {
  return Math.min(Math.max(weight, 0), 1) * MAX_GREEN_ALPHA;
}

export default function MapScreen({ navigation }: any) {
  const styles = useStyles();
  const { name: themeName, colors } = useTheme();
  const { celebrate } = useBadgeAwards();
  const mapRef = useRef<MapViewRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const currentZoomRef = useRef(COUNTRY_ZOOM);
  const mapReadyRef = useRef(false);
  const pendingCenterRef = useRef<Coordinates | null>(null);
  const hasCenteredOnUser = useRef(false);
  const [actions, setActions] = useState<CareAction[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [myLocation, setMyLocation] = useState<Coordinates | null>(null);
  const [viewType, setViewType] = useState<'food' | 'water'>('food');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [aiCheck, setAiCheck] = useState<'idle' | 'checking' | 'approved'>('idle');
  const [pendingPhoto, setPendingPhoto] = useState<PhotoAsset | null>(null);
  // Invalidates in-flight check timers: closing mid-check (Android back)
  // and reopening must not let the stale timer flip a fresh sheet to a
  // photo-less "approved". Bumped on open, cancel, and close.
  const aiCheckRunRef = useRef(0);
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
  const loadSeqRef = useRef(0);
  // The celebration waits for the zoom to finish; screen points are
  // computed once the map settles (points taken mid-motion land wrong).
  const pendingHeartsRef = useRef<Animal[] | null>(null);

  const typeLabel = viewType === 'food' ? 'mama' : 'su';

  // The heart timer outlives celebrations; without this an unmount while a
  // burst is pending would setHearts on a dead screen.
  React.useEffect(
    () => () => {
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
    },
    []
  );

  // The Camera's maxBounds guards gestures but not programmatic moves; every
  // setCamera to a device location must check this itself (the simulator's
  // San Francisco default is how it bites in dev).
  function insideServiceArea(loc: Coordinates) {
    return (
      loc.lat >= TURKEY_BOUNDS.minLat &&
      loc.lat <= TURKEY_BOUNDS.maxLat &&
      loc.lng >= TURKEY_BOUNDS.minLng &&
      loc.lng <= TURKEY_BOUNDS.maxLng
    );
  }

  function centerOnUser(loc: Coordinates) {
    if (hasCenteredOnUser.current) return;
    // Outside the service area the map stays on the Turkey overview.
    if (!insideServiceArea(loc)) return;
    if (!mapReadyRef.current) {
      // A camera move can be silently ignored while the native map isn't
      // ready yet; the location is stored to retry once it is.
      pendingCenterRef.current = loc;
      return;
    }
    hasCenteredOnUser.current = true;
    cameraRef.current?.setCamera({
      centerCoordinate: [loc.lng, loc.lat],
      zoomLevel: USER_ZOOM,
      animationMode: 'flyTo',
      animationDuration: 500,
    });
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
    // Fast mama↔su toggles race: without the sequence check, whichever
    // response lands LAST paints the map and the bottom sheet, even if it
    // belongs to the deselected layer.
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const [actionData, loc] = await Promise.all([
        fetchCareActionsInBounds(TURKEY_BOUNDS, viewType),
        getCurrentLocation().catch(() => null),
      ]);
      if (seq !== loadSeqRef.current) return null;
      setActions(actionData);
      if (loc) {
        setMyLocation(loc);
        const [statusData, animalData] = await Promise.all([
          fetchCareStatus(loc.lat, loc.lng, viewType),
          fetchAnimals({ lat: loc.lat, lng: loc.lng, radiusMeters: ANIMAL_RADIUS_METERS }),
        ]);
        if (seq !== loadSeqRef.current) return null;
        setStatus(statusData);
        setAnimals(animalData);
        centerOnUser(loc);
        return animalData;
      }
    } catch (err: any) {
      if (seq === loadSeqRef.current) {
        Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleRegionDidChange(feature: Feature<Point, RegionPayload>) {
    // No Turkey clamp here anymore: the Camera's maxBounds keeps the center
    // inside the box natively.
    const { zoomLevel } = feature.properties;
    currentZoomRef.current = zoomLevel;
    setAnimalsVisible(zoomLevel >= ANIMAL_VISIBLE_MIN_ZOOM);
    if (pendingHeartsRef.current) flushPendingHearts();
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
    // Same programmatic-move guard as centerOnUser: never fly the camera
    // outside the Turkey bounds (dev-only in practice, but once outside,
    // gestures fight maxBounds).
    if (!insideServiceArea(origin)) return;
    const affected = currentAnimals.filter(
      (animal) =>
        distanceMeters(origin, {
          lat: animal.location.coordinates[1],
          lng: animal.location.coordinates[0],
        }) <= ACTION_CIRCLE_RADIUS_METERS
    );

    cameraRef.current?.setCamera({
      centerCoordinate: [origin.lng, origin.lat],
      zoomLevel: CELEBRATE_ZOOM,
      animationMode: 'flyTo',
      animationDuration: CELEBRATE_ZOOM_MS,
    });
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
        const [x, y] = await map.getPointInView([
          animal.location.coordinates[0],
          animal.location.coordinates[1],
        ]);
        return { id: animal.id, x, y };
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
  async function handleChooseAction() {
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

      // The check is a placeholder and needs no server, so NOTHING uploads
      // yet: after "uygun görünüyor" the user confirms explicitly and only
      // then does the record get created (owner decision — the check must
      // not auto-add).
      setPendingPhoto({ uri: asset.uri, type: asset.type, fileName: asset.fileName });
      setAiCheck('checking');
      const run = ++aiCheckRunRef.current;
      await new Promise((resolve) => setTimeout(resolve, AI_CHECK_MIN_MS));
      if (run !== aiCheckRunRef.current) return;
      setAiCheck('approved');
    } catch (err: any) {
      setAiCheck('idle');
      setPendingPhoto(null);
      Alert.alert('Fotoğraf alınamadı', err?.message ?? 'Bir hata oluştu');
    }
  }

  /** The explicit "add it" after the AI check approved the photo. */
  async function handleConfirmDrop(actionType: 'food' | 'water') {
    if (!pendingPhoto) return;
    setSubmitting(true);
    try {
      const device = await getCurrentLocation();
      const created = await addCareAction(device.lat, device.lng, actionType, pendingPhoto);
      // aiCheck/pendingPhoto reset when the modal next opens, not here:
      // resetting before the close would flash the confirm content behind
      // the fade-out.
      setConfirmOpen(false);
      const refreshed = await load();
      celebrateNearbyAnimals(device, refreshed ?? animals);
      celebrate(created);
    } catch (err: any) {
      // Stay on the approval step so the user can retry the confirm.
      if (err instanceof LocationPermissionError) {
        alertLocationPermission();
      } else {
        Alert.alert(
          'Eklenemedi',
          err?.code === 'ECONNABORTED'
            ? 'Bağlantı zaman aşımına uğradı. Tekrar dener misin?'
            : err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function zoomBy(step: number) {
    // Read the live zoom instead of currentZoomRef: the ref only updates on
    // the debounced onRegionDidChange, so right after a programmatic fly it
    // is stale and "+" would jump to a wildly different level.
    const current = (await mapRef.current?.getZoom()) ?? currentZoomRef.current;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + step));
    currentZoomRef.current = next;
    cameraRef.current?.zoomTo(next, 200);
  }

  const sheetNeedsCare = !status || status.needsAttention;

  // Care circles as one GeoJSON source: the fill carries freshness per
  // feature (data-driven opacity), so hundreds of records are still a single
  // native layer instead of hundreds of views.
  const careShapes = useMemo(
    () =>
      featureCollection(
        actions.map((action) => {
          const alpha = weightToGreenAlpha(Number(action.weight));
          return circlePolygon(
            { lat: action.location.coordinates[1], lng: action.location.coordinates[0] },
            ACTION_CIRCLE_RADIUS_METERS,
            // Studio language: a soft fill with a thin outline in the same
            // tone. Freshness still lives in the fill — newer records are
            // bolder.
            { alpha }
          );
        })
      ),
    [actions]
  );
  // Outlines as LineString rings — LineLayers reject polygon geometry on
  // MapLibre native (see map/geo.ts).
  const careStrokes = useMemo(
    () =>
      featureCollection(
        actions.map((action) => {
          const alpha = weightToGreenAlpha(Number(action.weight));
          return circleRing(
            { lat: action.location.coordinates[1], lng: action.location.coordinates[0] },
            ACTION_CIRCLE_RADIUS_METERS,
            { strokeAlpha: Math.min(alpha + 0.25, 0.75) }
          );
        })
      ),
    [actions]
  );
  const careCenters = useMemo(
    () =>
      featureCollection(
        actions.map((action) =>
          pointFeature({
            lat: action.location.coordinates[1],
            lng: action.location.coordinates[0],
          })
        )
      ),
    [actions]
  );
  // The dashed 200 m ring marks the range where animals are drawn — the
  // depiction in the handoff.
  const userRing = useMemo(
    () => (myLocation ? circleRing(myLocation, ANIMAL_RADIUS_METERS) : null),
    [myLocation]
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyles[themeName]}
        rotateEnabled={false}
        pitchEnabled={false}
        // OpenMapTiles + OSM attribution (required); top-left, clear of the
        // floating controls. The MapLibre logo is optional and stays off.
        attributionEnabled
        attributionPosition={{ top: 64, left: 8 }}
        onDidFinishLoadingMap={handleMapReady}
        onRegionDidChange={handleRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: TURKEY_CENTER, zoomLevel: COUNTRY_ZOOM }}
          maxBounds={TURKEY_CAMERA_BOUNDS}
          minZoomLevel={MIN_ZOOM}
          maxZoomLevel={MAX_ZOOM}
        />

        <ShapeSource id="care-circles" shape={careShapes}>
          <FillLayer
            id="care-circles-fill"
            style={{ fillColor: mapColors.cared, fillOpacity: ['get', 'alpha'] }}
          />
        </ShapeSource>
        <ShapeSource id="care-strokes" shape={careStrokes}>
          <LineLayer
            id="care-circles-stroke"
            style={{
              lineColor: mapColors.cared,
              lineOpacity: ['get', 'strokeAlpha'],
              lineWidth: 1.5,
            }}
          />
        </ShapeSource>
        {/* The center dot only at street scale: from afar hundreds of dots
            would speckle the map for no gain. */}
        <ShapeSource id="care-centers" shape={careCenters}>
          <CircleLayer
            id="care-centers-dot"
            minZoomLevel={ANIMAL_VISIBLE_MIN_ZOOM}
            style={{ circleColor: mapColors.cared, circleRadius: 5 }}
          />
        </ShapeSource>

        {userRing && (
          <ShapeSource id="user-ring" shape={userRing}>
            <LineLayer
              id="user-ring-stroke"
              minZoomLevel={ANIMAL_VISIBLE_MIN_ZOOM}
              style={{
                lineColor: mapColors.userRadiusStroke,
                lineWidth: 1.2,
                lineDasharray: [4, 6],
              }}
            />
          </ShapeSource>
        )}

        {myLocation && (
          <MarkerView coordinate={[myLocation.lng, myLocation.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <UserLocationMarker />
          </MarkerView>
        )}

        {animalsVisible &&
          animals.map((animal) => (
            <MarkerView
              key={`animal-${animal.id}`}
              coordinate={[animal.location.coordinates[0], animal.location.coordinates[1]]}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {/* The avatar sits in a 42pt white disc (handoff size) so it
                  separates from the map ground at any zoom. */}
              <Pressable style={styles.animalMarker} onPress={() => handleAnimalPress(animal.id)}>
                <AnimalAvatar
                  species={animal.species}
                  breed={animal.breed}
                  size={ANIMAL_MARKER_SIZE}
                />
              </Pressable>
            </MarkerView>
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
            onPress={() => zoomBy(1)}
            accessibilityLabel="Yakınlaştır"
          >
            <Text style={styles.roundButtonText}>+</Text>
          </Pressable>
          <Pressable
            style={styles.roundButton}
            onPress={() => zoomBy(-1)}
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
            title={viewType === 'food' ? 'Mama bırak' : 'Su bırak'}
            onPress={() => {
              // A leftover 'approved' from the previous run would skip the
              // confirm content (state resets on open, not on close — see
              // handleConfirmDrop).
              aiCheckRunRef.current++;
              setAiCheck('idle');
              setPendingPhoto(null);
              setConfirmOpen(true);
            }}
            icon={
              <Icon
                name={viewType === 'food' ? 'food' : 'water'}
                size={18}
                color={colors.textOnBrand}
              />
            }
            fullWidth
          />
          {/* "Buraya" used to read as "the point I'm looking at on the map";
              the record actually lands at the device location. The hint keeps
              that fact visible before the flow starts, not only in the
              confirmation modal. */}
          <View style={styles.sheetLocationHint}>
            <Icon name="crosshair" size={14} color={colors.textMuted} />
            <Text variant="micro" style={styles.sheetLocationHintText}>
              Kayıt şu anki konumuna işlenir
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Only the open map's own action is offered: adding water while on
          the food map (or vice versa) is confusing and inconsistent with the
          displayed layer. */}
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        // Android hardware back: close unless an upload is in flight — a
        // mid-check close is safe (nothing has uploaded) and the run guard
        // keeps its timer from resurfacing.
        onRequestClose={() => {
          if (submitting) return;
          aiCheckRunRef.current++;
          setConfirmOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {aiCheck !== 'idle' ? (
              /* The photo-check interstitial (placeholder AI — see
                 AI_CHECK_MIN_MS above). Nothing has uploaded yet; the
                 approved step waits for an explicit confirm. */
              <>
                <View style={styles.modalIcon}>
                  {aiCheck === 'checking' ? (
                    <ActivityIndicator color={colors.brand} />
                  ) : (
                    <Icon name="check" size={26} color={colors.success} />
                  )}
                </View>
                <Text variant="heading" center>
                  {aiCheck === 'checking' ? 'Yapay zeka fotoğrafı inceliyor' : 'Uygun görünüyor'}
                </Text>
                <Text variant="body" center style={styles.modalDesc}>
                  {aiCheck === 'checking'
                    ? `Fotoğraftaki ${typeLabel} kontrol ediliyor…`
                    : `Kayıt eklensin mi? Şu anki konumuna ${typeLabel} kaydı düşecek.`}
                </Text>
                {aiCheck === 'approved' && (
                  <>
                    {pendingPhoto?.uri && (
                      <Image source={{ uri: pendingPhoto.uri }} style={styles.modalPhoto} />
                    )}
                    <Button
                      title="Onayla ve ekle"
                      onPress={() => handleConfirmDrop(viewType)}
                      loading={submitting}
                      fullWidth
                    />
                    <Button
                      title="Vazgeç"
                      variant="ghost"
                      disabled={submitting}
                      onPress={() => {
                        aiCheckRunRef.current++;
                        setAiCheck('idle');
                        setPendingPhoto(null);
                      }}
                      fullWidth
                      style={styles.modalCancel}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <View style={styles.modalIcon}>
                  <Icon
                    name={viewType === 'food' ? 'food' : 'water'}
                    size={26}
                    color={colors.brand}
                  />
                </View>
                <Text variant="heading" center>
                  Bulunduğun yere {typeLabel} bırak
                </Text>
                <Text variant="body" center style={styles.modalDesc}>
                  {typeLabel === 'mama' ? 'Mamayı' : 'Suyu'} bırak ve fotoğrafını çek, haritada
                  herkes görsün. Kayıt şu anki konumuna düşecek.
                </Text>

                <Button
                  title="Fotoğrafını çek"
                  onPress={handleChooseAction}
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
              </>
            )}
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
  sheetLocationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  // flexShrink so the sentence wraps instead of clipping at the screen edge
  // on narrow devices / scaled fonts (Text in a row does not shrink by
  // default).
  sheetLocationHintText: { marginLeft: spacing.sm - 2, flexShrink: 1, textAlign: 'center' },
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
  modalPhoto: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    alignSelf: 'center',
  },
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
