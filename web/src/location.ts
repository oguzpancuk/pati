export interface Coordinates {
  lat: number;
  lng: number;
}

// Kadıköy: konum alınamadığında (izin yok / masaüstü) harita boş Türkiye
// yerine seed verisinin olduğu bölgeye açılsın diye.
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
 * Tarayıcıdan konum ister. Reddedilirse *neden* de söylenir; en sık takılınan
 * durum http adresi: tarayıcı güvensiz bağlamda konumu hiç sormadan reddediyor
 * (aynı Wi‑Fi'daki `http://<ip>:5175` böyle). Bunu "izin ver" diye göstermek
 * kullanıcıyı yanıltıyordu — verebileceği bir izin yok, https gerekiyor.
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
