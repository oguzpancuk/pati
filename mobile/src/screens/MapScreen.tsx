import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  CameraRef,
  Images,
  LineLayer,
  MapView,
  MapViewRef,
  MarkerView,
  RegionPayload,
  ShapeSource,
  SymbolLayer,
} from '@maplibre/maplibre-react-native';
import type { Feature, Point } from 'geojson';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import {
  addCareAction,
  CareAction,
  CareStatus,
  checkCarePhoto,
  fetchCareActionsInBounds,
  fetchCareStatus,
  PhotoAsset,
  PhotoCheck,
} from '../api/care';
import { openAddAnimal } from '../addAnimalGate';
import { Animal, fetchAnimals } from '../api/animals';
import AdBanner from '../components/AdBanner';
import AnimalAvatar from '../components/AnimalAvatar';
import HeartBurst, { HEART_BURST_DURATION_MS, heartRiseFor } from '../components/HeartBurst';
import UserLocationMarker, { PIN_TIP_ANCHOR_Y } from '../components/UserLocationMarker';
import {
  alertLocationPermission,
  Coordinates,
  distanceMeters,
  ensureLocationPermission,
  getCurrentLocation,
  LocationPermissionError,
} from '../location';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import {
  circleRing,
  distanceBetween,
  featureCollection,
  metersPerPixel,
  offsetMeters,
  pointFeature,
  segmentFeature,
} from '../map/geo';
import {
  CARE_MARKER_SCALE_SMALL,
  CARE_MARKER_ZOOM_FULL,
  CARE_MARKER_ZOOM_SMALL,
  CareType,
  ringStep,
  ringTone,
} from '../map/careMarkers';
import { CARE_MARKER_IMAGES } from '../map/markers';
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

// Stacked markers (owner, 2026-09-08). Three rules, shared with web:
// 1. A record within ATTACH_METERS of an animal would sit under its avatar
//    (avatars are views above every layer), so it moves to the avatar's
//    shoulder — a fixed pixel offset — where it stays visible and tappable.
// 2. Records that would overlap each other (collision placement hides all
//    but the freshest) open as a fan when the visible one is tapped: the
//    members within FAN_PICK_PX of it spread on a circle of FAN_RADIUS_PX
//    with spokes to the spot; any map move or blank tap closes it.
// 3. The user pin goes half transparent when a record or an animal sits
//    inside PIN_DIM_METERS of it, so what's underneath still reads.
const ATTACH_METERS = 12;
const ATTACH_OFFSET_PX: [number, number] = [22, -22];
const FAN_PICK_PX = 28;
const FAN_RADIUS_PX = 46;
const PIN_DIM_METERS = 14;

// One map for food and water (owner decision, 2026-09-08): every record is
// a screen-constant marker — bowl or drop in a green ring that empties as
// the record's window runs out (map/careMarkers.ts). The 100 m fill
// circles are gone; the radius still drives the status line and the
// notification, the map just stops painting it. Records are one GeoJSON
// source and one SymbolLayer, so thousands stay a single native layer.
// Placement is collision-managed: where markers would overlap the fresher
// one wins (symbolSortKey), and icons shrink toward country zoom.
const CARE_TYPE_LABEL: Record<CareType, string> = { food: 'mama', water: 'su' };

