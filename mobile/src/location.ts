import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export interface Coordinates {
  lat: number;
  lng: number;
}

// The demo data's center (see backend/scripts/seed-demo.js). Location
// overrides are scattered around here so the seeded animals and care points
// show up on the map.
const KADIKOY = { lat: 40.9905, lng: 29.0277 }; // Kadıköy, Rıhtım

// For testing: signing in with these accounts always returns a fixed
// location around Kadıköy instead of real GPS (to allow remote testing). The
// two accounts are near each other but not at the same point, so duplicate
// animal detection and the 20 m proximity check can be tried realistically
// with two users. Active only in __DEV__ builds; this branch never runs in
// production.
const LOCATION_OVERRIDES: Record<string, Coordinates> = {
  'oguzpancuk@gmail.com': KADIKOY,
  'sumeyyeayan@gmail.com': { lat: 40.9892, lng: 29.0301 }, // Kadıköy, Bahariye (~250 m away)
};

// Demo accounts (test1@stray.test … test100@stray.test) are overridden too:
// otherwise testing with demo data uses the device's real location and the
// animals/care points seeded in Kadıköy never appear on the map.
const DEMO_EMAIL_PATTERN = /^test(\d+)@stray\.test$/i;

/**
 * Derives a fixed but distinct location from the demo account's number. The
 * same account stands in the same spot on every launch (random would
 * teleport it on each sign-in), and different accounts never overlap —
 * distributed by the golden angle, close together but at separate points.
 */
function demoLocationFor(email: string): Coordinates | null {
  const match = DEMO_EMAIL_PATTERN.exec(email);
  if (!match) return null;

  const n = Number(match[1]);
  const angle = (n * 137.5 * Math.PI) / 180;
  const radiusDeg = 0.0008 + (n % 7) * 0.0004; // ~90-400 m from the center
  return {
    lat: KADIKOY.lat + radiusDeg * Math.sin(angle),
    // Longitude degrees shrink with latitude; corrected for equal metric distance.
    lng: KADIKOY.lng + (radiusDeg * Math.cos(angle)) / Math.cos((KADIKOY.lat * Math.PI) / 180),
  };
}

async function getLocationOverride(): Promise<Coordinates | null> {
  if (!__DEV__) return null;
  try {
    const stored = await AsyncStorage.getItem('user');
    if (!stored) return null;
    const email = JSON.parse(stored)?.email;
    if (typeof email !== 'string') return null;
    return LOCATION_OVERRIDES[email] ?? demoLocationFor(email);
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

// Requests the "always" permission so location checks can run in the
// background too. If denied, the app keeps working; only background
// notifications stop (foreground checks still happen).
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const fine = await requestAndroidPermission();
    if (!fine) return false;
    // Android 10+ asks for background location as a separate permission.
    const permission = (PermissionsAndroid.PERMISSIONS as Record<string, string>)
      .ACCESS_BACKGROUND_LOCATION;
    if (!permission) return true;
    const granted = await PermissionsAndroid.request(permission as never);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  return new Promise((resolve) => {
    Geolocation.requestAuthorization(
      () => resolve(true),
      () => resolve(false)
    );
  });
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
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
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
