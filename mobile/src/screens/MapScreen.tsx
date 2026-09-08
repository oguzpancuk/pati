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
  Bounds,
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
import UserLocationMarker from '../components/UserLocationMarker';
import {
  alertLocationPermission,
  Coordinates,
  distanceMeters,
  ensureLocationPermission,
  getCurrentLocation,
  LocationPermissionError,
} from '../location';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import { circleRing, featureCollection, pointFeature } from '../map/geo';
import { layoutStacks } from '../map/stacks';
import {
  CARE_MARKER_SCALE_SMALL,
  CARE_MARKER_ZOOM_FULL,
  CARE_MARKER_ZOOM_SMALL,
  CareType,
  ringStep,
  ringTone,
} from '../map/careMarkers';
import { CARE_MARKER_IMAGES } from '../map/markers';
import { viewportBoxes } from '../map/viewport';
import { mapStyles } from '../map/styles';
import { Button, Text } from '../components/ui';
import { Icon, Logo } from '../components/brand';
import { makeStyles, mapColors, radius, spacing, useTheme } from '../theme';

// The map is worldwide (owner, 2026-09-09 — it used to be locked to a
// Turkey bounding box with the camera's maxBounds): no service area, no
// clamp, and the records come from whatever the viewport shows. Without a
// location the map opens on the whole world; the locate button and the
// first fix take it to the user.
const WORLD_CENTER: [number, number] = [20, 20];
// A pan fires a settle per gesture; the viewport refetch waits this long
// for the map to stand still.
const VIEWPORT_REFRESH_MS = 350;

const ACTION_CIRCLE_RADIUS_METERS = 100;
// Animals are fetched only near the user (500 m, owner decision 2026-09-08 —
// was 200 m): their business is with the animals around them; the whole
// table would crowd the map. Same rule as the web map.
const ANIMAL_RADIUS_METERS = 500;

// Zoom levels are shared numbers with web/src/pages/MapPage.tsx — the same
// MapLibre zoom scale on every platform, so the three clients behave alike.
// Change one, change the other.
// The generated basemap has no low-zoom relief (shared/mapstyle/build.mjs
// drops `natural_earth`), so below zoom 2 the ground paints empty cream —
// the world view opens at 2.2 and the floor is 2.
const WORLD_ZOOM = 2.2;
const USER_ZOOM = 16;
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;

// Animal avatars draw from neighbourhood scale (15, owner decision
// 2026-09-08 — was 17); overlapping ones fan out (map/stacks.ts), so the
// pile-up that forced 17 no longer happens.
// Keep this an integer: the layer's `step` on zoom (icon-allow-overlap)
// evaluates at the tile's integer zoom while the avatar gate compares the
// fractional camera zoom — they agree only at whole numbers.
const ANIMAL_VISIBLE_MIN_ZOOM = 15;

// The scale the map focuses to after leaving food/water: slightly below
// street scale so the green circle (100 m) and the animals in it fit
// comfortably.
const CELEBRATE_ZOOM = 18;
const CELEBRATE_ZOOM_MS = 400;
const ANIMAL_MARKER_SIZE = 36;
const HEART_RISE = heartRiseFor(ANIMAL_MARKER_SIZE);

// Stacked markers (owner, 2026-09-08, P7 item 9): from the zoom avatars
// draw at, records and avatars that would overlap on screen fan out
// around their spot automatically (no spokes — owner, P8), and the user's location
// dot stays put underneath (map/stacks.ts, shared with web). Below that
// zoom the symbol layer's collision placement hides all but the freshest
// of a pile, as before.

