import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, {
  Circle,
  LatLng,
  MapPressEvent,
  Marker,
  Polygon,
  Region as MapRegion,
} from 'react-native-maps';
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
import UserLocationMarker from '../components/UserLocationMarker';
import { Coordinates, distanceMeters, getCurrentLocation } from '../location';
import { useBadgeAwards } from '../context/BadgeAwardContext';

// Türkiye'nin yaklaşık coğrafi sınır kutusu (kesin idari sınır değil).
// Harita bu alana odaklanır ve kullanıcı bu kutunun dışına fazla kayamaz.
const TURKEY_BOUNDS = { minLat: 35.8, maxLat: 42.1, minLng: 25.6, maxLng: 44.8 };
const TURKEY_REGION: MapRegion = {
  latitude: (TURKEY_BOUNDS.minLat + TURKEY_BOUNDS.maxLat) / 2,
  longitude: (TURKEY_BOUNDS.minLng + TURKEY_BOUNDS.maxLng) / 2,
  latitudeDelta: TURKEY_BOUNDS.maxLat - TURKEY_BOUNDS.minLat,
  longitudeDelta: TURKEY_BOUNDS.maxLng - TURKEY_BOUNDS.minLng,
};
const TURKEY_POLYGON: LatLng[] = [
  { latitude: TURKEY_BOUNDS.minLat, longitude: TURKEY_BOUNDS.minLng },
  { latitude: TURKEY_BOUNDS.minLat, longitude: TURKEY_BOUNDS.maxLng },
  { latitude: TURKEY_BOUNDS.maxLat, longitude: TURKEY_BOUNDS.maxLng },
  { latitude: TURKEY_BOUNDS.maxLat, longitude: TURKEY_BOUNDS.minLng },
];

// Sunucudaki sınırla aynı tutulmalı (care.controller.js): GPS hassasiyeti şehir
// içinde 5-20m arasında değiştiği için 10m dürüst kullanıcıları da engelliyordu.
const MAX_DISTANCE_TO_PIN_METERS = 20;
const ACTION_CIRCLE_RADIUS_METERS = 100;
const ANIMAL_RADIUS_METERS = 10000;
const USER_ZOOM_DELTA = 0.03;
const MIN_DELTA = 0.001;
const MAX_DELTA = 40;

// Hayvan avatarları yalnızca sokak ölçeğine yakınlaşınca çizilir; şehir/ülke
// ölçeğinde onlarca avatar üst üste binip haritayı tamamen kapatıyordu.
const ANIMAL_VISIBLE_MAX_DELTA = 0.02;

// Bir marker'a dokunulduğunda MapView'in onPress'i de tetikleniyor (Android'de
// action alanıyla ayırt edilebiliyor, iOS'ta edilemiyor). Marker dokunuşundan
// hemen sonra gelen harita dokunuşunu yok saymak için kısa bir pencere tutuyoruz;
// aksi halde hayvana tıklarken mama/su popup'ı da açılıyor.
const MARKER_PRESS_GUARD_MS = 600;

// react-native-maps'in Heatmap bileşeni yalnızca Google Maps sağlayıcısında çalışıyor
// (iOS'ta Apple Maps kullandığımız için desteklenmiyor, Google'a geçmek iOS'ta da API
// key zorunluluğu getirirdi). Bunun yerine kırmızı bir taban katmanının üstüne, ağırlığa
// göre saydamlaşan yeşil daireler çiziyoruz: hiç bakım yoksa kırmızı görünür, taze/çok
// sayıda aksiyon olan yerlerde daireler üst üste binip belirgin yeşile döner.
// Opaklıklar bilinçli olarak düşük tutuldu; altındaki sokak/işletme isimleri okunabilir
// kalmalı, katmanlar haritayı gizlememeli.
const BASE_RED_FILL = 'rgba(198, 40, 40, 0.15)';
const MAX_GREEN_ALPHA = 0.3;

function weightToGreenAlpha(weight: number) {
  return Math.min(Math.max(weight, 0), 1) * MAX_GREEN_ALPHA;
}

