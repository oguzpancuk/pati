export interface Coordinates {
  lat: number;
  lng: number;
}

// Kadıköy: when no location is available (no permission / desktop), the map
// opens on the seeded area instead of an empty Turkey.
export const FALLBACK_CENTER: Coordinates = { lat: 40.9905, lng: 29.0277 };

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
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
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

export function describeLocationError(err: unknown): string {
  if (err instanceof LocationError) return err.message;
  return 'Konum alınamadı.';
}
