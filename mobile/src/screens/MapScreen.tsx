import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Button, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, {
  Circle,
  LatLng,
  Marker,
  Polygon,
  Region as MapRegion,
} from 'react-native-maps';
import { launchCamera } from 'react-native-image-picker';
import {
  addCareAction,
  CareAction,
  CareStatus,
  fetchCareActionsInBounds,
  fetchCareStatus,
} from '../api/care';
import { distanceMeters, getCurrentLocation } from '../location';

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
  const [actions, setActions] = useState<CareAction[]>([]);
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [pendingPin, setPendingPin] = useState<PendingPin>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actionData, loc] = await Promise.all([
        fetchCareActionsInBounds(TURKEY_BOUNDS),
        getCurrentLocation().catch(() => null),
      ]);
      setActions(actionData);
      if (loc) {
        const statusData = await fetchCareStatus(loc.lat, loc.lng);
        setStatus(statusData);
      }
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleRegionChangeComplete(region: MapRegion) {
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

    const photoResult = await launchCamera({ mediaType: 'photo', saveToPhotos: false });
    if (photoResult.didCancel || !photoResult.assets?.[0]?.uri) {
      return;
    }
    const asset = photoResult.assets[0];

    setSubmitting(true);
    try {
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
        uri: asset.uri!,
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

        {pendingPin && <Marker coordinate={pendingPin} pinColor="#1976d2" />}
      </MapView>

      {pendingPin ? (
        <View style={styles.actions}>
          <View style={styles.actionButton}>
            <Button
              title="Mama Bıraktım"
              onPress={() => handleChooseAction('food')}
              disabled={submitting}
            />
          </View>
          <View style={styles.actionButton}>
            <Button
              title="Su Bıraktım"
              onPress={() => handleChooseAction('water')}
              disabled={submitting}
            />
          </View>
          <View style={styles.actionButton}>
            <Button title="İptal" color="#c62828" onPress={() => setPendingPin(null)} />
          </View>
        </View>
      ) : (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            Mama/su bıraktığınız konumu işaretlemek için haritaya dokunun.
          </Text>
        </View>
      )}

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
  actions: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    backgroundColor: '#fff',
  },
  actionButton: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
