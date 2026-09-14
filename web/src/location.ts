/*
 * The location rule (owner batch 2026-09-14, C2; mobile parity): every user
 * action that needs a location calls `getCurrentLocation` — the browser's
 * only request, the one call that can show its prompt — and the warning
 * comes only from that call's answer, classified by `isPermissionFailure`.
 * `navigator.permissions.query` and the session flag below never decide an
 * action; they only feed readers (lists, care alerts), which never prompt.
 * The map asks on every open (a granted page sees no prompt), unlike
 * mobile's once per app session: a read-only return would trust the
 * Permissions API, which a browser may leave at 'prompt' after a grant
 * (see MapPage).
 *
 * What no page can change: after "Engelle" (or Chrome's automatic block
 * after repeated dismissals) the browser answers the request with a refusal
 * and shows nothing, so the warning follows a request the user never saw.
 * A page cannot open browser settings either; the warning's text guidance
 * is the closest equivalent to mobile's "Ayarları aç".
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export type LocationFailure = 'insecure' | 'denied' | 'unavailable' | 'unsupported';

export class LocationError extends Error {
  reason: LocationFailure;
  constructor(reason: LocationFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Requests the location from the browser. On rejection the *reason* is
 * reported too; the most common trap is an http origin: the browser rejects
 * without ever asking in an insecure context (`http://<ip>:5175` on the same
 * Wi-Fi does this). Presenting that as "grant permission" misled users —
 * there is no permission they could grant, https is required.
 */
export function getCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new LocationError('unsupported', 'Bu tarayıcı konum desteklemiyor.'));
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject(
        new LocationError(
          'insecure',
          'Tarayıcı http adresinden konum vermiyor; https (tünel) adresiyle aç.'
        )
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        rememberGrant(true);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          rememberGrant(false);
          reject(
            new LocationError(
              'denied',
              'Konum izni verilmedi. Tarayıcı ayarlarından bu siteye konum izni verebilirsin.'
            )
          );
        } else {
          reject(new LocationError('unavailable', 'Konum bulunamadı, tekrar dene.'));
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

// Safari before 16 has no permission query for geolocation, so the site
// remembers the last answer it saw — for this tab's session only: iOS
// Safari's "Allow Once" and a grant revoked in Settings both outlive a
// stored flag, and a stale "granted" would make the list prompt on entry
// (review finding). The Permissions API is the source everywhere else. The
// flag only ever says "may read"; no action consults it.
const GRANT_KEY = 'pati.locationGranted';

function rememberGrant(granted: boolean) {
  try {
    if (granted) sessionStorage.setItem(GRANT_KEY, '1');
    else sessionStorage.removeItem(GRANT_KEY);
  } catch {
    // Private mode / storage blocked: the list just stays newest-first.
  }
}

/**
 * A failure the user has to fix before the location can come: denied, an
 * insecure origin, no geolocation at all. Only these warn; a transient one
 * (no fix yet) is the save step's problem. Every action classifies its
 * answer with this, so they all warn for the same reasons.
 */
export function isPermissionFailure(err: unknown): boolean {
  return (
    err instanceof LocationError &&
    (err.reason === 'denied' || err.reason === 'insecure' || err.reason === 'unsupported')
  );
}

/** Whether the site may read the location right now — never shows a prompt. */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state === 'granted';
  } catch {
    // No Permissions API, or geolocation not queryable (Safari).
  }
  try {
    return sessionStorage.getItem(GRANT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The location when the permission is already granted, null otherwise —
 * never shows the browser's prompt. Lists and care alerts use this: the
 * prompt belongs to the moment the user does something that needs a
 * location (an action, or opening the map; owner decision, 2026-09-07,
 * mobile parity), not to opening a list. A failed fix counts as "no
 * location" too. It trusts `hasLocationPermission`, so it can miss a grant
 * the Permissions API does not report — acceptable for a list, not for the
 * map.
 */
export async function getCurrentLocationIfPermitted(): Promise<Coordinates | null> {
  if (!(await hasLocationPermission())) return null;
  try {
    return await getCurrentLocation();
  } catch {
    return null;
  }
}

export function describeLocationError(err: unknown): string {
  if (err instanceof LocationError) return err.message;
  return 'Konum alınamadı.';
}
