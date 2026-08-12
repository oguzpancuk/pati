import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Button, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Circle, Region as MapRegion } from 'react-native-maps';
import { addCareAction, CareAction, CareStatus, fetchCareActions, fetchCareStatus } from '../api/care';
import { Coordinates, getCurrentLocation } from '../location';

const DEFAULT_REGION: MapRegion = {
  latitude: 39.0,
  longitude: 35.0,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

// react-native-maps'in Heatmap bileşeni yalnızca Google Maps sağlayıcısında
// çalışıyor (iOS'ta Apple Maps kullandığımız için desteklenmiyor). Bunun yerine
// ağırlığa göre saydamlığı değişen daireler çiziyoruz - iki platformda da çalışır.
function weightColor(weight: number) {
  const alpha = 0.15 + Math.min(Math.max(weight, 0), 1) * 0.45;
  return `rgba(255, 152, 0, ${alpha})`;
}

export default function MapScreen() {
  const [actions, setActions] = useState<CareAction[]>([]);
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
      const [actionData, statusData] = await Promise.all([
        fetchCareActions(loc.lat, loc.lng),
        fetchCareStatus(loc.lat, loc.lng),
      ]);
      setActions(actionData);
      setStatus(statusData);
    } catch (err: any) {
      Alert.alert('Konum alınamadı', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleDrop(actionType: 'food' | 'water') {
    if (!location) return;
    setSubmitting(true);
    try {
      await addCareAction(location.lat, location.lng, actionType);
      await load();
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? 'Bir hata oluştu');
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
        style={styles.map}
        initialRegion={
          location
            ? {
                latitude: location.lat,
                longitude: location.lng,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }
            : DEFAULT_REGION
        }
      >
        {actions.map((action) => (
          <Circle
            key={action.id}
            center={{
              latitude: action.location.coordinates[1],
              longitude: action.location.coordinates[0],
            }}
            radius={80}
            fillColor={weightColor(Number(action.weight))}
            strokeColor="transparent"
          />
        ))}
      </MapView>

      <View style={styles.actions}>
        <View style={styles.actionButton}>
          <Button
            title="Mama Bıraktım"
            onPress={() => handleDrop('food')}
            disabled={submitting || !location}
          />
        </View>
        <View style={styles.actionButton}>
          <Button
            title="Su Bıraktım"
            onPress={() => handleDrop('water')}
            disabled={submitting || !location}
          />
        </View>
      </View>

      {loading && (
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
