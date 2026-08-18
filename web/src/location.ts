export interface Coordinates {
  lat: number;
  lng: number;
}

// Kadıköy: konum alınamadığında (izin yok / masaüstü) harita boş Türkiye
// yerine seed verisinin olduğu bölgeye açılsın diye.
export const FALLBACK_CENTER: Coordinates = { lat: 40.9905, lng: 29.0277 };

export function getCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Bu tarayıcı konum desteklemiyor'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}