type PendingPin = LatLng | null;

export default function MapScreen({ navigation }: any) {
  const { celebrate } = useBadgeAwards();
  const mapRef = useRef<MapView>(null);
  const currentRegionRef = useRef<MapRegion>(TURKEY_REGION);
  const mapReadyRef = useRef(false);
  const pendingCenterRef = useRef<Coordinates | null>(null);
  const hasCenteredOnUser = useRef(false);
  const markerPressedAtRef = useRef(0);
  const [actions, setActions] = useState<CareAction[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [myLocation, setMyLocation] = useState<Coordinates | null>(null);
  const [viewType, setViewType] = useState<'food' | 'water'>('food');
  const [pendingPin, setPendingPin] = useState<PendingPin>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [animalsVisible, setAnimalsVisible] = useState(false);

  function centerOnUser(loc: Coordinates) {
    if (hasCenteredOnUser.current) return;
    if (!mapReadyRef.current) {
      // Harita native tarafta henüz hazır değilse animateToRegion sessizce yok
      // sayılabiliyor; hazır olduğunda tekrar denemek için konumu saklıyoruz.
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
          fetchAnimals(loc.lat, loc.lng, ANIMAL_RADIUS_METERS),
        ]);
        setStatus(statusData);
        setAnimals(animalData);
        centerOnUser(loc);
      }
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
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

  function handleMapPress(event: MapPressEvent) {
    // Android bunu doğrudan söylüyor; iOS'ta marker dokunuşundan sonraki kısa
    // pencereye bakarak ayırt ediyoruz.
    if (event.nativeEvent.action === 'marker-press') return;
    if (Date.now() - markerPressedAtRef.current < MARKER_PRESS_GUARD_MS) return;
    setPendingPin(event.nativeEvent.coordinate);
  }

  function handleAnimalPress(animalId: number) {
    markerPressedAtRef.current = Date.now();
    setPendingPin(null);
    navigation.navigate('AnimalProfile', { animalId });
  }

  async function handleChooseAction(actionType: 'food' | 'water') {
    if (!pendingPin) return;
    const pin = pendingPin;

    try {
      let photoResult = await launchCamera({ mediaType: 'photo', saveToPhotos: false });

      // Simülatörlerde gerçek kamera donanımı yok. Geliştirme sırasında akışın
      // geri kalanını test edebilmek için galeriden seçmeye izin veriyoruz;
      // gerçek cihazda bu dal hiç tetiklenmez.
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
      const distance = distanceMeters(device, { lat: pin.latitude, lng: pin.longitude });
      if (distance > MAX_DISTANCE_TO_PIN_METERS) {
        Alert.alert(
          'Çok uzaktasınız',
          `İşaretlediğiniz konuma ${Math.round(distance)}m uzaktasınız. En az ${MAX_DISTANCE_TO_PIN_METERS}m yaklaşıp tekrar deneyin.`
        );
        return;
      }

      const created = await addCareAction(
        pin.latitude,
        pin.longitude,
        actionType,
        device.lat,
        device.lng,
        { uri: asset.uri, type: asset.type, fileName: asset.fileName }
      );
      setPendingPin(null);
      await load();
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

  return (
    <View style={styles.container}>
      {status?.needsAttention && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Bulunduğunuz konumun {status.radiusMeters}m çevresinde son{' '}
            {status.windowHours} saatte {viewType === 'food' ? 'mama' : 'su'} bırakılmamış.
          </Text>
        </View>
      )}

      <View style={styles.viewTypeRow}>
        <TouchableOpacity
          style={[styles.viewTypeButton, viewType === 'food' && styles.viewTypeButtonSelected]}
          onPress={() => setViewType('food')}
        >
          <Text style={[styles.viewTypeText, viewType === 'food' && styles.viewTypeTextSelected]}>
            Mama
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewTypeButton, viewType === 'water' && styles.viewTypeButtonSelected]}
          onPress={() => setViewType('water')}
        >
          <Text style={[styles.viewTypeText, viewType === 'water' && styles.viewTypeTextSelected]}>
            Su
          </Text>
        </TouchableOpacity>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        mapType="standard"
        initialRegion={TURKEY_REGION}
        onMapReady={handleMapReady}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={handleMapPress}
      >
        <Polygon
          coordinates={TURKEY_POLYGON}
          fillColor={BASE_RED_FILL}
          strokeColor="transparent"
        />

        {actions.map((action) => (
          <Circle
            key={action.id}
            center={{
              latitude: action.location.coordinates[1],
              longitude: action.location.coordinates[0],
            }}
            radius={ACTION_CIRCLE_RADIUS_METERS}
            fillColor={`rgba(46, 125, 50, ${weightToGreenAlpha(Number(action.weight))})`}
            strokeColor="transparent"
          />
        ))}

        {myLocation && (
          <Marker
            coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            // Konum göstergesi haritanın dokunuşunu yutuyor; en doğal davranış
            // kendi konumuna dokununca oraya işaret koymak.
            onPress={() =>
              setPendingPin({ latitude: myLocation.lat, longitude: myLocation.lng })
            }
          >
            <UserLocationMarker />
          </Marker>
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
              <AnimalAvatar species={animal.species} photoUrl={animal.cover_photo_url} size={36} />
            </Marker>
          ))}

        {pendingPin && <Marker coordinate={pendingPin} pinColor="#1976d2" />}
      </MapView>

      <View style={styles.zoomControls}>
        <TouchableOpacity style={styles.zoomButton} onPress={() => zoomBy(0.5)}>
          <Text style={styles.zoomButtonText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomButton} onPress={() => zoomBy(2)}>
          <Text style={styles.zoomButtonText}>−</Text>
        </TouchableOpacity>
      </View>

      {!pendingPin && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            {viewType === 'food' ? 'Mama' : 'Su'} bıraktığınız konumu işaretlemek için haritaya
            dokunun.
          </Text>
          {!animalsVisible && animals.length > 0 && (
            <Text style={styles.hintSubText}>
              Hayvanları görmek için haritayı yakınlaştırın.
            </Text>
          )}
        </View>
      )}

      {/* Hangi harita açıksa yalnızca ona ait aksiyon sunuluyor: mama haritasındayken
          su eklemek (ya da tersi) kafa karıştırıcı ve görüntülenen katmanla tutarsız. */}
      <Modal visible={!!pendingPin} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Bu konuma {viewType === 'food' ? 'mama' : 'su'} bıraktığınızı işaretleyin
            </Text>
            <View style={styles.modalButton}>
              <Button
                title={viewType === 'food' ? 'Mama Bıraktım' : 'Su Bıraktım'}
                onPress={() => handleChooseAction(viewType)}
                disabled={submitting}
              />
            </View>
            <View style={styles.modalButton}>
              <Button title="İptal" color="#c62828" onPress={() => setPendingPin(null)} />
            </View>

            {/* Mama haritasında mama markası, su haritasında su markası. */}
            <AdBanner
              slot={viewType === 'food' ? 'food_popup' : 'water_popup'}
              visible={!!pendingPin}
            />
          </View>
        </View>
      </Modal>

      {(loading || submitting) && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  zoomControls: {
    position: 'absolute',
    right: 12,
    bottom: 96,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  zoomButtonText: { fontSize: 22, fontWeight: '600', color: '#333' },
  banner: {
    backgroundColor: '#c62828',
    padding: 12,
  },
  bannerText: { color: '#fff', textAlign: 'center' },
  viewTypeRow: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    backgroundColor: '#fff',
  },
  viewTypeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  viewTypeButtonSelected: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  viewTypeText: { color: '#333', fontWeight: '600' },
  viewTypeTextSelected: { color: '#fff' },
  hint: {
    padding: 12,
    backgroundColor: '#fff',
  },
  hintText: { textAlign: 'center', color: '#555' },
  hintSubText: { textAlign: 'center', color: '#888', fontSize: 12, marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalButton: { marginBottom: 10 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
