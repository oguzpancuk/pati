import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { check, PERMISSIONS, request, RESULTS } from 'react-native-permissions';

/**
 * The one location failure the user can actually fix: the app lacks the
 * permission. Screens catch this to offer the Settings shortcut instead of a
 * dead-end error message.
 */
export class LocationPermissionError extends Error {
  constructor() {
    super('Konum izni verilmedi');
    this.name = 'LocationPermissionError';
  }
}

/**
 * Permission-denied alert with a direct path to the app's own Settings page.
 * Telling users to find the toggle themselves loses most of them —
 * `Linking.openSettings()` lands on the exact screen with the switch.
 */
export function alertLocationPermission() {
  // The denial can arrive while the system sheet is still animating away,
  // and an alert presented at that instant is dropped by iOS (seen on the
  // simulator: no alert after "İzin Verme"). A short pause lets the sheet
  // finish; every caller gets it, not just the add-animal gate.
  setTimeout(() => {
    Alert.alert(
      'Konum izni gerekli',
      'Bu işlem için konumun gerekli. İzni Ayarlar’dan verebilirsin.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Ayarları aç', onPress: () => Linking.openSettings() },
      ]
    );
  }, 700);
}

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

// iOS has no way to read the location status through the geolocation
// library (its callbacks fire only on a change), and every position request
// with an undetermined status shows the system sheet. react-native-permissions
// reads the status outright, so a screen can ask "may I?" without asking
// the user.
const IOS_LOCATION = PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;

function isGranted(status: string): boolean {
  return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
}

/**
 * The permission the care-alerts job needs. Android asks for the separate
 * background permission (10+); iOS stays at when-in-use: the "always"
 * upgrade cannot be requested through react-native-permissions once
 * when-in-use is granted (its handler answers "blocked" without a sheet —
 * review finding), and the JS timer that drives the checks is suspended in
 * the background anyway, so iOS alerts are foreground-only. Only called
 * once when-in-use exists (useCareAlerts): the first location sheet
 * belongs to a user action, never to app start (owner rule, 2026-09-07).
 */
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
  return hasLocationPermission();
}

/** Whether the app may read the location right now — never shows a prompt. */
export async function hasLocationPermission(): Promise<boolean> {
  if (await getLocationOverride()) return true;
  if (Platform.OS === 'android') {
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }
  return isGranted(await check(IOS_LOCATION));
}

/**
 * The location when the permission is already granted, null otherwise —
 * never shows the system prompt. Lists use this on mount: the prompt
 * belongs to the moment the user does something that needs a location
 * (the map, the add-animal button; owner decision, 2026-09-07), not to
 * opening a list. A failed fix counts as "no location" too.
 */
export async function getCurrentLocationIfPermitted(): Promise<Coordinates | null> {
  if (!(await hasLocationPermission())) return null;
  try {
    return await getCurrentLocation();
  } catch {
    return null;
  }
}

/**
 * Permission preflight for flow entry points (the add-animal button, the
 * map's drop button): resolves when the app may read the location, shows
 * the system prompt right here when the user has not been asked yet, and
 * throws LocationPermissionError when the permission is refused — just
 * now, earlier in Settings, or because location services are off. Callers
 * answer the error with the Settings alert.
 */
export async function ensureLocationPermission(): Promise<void> {
  // Dev override accounts never touch the OS permission (same rule as
  // getCurrentLocation): the flow must stay testable from anywhere.
  if (await getLocationOverride()) return;

  if (Platform.OS === 'android') {
    const granted = await requestAndroidPermission();
    if (!granted) throw new LocationPermissionError();
    return;
  }
  const status = await check(IOS_LOCATION);
  if (isGranted(status)) return;
  // DENIED here means "not asked yet" (BLOCKED is the refusal): the sheet
  // resolves with the answer, no timers or guesses involved.
  if (status === RESULTS.DENIED && isGranted(await request(IOS_LOCATION))) return;
  throw new LocationPermissionError();
}

export async function getCurrentLocation(): Promise<Coordinates> {
  const override = await getLocationOverride();
  if (override) {
    return override;
  }

  if (Platform.OS === 'android') {
    const granted = await requestAndroidPermission();
    if (!granted) {
      throw new LocationPermissionError();
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
      // code 1 = PERMISSION_DENIED (the W3C geolocation error codes).
      (error) =>
        reject(error.code === 1 ? new LocationPermissionError() : new Error(error.message)),
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