// The "AI is checking the photo" interstitial is real since ADR-0005: the
// photo goes up during it and the model says whether it shows the food or
// water the user claims. An approved (or unchecked — the model may be off)
// photo comes back as a token; after "uygun görünüyor" the user explicitly
// confirms, and only that confirm creates the record (owner decision). A
// rejected photo shows the model's reason and offers a retake.

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
  // Per-type status around the user; null until a location is known.
  const [statuses, setStatuses] = useState<Record<CareType, CareStatus> | null>(null);
  const [myLocation, setMyLocation] = useState<Coordinates | null>(null);
  // Which record the open confirm sheet creates; set by the tile pressed.
  const [dropType, setDropType] = useState<CareType>('food');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [aiCheck, setAiCheck] = useState<'idle' | 'checking' | 'approved' | 'rejected'>('idle');
  const [pendingPhoto, setPendingPhoto] = useState<PhotoAsset | null>(null);
  // The check's answer: the token the confirm redeems, or the reason a
  // photo was turned down.
  const [photoCheck, setPhotoCheck] = useState<PhotoCheck | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  // Invalidates in-flight check timers: closing mid-check (Android back)
  // and reopening must not let the stale timer flip a fresh sheet to a
  // photo-less "approved". Bumped on open, cancel, and close.
  const aiCheckRunRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [animalsVisible, setAnimalsVisible] = useState(false);
  // The open fan: the tapped record's spot, the member ids and the ground
  // size of a pixel at the zoom it opened at (positions are geographic, so
  // they only hold for that zoom — any move closes the fan).
  const [fan, setFan] = useState<{ center: Coordinates; ids: number[]; mpp: number } | null>(null);
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

  const typeLabel = CARE_TYPE_LABEL[dropType];

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
    // Overlapping loads (a refocus during a slow first load, a drop right
    // after) race: without the sequence check, whichever response lands
    // LAST paints the map and the bottom sheet.
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const [actionData, loc] = await Promise.all([
        fetchCareActionsInBounds(TURKEY_BOUNDS),
        getCurrentLocation().catch(() => null),
      ]);
      if (seq !== loadSeqRef.current) return null;
      setActions(actionData);
      if (loc) {
        setMyLocation(loc);
        const [food, water, animalData] = await Promise.all([
          fetchCareStatus(loc.lat, loc.lng, 'food'),
          fetchCareStatus(loc.lat, loc.lng, 'water'),
          fetchAnimals({ lat: loc.lat, lng: loc.lng, radiusMeters: ANIMAL_RADIUS_METERS }),
        ]);
        if (seq !== loadSeqRef.current) return null;
        setStatuses({ food, water });
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
  }, []);

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
    setFan(null);
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

      // The photo goes up now and the model looks at it; nothing is
      // recorded yet — after "uygun görünüyor" the user confirms explicitly
      // and only then does the record get created (owner decision — the
      // check must not auto-add).
      const photo = { uri: asset.uri, type: asset.type, fileName: asset.fileName };
      setPendingPhoto(photo);
      setPhotoCheck(null);
      setRejectReason(null);
      setAiCheck('checking');
      const run = ++aiCheckRunRef.current;
      try {
        const result = await checkCarePhoto(dropType, photo);
        if (run !== aiCheckRunRef.current) return;
        setPhotoCheck(result);
        setAiCheck('approved');
      } catch (err: any) {
        if (run !== aiCheckRunRef.current) return;
        if (err?.response?.data?.code === 'photoRejected') {
          setRejectReason(err.response.data.error ?? null);
          setAiCheck('rejected');
          return;
        }
        throw err;
      }
    } catch (err: any) {
      setAiCheck('idle');
      setPendingPhoto(null);
      Alert.alert(
        'Fotoğraf alınamadı',
        err?.code === 'ECONNABORTED'
          ? 'Bağlantı zaman aşımına uğradı. Tekrar dener misin?'
          : err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
      );
    }
  }

  /** The explicit "add it" after the AI check approved the photo. */
  async function handleConfirmDrop(actionType: 'food' | 'water') {
    if (!pendingPhoto || !photoCheck) return;
    setSubmitting(true);
    try {
      const device = await getCurrentLocation();
      const created = await addCareAction(
        device.lat,
        device.lng,
        actionType,
        photoCheck.photoToken
      );
      // aiCheck/pendingPhoto reset when the modal next opens, not here:
      // resetting before the close would flash the confirm content behind
      // the fade-out.
      setConfirmOpen(false);
      const refreshed = await load();
      celebrateNearbyAnimals(device, refreshed ?? animals);
      celebrate(created);
    } catch (err: any) {
      // Stay on the approval step so the user can retry the confirm —
      // unless the token has expired, which only a fresh check can fix.
      if (err instanceof LocationPermissionError) {
        alertLocationPermission();
      } else if (err?.response?.data?.code === 'photoAlreadyUsed') {
        // The earlier confirm went through and its response was lost (a
        // timeout on cellular): the drop exists, so behave as if it had
        // just succeeded instead of stranding the user on this step.
        setConfirmOpen(false);
        await load();
      } else if (err?.response?.data?.code === 'photoTokenInvalid') {
        Alert.alert('Fotoğrafı tekrar çek', err.response.data.error);
        aiCheckRunRef.current++;
        setAiCheck('idle');
        setPendingPhoto(null);
        setPhotoCheck(null);
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

  /** A tile pressed: gate on location, then open the confirm sheet for that type. */
  async function openDrop(type: CareType) {
    // Permission gate at the flow's entry (owner decision): a denied
    // permission surfaces the Settings alert HERE, before any modal — and
    // an undetermined one triggers the native prompt at exactly the moment
    // the user shows intent. Other location errors don't block; the
    // confirm step handles them.
    try {
      await ensureLocationPermission();
    } catch (err) {
      if (err instanceof LocationPermissionError) {
        alertLocationPermission();
        return;
      }
    }
    // A leftover 'approved' from the previous run would skip the confirm
    // content (state resets on open, not on close — see handleConfirmDrop).
    aiCheckRunRef.current++;
    setAiCheck('idle');
    setPendingPhoto(null);
    setDropType(type);
    setConfirmOpen(true);
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

  // The status line reads both types at once. Unknown (no location yet)
  // counts as missing, same as before: the sheet never claims coverage it
  // hasn't seen.
  const hasFood = !!statuses && !statuses.food.needsAttention;
  const hasWater = !!statuses && !statuses.water.needsAttention;
  const sheetTitle =
    hasFood && hasWater
      ? 'Bu bölgede mama ve su var'
      : hasFood
      ? 'Bu bölgede mama var, su yok'
      : hasWater
      ? 'Bu bölgede su var, mama yok'
      : 'Buralarda mama ve su yok';

  const actionPosition = (action: CareAction): Coordinates => ({
    lat: action.location.coordinates[1],
    lng: action.location.coordinates[0],
  });

  // One point per record; the layer picks the image from type + tone + ring
  // step (see map/careMarkers.ts) and the weight decides who wins a
  // collision. `attached` moves the record to an animal's shoulder,
  // `hidden` takes the members of the open fan off this layer.
  const careMarkers = useMemo(
    () =>
      featureCollection(
        actions.map((action) => {
          const weight = Number(action.weight);
          const at = actionPosition(action);
          const attached = animals.some(
            (animal) =>
              distanceBetween(at, {
                lat: animal.location.coordinates[1],
                lng: animal.location.coordinates[0],
              }) <= ATTACH_METERS
          );
          // `step` as a string: the icon key is built with `concat`, and a
          // string leaves no room for an engine to print a number as "5.0".
          return pointFeature(at, {
            id: action.id,
            type: action.action_type,
            tone: ringTone(weight),
            step: String(ringStep(weight)),
            weight,
            attached: attached ? 1 : 0,
            hidden: fan?.ids.includes(action.id) ? 1 : 0,
          });
        })
      ),
    [actions, animals, fan]
  );

  // The fan's members on a circle around the tapped spot, plus a spoke each.
  const fanShapes = useMemo(() => {
    if (!fan) return null;
    const members = actions.filter((action) => fan.ids.includes(action.id));
    const radius = FAN_RADIUS_PX * fan.mpp;
    const points = members.map((action, i) => {
      const angle = -Math.PI / 2 + (i / members.length) * 2 * Math.PI;
      const weight = Number(action.weight);
      const at = offsetMeters(fan.center, radius * Math.cos(angle), -radius * Math.sin(angle));
      return {
        at,
        feature: pointFeature(at, {
          id: action.id,
          type: action.action_type,
          tone: ringTone(weight),
          step: String(ringStep(weight)),
          weight,
        }),
      };
    });
    return {
      icons: featureCollection(points.map((p) => p.feature)),
      spokes: featureCollection(points.map((p) => segmentFeature(fan.center, p.at))),
    };
  }, [actions, fan]);

  /** A tap on a record: open the fan of everything stacked under it. */
  async function handleCarePress(event: { features: Feature[] }) {
    const tappedId = Number(event.features[0]?.properties?.id);
    const tapped = actions.find((action) => action.id === tappedId);
    if (!tapped) return;
    const zoom = (await mapRef.current?.getZoom()) ?? currentZoomRef.current;
    const center = actionPosition(tapped);
    const mpp = metersPerPixel(zoom, center.lat);
    const ids = actions
      .filter((action) => distanceBetween(center, actionPosition(action)) <= FAN_PICK_PX * mpp)
      .map((action) => action.id);
    setFan(ids.length >= 2 ? { center, ids, mpp } : null);
  }

  // Rule 3: half-transparent pin when something sits under it.
  const pinDimmed = useMemo(() => {
    if (!myLocation) return false;
    const near = (p: Coordinates) => distanceBetween(myLocation, p) <= PIN_DIM_METERS;
    return (
      actions.some((action) => near(actionPosition(action))) ||
      animals.some((animal) =>
        near({ lat: animal.location.coordinates[1], lng: animal.location.coordinates[0] })
      )
    );
  }, [myLocation, actions, animals]);
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
        onPress={() => setFan(null)}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: TURKEY_CENTER, zoomLevel: COUNTRY_ZOOM }}
          maxBounds={TURKEY_CAMERA_BOUNDS}
          minZoomLevel={MIN_ZOOM}
          maxZoomLevel={MAX_ZOOM}
        />

        {/* Both themes' 40 images are registered up front. A theme switch
            swaps mapStyle, which reloads the style: native re-attaches the
            sources and layers itself, and the icons come back through the
            image-missing path (MLRNImages fetches each key from this set
            again). Keep <Images> — dropping it for onImageMissing alone
            would leave nothing for that path to fetch. */}
        <Images images={CARE_MARKER_IMAGES} />
        <ShapeSource
          id="care-markers"
          shape={careMarkers}
          onPress={handleCarePress}
          hitbox={{ width: 36, height: 36 }}
        >
          <SymbolLayer
            id="care-markers-icon"
            filter={['!=', ['get', 'hidden'], 1]}
            style={{
              iconImage: [
                'concat',
                'care-',
                ['get', 'type'],
                '-',
                ['get', 'tone'],
                '-',
                ['get', 'step'],
                `-${themeName}`,
              ],
              iconSize: [
                'interpolate',
                ['linear'],
                ['zoom'],
                CARE_MARKER_ZOOM_SMALL,
                CARE_MARKER_SCALE_SMALL,
                CARE_MARKER_ZOOM_FULL,
                1,
              ],
              // Rule 1: a record under an animal avatar sits on its shoulder.
              iconOffset: [
                'case',
                ['==', ['get', 'attached'], 1],
                ['literal', ATTACH_OFFSET_PX],
                ['literal', [0, 0]],
              ],
              iconAllowOverlap: false,
              iconIgnorePlacement: false,
              // Lower sorts first and wins placement: the freshest record
              // of a crowded corner is the one that shows.
              symbolSortKey: ['-', 1, ['get', 'weight']],
            }}
          />
        </ShapeSource>

        {/* Rule 2: the open fan — spokes under, members over, no collision
            rules so every member shows. */}
        {fanShapes && (
          <>
            <ShapeSource id="care-fan-spokes" shape={fanShapes.spokes}>
              <LineLayer
                id="care-fan-spokes-line"
                style={{ lineColor: mapColors.userRadiusStroke, lineWidth: 1.5 }}
              />
            </ShapeSource>
            <ShapeSource id="care-fan" shape={fanShapes.icons}>
              <SymbolLayer
                id="care-fan-icon"
                style={{
                  iconImage: [
                    'concat',
                    'care-',
                    ['get', 'type'],
                    '-',
                    ['get', 'tone'],
                    '-',
                    ['get', 'step'],
                    `-${themeName}`,
                  ],
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                }}
              />
            </ShapeSource>
          </>
        )}

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

        {/* Anchored at the pin's tip, not the glyph center — the logo IS a
            map pin now, and its point should touch the coordinate. The view
            extends below the tip to contain the halo, so the anchor is the
            tip's fraction of the view height, not 1. */}
        {myLocation && (
          <MarkerView
            coordinate={[myLocation.lng, myLocation.lat]}
            anchor={{ x: 0.5, y: PIN_TIP_ANCHOR_Y }}
          >
            {/* Rule 3: see pinDimmed. */}
            <View style={{ opacity: pinDimmed ? 0.5 : 1 }}>
              <UserLocationMarker />
            </View>
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
                  photoUrl={animal.cover_thumb_url}
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

      {/* The map is fullscreen; the only floating controls are the zoom
          pair (the mama/su segment left with the single map). */}
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
        </View>
      </View>

      {/* The bottom sheet carries the area's status and the call to action
          (handoff 3b). The button stays even when everything is covered —
          leaving a record is always possible. */}
      {/* No bottom safe-area edge here: the tab bar below already absorbs the
          home-indicator inset, so an extra one left a strip of map between the
          sheet and the bar and the sheet looked like it was floating. */}
      <SafeAreaView style={styles.bottomLayer} edges={[]} pointerEvents="box-none">
        {/* Still spare (owner decision, 2026-08-31): one heading, one line,
            then the three actions of the single map as gradient buttons —
            icon above label, no icon discs (owner, 2026-09-08: "the old
            Mama bırak / Su bırak colour, bigger icons"). All three carry
            the gradient by the owner's call; that widens the handoff's
            "primary button" use, deliberately. The line carries the
            at-your-location rule the old "Konumuma …" label used to. */}
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text variant="heading" style={styles.sheetTitle}>
            {sheetTitle}
          </Text>
          <Text variant="body" style={styles.sheetDesc}>
            Kayıt şu anki konumuna düşer; halka süre bitene kadar erir.
          </Text>
          <View style={styles.actions}>
            {(
              [
                { key: 'food', label: 'Mama bırak', icon: 'food', onPress: () => openDrop('food') },
                {
                  key: 'water',
                  label: 'Su bırak',
                  icon: 'water',
                  onPress: () => openDrop('water'),
                },
                {
                  key: 'animal',
                  label: 'Hayvan ekle',
                  icon: 'paw',
                  onPress: () => openAddAnimal(navigation),
                },
              ] as const
            ).map((action) => (
              <Pressable
                key={action.key}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={action.onPress}
              >
                <Gradient radius={radius.lg} />
                <Icon name={action.icon} size={28} color={colors.textOnBrand} />
                <Text variant="captionStrong" style={styles.actionLabel}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>

      {/* The confirm sheet creates the record of the tile that opened it
          (dropType); its copy and the ad slot follow that type. */}
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
              /* The photo-check interstitial (ADR-0005). The photo is up,
                 nothing is recorded; the approved step waits for an
                 explicit confirm, the rejected step offers a retake. */
              <>
                <View style={styles.modalIcon}>
                  {aiCheck === 'checking' ? (
                    <ActivityIndicator color={colors.brand} />
                  ) : aiCheck === 'rejected' ? (
                    <Icon name="close" size={26} color={colors.danger} />
                  ) : (
                    <Icon name="check" size={26} color={colors.success} />
                  )}
                </View>
                <Text variant="heading" center>
                  {aiCheck === 'checking'
                    ? 'Yapay zeka fotoğrafı inceliyor'
                    : aiCheck === 'rejected'
                    ? 'Bu fotoğraf uygun görünmüyor'
                    : photoCheck?.verdict === 'approved'
                    ? 'Uygun görünüyor'
                    : 'Fotoğraf hazır'}
                </Text>
                <Text variant="body" center style={styles.modalDesc}>
                  {aiCheck === 'checking'
                    ? `Fotoğraftaki ${typeLabel} kontrol ediliyor…`
                    : aiCheck === 'rejected'
                    ? rejectReason ?? `Fotoğrafta ${typeLabel} görünmüyor. Tekrar çeker misin?`
                    : `${
                        photoCheck?.reason ? `${photoCheck.reason} ` : ''
                      }Kayıt eklensin mi? Şu anki konumuna ${typeLabel} kaydı düşecek.`}
                </Text>
                {aiCheck === 'rejected' && (
                  <>
                    {pendingPhoto?.uri && (
                      <Image source={{ uri: pendingPhoto.uri }} style={styles.modalPhoto} />
                    )}
                    <Button
                      title="Yeniden çek"
                      onPress={handleChooseAction}
                      icon={<Icon name="camera" size={18} color={colors.textOnBrand} />}
                      fullWidth
                    />
                    <Button
                      title="Vazgeç"
                      variant="ghost"
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
                {aiCheck === 'approved' && (
                  <>
                    {pendingPhoto?.uri && (
                      <Image source={{ uri: pendingPhoto.uri }} style={styles.modalPhoto} />
                    )}
                    <Button
                      title="Onayla ve ekle"
                      onPress={() => handleConfirmDrop(dropType)}
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
                  <Icon name={dropType} size={26} color={colors.brand} />
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

                {/* A food brand under the food sheet, a water brand under the water one. */}
                <AdBanner
                  slot={dropType === 'food' ? 'food_popup' : 'water_popup'}
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
  bottomLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  // The Gradient fills the button behind the icon and label (overflow
  // hidden clips it to the corners); pressed = a touch darker, like Button.
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.button,
  },
  actionPressed: { opacity: 0.88 },
  actionLabel: { color: c.textOnBrand, marginTop: spacing.xs },
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
