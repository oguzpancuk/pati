import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { check, PERMISSIONS, request, RESULTS } from 'react-native-permissions';

/*
 * The location rule (owner batch 2026-09-14, C2): every user action that
 * needs a location asks the platform first — `ensureLocationPermission`, or
 * `getCurrentLocation`, which starts with it — and the "Konum izni gerekli"
 * alert answers only that request's refusal, never a status read or a stored
 * flag. Lists and background jobs read (`hasLocationPermission`,
 * `getCurrentLocationIfPermitted`) and never prompt.
 *
 * What no app can change: after a permanent refusal (iOS "İzin Verme",
 * Android "bir daha sorma" on 10 and older or a second denial on 11+) the
 * platform answers the request without showing anything, so the alert
 * follows a request the user never saw. Its "Ayarları aç" button is the only
 * way back, and the closest this gets to asking again.
 */

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

/**
 * Android asks for precise and approximate together: on targetSdk 31+ some
 * Android 12 releases ignore a FINE-only request and answer "never ask
 * again" without a dialog — the warning-without-a-prompt this rule exists to
 * end. The answer still needs FINE: a record lands where the user stands and
 * the care circles are 100 m, which an approximate fix (kilometres wide)
 * cannot place. RN
 * leaves already-granted permissions out of the dialog, so after an
 * "Approximate" grant the next request carries FINE alone again — a platform
 * residual this call cannot reach.
 */
async function requestAndroidPermission(): Promise<boolean> {
  const { ACCESS_FINE_LOCATION: FINE, ACCESS_COARSE_LOCATION: COARSE } =
    PermissionsAndroid.PERMISSIONS;
  const answers = await PermissionsAndroid.requestMultiple([FINE, COARSE]);
  return answers[FINE] === PermissionsAndroid.RESULTS.GRANTED;
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
  if (Platform.OS === 'android') {
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }
  return isGranted(await check(IOS_LOCATION));
}

/**
 * The location when the permission is already granted, null otherwise —
 * never shows the system prompt. Lists, the care-alerts job and the map's
 * later focuses use this: the prompt belongs to the moment the user does
 * something that needs a location (an action, or the map's first open;
 * owner decision, 2026-09-07), not to opening a list. It reads the position
 * directly: `getCurrentLocation` starts with a request, and a reader must
 * never make one. A failed fix counts as "no location" too.
 */
export async function getCurrentLocationIfPermitted(): Promise<Coordinates | null> {
  if (!(await hasLocationPermission())) return null;
  try {
    return await readPosition();
  } catch {
    return null;
  }
}

/**
 * The request every location action starts with (the add-animal button and
 * screen, the map's drop tile, and through `getCurrentLocation` the locate
 * button and both saves): resolves when the app may read the location,
 * shows the system prompt right here when the platform still allows one,
 * and throws LocationPermissionError on the answer — refused just now,
 * earlier in Settings, or location services off. Callers answer the error
 * with the Settings alert.
 *
 * iOS reads the status first only to skip a no-op: react-native-permissions'
 * `request()` shows the sheet only while the status is undetermined and
 * otherwise returns that same status, so asking on BLOCKED would change
 * nothing the user sees.
 */
export async function ensureLocationPermission(): Promise<void> {
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

/**
 * A fresh fix for a user action: the permission request comes first on both
 * platforms. On iOS the geolocation library would otherwise raise the sheet
 * itself with its 15 s timeout already running, and a slow answer turned
 * into a timeout error instead of the permission alert.
 */
export async function getCurrentLocation(): Promise<Coordinates> {
  await ensureLocationPermission();
  return readPosition();
}

/** The position read itself — asks nothing; callers decide about the permission. */
function readPosition(): Promise<Coordinates> {
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
