import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export interface Coordinates {
  lat: number;
  lng: number;
}

// Test amaçlı: bu hesapla giriş yapıldığında gerçek GPS yerine hep Kadıköy
// konumu döndürülür (uzaktan test edebilmek için). Yalnızca __DEV__ derlemelerinde
// aktiftir, prod derlemede bu dal hiç çalışmaz.
const LOCATION_OVERRIDE_EMAIL = 'oguzpancuk@gmail.com';
const LOCATION_OVERRIDE_COORDS: Coordinates = { lat: 40.9905, lng: 29.0277 }; // Kadıköy, İstanbul

async function getLocationOverride(): Promise<Coordinates | null> {
  if (!__DEV__) return null;
  try {
    const stored = await AsyncStorage.getItem('user');
    if (!stored) return null;
    const user = JSON.parse(stored);
    return user?.email === LOCATION_OVERRIDE_EMAIL ? LOCATION_OVERRIDE_COORDS : null;
  } catch {
    return null;
  }
}

async function requestAndroidPermission(): Promise<boolean> {
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getCurrentLocation(): Promise<Coordinates> {
  const override = await getLocationOverride();
  if (override) {
    return override;
  }

  if (Platform.OS === 'android') {
    const granted = await requestAndroidPermission();
    if (!granted) {
      throw new Error('Konum izni verilmedi');
    }
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => reject(new Error(error.message)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  });
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