// One map for food and water (owner decision, 2026-09-08): every record is
// a screen-constant marker — bowl or drop in a green ring that empties as
// the record's window runs out (map/careMarkers.ts). The 100 m fill
// circles are gone; the radius still drives the status line and the
// notification, the map just stops painting it. Records are one GeoJSON
// source and one SymbolLayer, so thousands stay a single native layer.
// Placement is collision-managed: where markers would overlap the fresher
// one wins (symbolSortKey), and icons shrink toward country zoom.
const CARE_TYPE_LABEL: Record<CareType, string> = { food: 'mama', water: 'su' };
const NO_PLACEMENT = new Map<string, { drawAt: Coordinates; spot: Coordinates | null }>();

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
  const currentZoomRef = useRef(WORLD_ZOOM);
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
  const [chooserOpen, setChooserOpen] = useState(false);
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
  const [actionsFailed, setActionsFailed] = useState(false);
  const [statusFailed, setStatusFailed] = useState(false);
  // The settled zoom drives the stack layout (screen-space rule); the ref
  // stays for the celebration path.
  const [zoomLevel, setZoomLevel] = useState(WORLD_ZOOM);
  // The latest render's seat function, for callbacks armed by older renders.
  const seatsAtRef = useRef<(zoom: number) => Map<string, Coordinates>>(() => new Map());
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
  const actionsSeqRef = useRef(0);
  const viewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The celebration waits for the zoom to finish; screen points are
  // computed once the map settles (points taken mid-motion land wrong).
  const pendingHeartsRef = useRef<Animal[] | null>(null);

  const typeLabel = CARE_TYPE_LABEL[dropType];

  // The heart timer outlives celebrations; without this an unmount while a
  // burst is pending would setHearts on a dead screen.
  React.useEffect(
    () => () => {
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
      if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
    },
    []
  );

  function centerOnUser(loc: Coordinates) {
    if (hasCenteredOnUser.current) return;
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
    loadActionsForViewport();
  }

  /**
   * The records of whatever the map shows. Worldwide there is no fixed box
   * to ask for, so every settle (and every reload) asks for the viewport
   * (map/viewport.ts turns the engine's corners into the server's box).
   * A failure is stated on the map instead of reading as "no records here".
   */
  const loadActionsIn = useCallback(async (boxes: Bounds[], seq: number) => {
    try {
      // An antimeridian viewport is two boxes; the records are the union.
      const parts = await Promise.all(boxes.map((box) => fetchCareActionsInBounds(box)));
      if (seq !== actionsSeqRef.current) return;
      const byId = new Map<number, CareAction>();
      for (const part of parts) for (const action of part) byId.set(action.id, action);
      setActions([...byId.values()]);
      setActionsFailed(false);
    } catch {
      if (seq === actionsSeqRef.current) setActionsFailed(true);
    }
  }, []);

  const loadActionsForViewport = useCallback(async () => {
    // The sequence number is taken BEFORE the async bounds read: a slow
    // native call must not overwrite a newer viewport's records.
    const seq = ++actionsSeqRef.current;
    const visible = await mapRef.current?.getVisibleBounds().catch(() => null);
    // No bounds yet (the map is still coming up) is not a failure; the
    // next region settle asks again.
    if (!visible || seq !== actionsSeqRef.current) return;
    const [ne, sw] = visible;
    await loadActionsIn(viewportBoxes(ne, sw), seq);
  }, [loadActionsIn]);

  const load = useCallback(async (known?: Coordinates) => {
    // Overlapping loads (a refocus during a slow first load, a drop right
    // after) race: without the sequence check, whichever response lands
    // LAST paints the map and the bottom sheet.
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const loc = known ?? (await getCurrentLocation().catch(() => null));
      if (seq !== loadSeqRef.current) return null;
      // The records follow the viewport, not a fixed box (worldwide).
      loadActionsForViewport();
      if (loc) {
        setMyLocation(loc);
        const [food, water, animalData] = await Promise.all([
          fetchCareStatus(loc.lat, loc.lng, 'food'),
          fetchCareStatus(loc.lat, loc.lng, 'water'),
          fetchAnimals({ lat: loc.lat, lng: loc.lng, radiusMeters: ANIMAL_RADIUS_METERS }),
        ]);
        if (seq !== loadSeqRef.current) return null;
        setStatuses({ food, water });
        setStatusFailed(false);
        setAnimals(animalData);
        centerOnUser(loc);
        return animalData;
      }
      // No fix: the sheet must fall back to "we don't know where you are"
      // rather than keep asserting the last place's verdict (review finding).
      if (seq === loadSeqRef.current) {
        setStatuses(null);
        setStatusFailed(false);
      }
    } catch (err: any) {
      if (seq === loadSeqRef.current) {
        // The sheet must not read as "we don't know where you are" when the
        // lookup itself failed (review finding).
        setStatusFailed(true);
        Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadActionsForViewport]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleRegionDidChange(feature: Feature<Point, RegionPayload>) {
    const { zoomLevel, visibleBounds } = feature.properties;
    // Worldwide the viewport decides which records to show. A pan is a
    // burst of settles; the refetch waits for the map to stand still.
    const [ne, sw] = visibleBounds;
    if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
    viewportTimerRef.current = setTimeout(
      () => loadActionsIn(viewportBoxes(ne, sw), ++actionsSeqRef.current),
      VIEWPORT_REFRESH_MS
    );
    currentZoomRef.current = zoomLevel;
    setAnimalsVisible(zoomLevel >= ANIMAL_VISIBLE_MIN_ZOOM);
    setZoomLevel(zoomLevel);
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

    // From the avatar's fan seat at the settled zoom, not its true spot
    // (review finding): a fresh record at the same spot fans it out. Read
    // through the ref: the fallback timer was armed by an older render
    // whose data predates the reload.
    const zoom = (await map.getZoom()) ?? currentZoomRef.current;
    const seats = seatsAtRef.current(zoom);
    const bursts = await Promise.all(
      affected.map(async (animal) => {
        const at = seats.get(`animal-${animal.id}`) ?? animalPosition(animal);
        const [x, y] = await map.getPointInView([at.lng, at.lat]);
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

  /** The locate button (owner, P7 item 11): a fresh fix, fly there, and
   * refetch statuses and animals around it (web does the same through its
   * `myLocation` effects). */
  async function locateMe() {
    try {
      await ensureLocationPermission();
      const loc = await getCurrentLocation();
      setMyLocation(loc);
      cameraRef.current?.setCamera({
        centerCoordinate: [loc.lng, loc.lat],
        zoomLevel: USER_ZOOM,
        animationMode: 'flyTo',
        animationDuration: 500,
      });
      load(loc);
    } catch (err: any) {
      if (err instanceof LocationPermissionError) alertLocationPermission();
      else Alert.alert('Konum alınamadı', 'Konumun şu an okunamadı. Biraz sonra tekrar dene.');
    }
  }

  // The status line reads both types at once. Unknown (no location yet)
  // counts as missing, same as before: the sheet never claims coverage it
  // hasn't seen.
  const hasFood = !!statuses && !statuses.food.needsAttention;
  const hasWater = !!statuses && !statuses.water.needsAttention;
  // Without a fix there is no "here" to judge (the map may be showing the
  // whole world): say so instead of claiming the area is empty.
  const sheetTitle = !statuses
    ? statusFailed
      ? 'Buranın durumu alınamadı'
      : 'Buranın durumu bilinmiyor'
    : hasFood && hasWater
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
  const animalPosition = (animal: Animal): Coordinates => ({
    lat: animal.location.coordinates[1],
    lng: animal.location.coordinates[0],
  });

  // Where everything is drawn: from the avatar zoom on, overlapping records
  // and avatars take fan seats around their spot (map/stacks.ts); below it
  // every item sits on its own spot and the layer's collision placement
  // does the thinning.
  const placement = useMemo(() => {
    // One shared empty map below the gate, so zooming around the country
    // does not rebuild the feature set on every settle.
    if (zoomLevel < ANIMAL_VISIBLE_MIN_ZOOM) return NO_PLACEMENT;
    const draw = new Map<string, { drawAt: Coordinates; spot: Coordinates | null }>();
    const items = [
      ...actions.map((action) => ({ id: `care-${action.id}`, at: actionPosition(action) })),
      ...animals.map((animal) => ({ id: `animal-${animal.id}`, at: animalPosition(animal) })),
    ];
    for (const placed of layoutStacks(items, zoomLevel, myLocation ? [myLocation] : [])) {
      draw.set(placed.id, { drawAt: placed.drawAt, spot: placed.spot });
    }
    return draw;
  }, [actions, animals, myLocation, zoomLevel]);

  /** The fan seats at an arbitrary zoom (the celebration reads the live one). */
  function seatsAt(zoom: number) {
    const draw = new Map<string, Coordinates>();
    if (zoom < ANIMAL_VISIBLE_MIN_ZOOM) return draw;
    const items = [
      ...actions.map((action) => ({ id: `care-${action.id}`, at: actionPosition(action) })),
      ...animals.map((animal) => ({ id: `animal-${animal.id}`, at: animalPosition(animal) })),
    ];
    for (const placed of layoutStacks(items, zoom, myLocation ? [myLocation] : [])) {
      draw.set(placed.id, placed.drawAt);
    }
    return draw;
  }
  seatsAtRef.current = seatsAt;

  // One point per record; the layer picks the image from type + tone + ring
  // step (see map/careMarkers.ts) and the weight decides who wins a
  // collision below the avatar zoom.
  const careMarkers = useMemo(
    () =>
      featureCollection(
        actions.map((action) => {
          const weight = Number(action.weight);
          const at = placement.get(`care-${action.id}`)?.drawAt ?? actionPosition(action);
          // `step` as a string: the icon key is built with `concat`, and a
          // string leaves no room for an engine to print a number as "5.0".
          return pointFeature(at, {
            id: action.id,
            type: action.action_type,
            tone: ringTone(weight),
            step: String(ringStep(weight)),
            weight,
          });
        })
      ),
    [actions, placement]
  );

  // The dashed ring marks the range where animals are drawn (500 m) — the
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
          defaultSettings={{ centerCoordinate: WORLD_CENTER, zoomLevel: WORLD_ZOOM }}
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
        <ShapeSource id="care-markers" shape={careMarkers}>
          <SymbolLayer
            id="care-markers-icon"
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
              // From the avatar zoom on the fan has already separated the
              // stacks, so every marker shows; below it collision placement
              // thins a pile to its freshest record (lower sort key wins).
              iconAllowOverlap: ['step', ['zoom'], false, ANIMAL_VISIBLE_MIN_ZOOM, true],
              iconIgnorePlacement: ['step', ['zoom'], false, ANIMAL_VISIBLE_MIN_ZOOM, true],
              symbolSortKey: ['-', 1, ['get', 'weight']],
            }}
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

        {/* The user's own position as a small dot with a breathing halo
            (owner, P7 item 9 — the paw pin of 2026-08-31 retired); centred
            on the coordinate, drawn before the avatars so it stays under
            anything that fans around it. */}
        {myLocation && (
          <MarkerView coordinate={[myLocation.lng, myLocation.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <UserLocationMarker />
          </MarkerView>
        )}

        {animalsVisible &&
          animals.map((animal) => {
            const at = placement.get(`animal-${animal.id}`)?.drawAt ?? animalPosition(animal);
            return (
            <MarkerView
              key={`animal-${animal.id}`}
              coordinate={[at.lng, at.lat]}
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
            );
          })}
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

      {/* Top: the zoom hint (owner, P7 item 13 — it used to sit by the
          side controls). */}
      <SafeAreaView style={styles.topLayer} edges={['top']} pointerEvents="box-none">
        {actionsFailed && (
          <View style={styles.hint} pointerEvents="none">
            <Text variant="caption" center>
              Kayıtlar yüklenemedi
            </Text>
          </View>
        )}
        {!animalsVisible && animals.length > 0 && (
          <View style={styles.hint} pointerEvents="none">
            <Text variant="caption" center>
              Hayvanları görmek için yakınlaştır
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Side: only the locate button (P7 item 11); the zoom pair is gone
          (item 14 — pinch and double-tap remain). */}
      <View style={styles.sideControls} pointerEvents="box-none">
        <Pressable
          style={styles.roundButton}
          onPress={locateMe}
          accessibilityRole="button"
          accessibilityLabel="Konumuma git"
        >
          <Icon name="crosshair" size={22} color={colors.brand} />
        </Pressable>
      </View>

      {/* The bottom sheet carries the area's status and the call to action
          (handoff 3b). The button stays even when everything is covered —
          leaving a record is always possible. */}
      {/* No bottom safe-area edge here: the tab bar below already absorbs the
          home-indicator inset, so an extra one left a strip of map between the
          sheet and the bar and the sheet looked like it was floating. */}
      <SafeAreaView style={styles.bottomLayer} edges={[]} pointerEvents="box-none">
        {/* Still spare (owner decision, 2026-08-31): one heading, one line,
            one button. The single "Ekle" (owner, P7 item 10) opens the
            chooser below; the line carries the at-your-location rule. */}
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text variant="heading" style={styles.sheetTitle}>
            {sheetTitle}
          </Text>
          <Text variant="body" style={styles.sheetDesc}>
            {statuses
              ? 'Kayıt şu anki konumuna düşer; halka süre bitene kadar erir.'
              : statusFailed
              ? 'Bağlantı kurulunca burayı gösteririz; kayıt yine şu anki konumuna düşer.'
              : 'Konumunu açınca buranın durumunu gösteririz; kayıt yine şu anki konumuna düşer.'}
          </Text>
          {/* The pati logo on the button (owner, P8 item 1), white on the
              gradient with the heart cut out. */}
          <Button
            title="Ekle"
            onPress={() => setChooserOpen(true)}
            icon={<Logo size={20} color={colors.textOnBrand} accent="transparent" />}
            fullWidth
          />
        </View>
      </SafeAreaView>

      {/* What to add: the chooser behind the single "Ekle" (P7 item 10). */}
      <Modal
        visible={chooserOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setChooserOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setChooserOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text variant="heading" center style={styles.chooserTitle}>
              Ne ekliyorsun?
            </Text>
            {(
              [
                { key: 'food', label: 'Mama bıraktım', icon: 'food' },
                { key: 'water', label: 'Su bıraktım', icon: 'water' },
                { key: 'animal', label: 'Yeni hayvan', icon: 'paw' },
              ] as const
            ).map((choice) => (
              <Pressable
                key={choice.key}
                style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
                accessibilityRole="button"
                onPress={() => {
                  setChooserOpen(false);
                  if (choice.key === 'animal') openAddAnimal(navigation);
                  else openDrop(choice.key);
                }}
              >
                <View style={styles.choiceIcon}>
                  <Icon name={choice.icon} size={22} color={colors.brand} />
                </View>
                <Text variant="button" style={styles.choiceLabel}>
                  {choice.label}
                </Text>
                <Icon name="chevronRight" size={18} color={colors.textSubtle} />
              </Pressable>
            ))}
            <Button
              title="Vazgeç"
              variant="ghost"
              onPress={() => setChooserOpen(false)}
              fullWidth
              style={styles.modalCancel}
            />
          </Pressable>
        </Pressable>
      </Modal>

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
  topLayer: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  hint: {
    marginTop: spacing.md,
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadow.float,
  },
  // The locate button sits above the bottom sheet; otherwise the sheet
  // covers it and it stops being tappable.
  sideControls: { position: 'absolute', right: spacing.md, bottom: 210, alignItems: 'flex-end' },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.float,
  },
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
  sheetTitle: { marginBottom: 2 },
  sheetDesc: { marginBottom: spacing.md },
  chooserTitle: { marginBottom: spacing.md },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  choicePressed: { backgroundColor: c.brandTint },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: c.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  choiceLabel: { flex: 1, color: c.text },
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
