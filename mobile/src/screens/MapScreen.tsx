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
import { Coordinates, distanceMeters, getCurrentLocation } from '../location';

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

const MAX_DISTANCE_TO_PIN_METERS = 10;
const ACTION_CIRCLE_RADIUS_METERS = 400;
const USER_ZOOM_DELTA = 0.03;
const MIN_DELTA = 0.001;
const MAX_DELTA = 40;

// react-native-maps'in Heatmap bileşeni yalnızca Google Maps sağlayıcısında çalışıyor
// (iOS'ta Apple Maps kullandığımız için desteklenmiyor, Google'a geçmek iOS'ta da API
// key zorunluluğu getirirdi). Bunun yerine kırmızı bir taban katmanının üstüne, ağırlığa
// göre saydamlaşan yeşil daireler çiziyoruz: hiç bakım yoksa kırmızı görünür, taze/çok
// sayıda aksiyon olan yerlerde daireler üst üste binip belirgin yeşile döner.
function weightToGreenAlpha(weight: number) {
  return Math.min(Math.max(weight, 0), 1) * 0.55;
}

type PendingPin = LatLng | null;

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const currentRegionRef = useRef<MapRegion>(TURKEY_REGION);
  const mapReadyRef = useRef(false);
  const pendingCenterRef = useRef<Coordinates | null>(null);
  const hasCenteredOnUser = useRef(false);
  const [actions, setActions] = useState<CareAction[]>([]);
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [myLocation, setMyLocation] = useState<Coordinates | null>(null);
  const [pendingPin, setPendingPin] = useState<PendingPin>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        fetchCareActionsInBounds(TURKEY_BOUNDS),
        getCurrentLocation().catch(() => null),
      ]);
      setActions(actionData);
      if (loc) {
        setMyLocation(loc);
        const statusData = await fetchCareStatus(loc.lat, loc.lng);
        setStatus(statusData);
        centerOnUser(loc);
      }
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleRegionChangeComplete(region: MapRegion) {
    currentRegionRef.current = region;
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

      await addCareAction(pin.latitude, pin.longitude, actionType, device.lat, device.lng, {
        uri: asset.uri,
        type: asset.type,
        fileName: asset.fileName,
      });
      setPendingPin(null);
      await load();
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
            Bulunduğunuz konumun 500m çevresinde son 24 saatte mama/su bırakılmamış.
          </Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        style={styles.map}
        mapType="standard"
        initialRegion={TURKEY_REGION}
        onMapReady={handleMapReady}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={(e) => setPendingPin(e.nativeEvent.coordinate)}
      >
        <Polygon
          coordinates={TURKEY_POLYGON}
          fillColor="rgba(198, 40, 40, 0.35)"
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
          <Circle
            center={{ latitude: myLocation.lat, longitude: myLocation.lng }}
            radius={10}
            fillColor="rgba(25, 118, 210, 0.7)"
            strokeColor="#1976d2"
          />
        )}

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
            Mama/su bıraktığınız konumu işaretlemek için haritaya dokunun.
          </Text>
        </View>
      )}

      <Modal visible={!!pendingPin} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Bu konuma ne bıraktınız?</Text>
            <View style={styles.modalButton}>
              <Button
                title="Mama Bıraktım"
                onPress={() => handleChooseAction('food')}
                disabled={submitting}
              />
            </View>
            <View style={styles.modalButton}>
              <Button
                title="Su Bıraktım"
                onPress={() => handleChooseAction('water')}
                disabled={submitting}
              />
            </View>
            <View style={styles.modalButton}>
              <Button title="İptal" color="#c62828" onPress={() => setPendingPin(null)} />
            </View>
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
  hint: {
    padding: 12,
    backgroundColor: '#fff',
  },
  hintText: { textAlign: 'center', color: '#555' },
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
