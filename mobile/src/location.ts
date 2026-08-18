import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export interface Coordinates {
  lat: number;
  lng: number;
}

// Demo verisinin merkezi (bkz. backend/scripts/seed-demo.js). Konum override'ları
// buranın çevresine dağıtılıyor ki seed'lenen hayvanlar ve bakım noktaları
// haritada görünsün.
const KADIKOY = { lat: 40.9905, lng: 29.0277 }; // Kadıköy, Rıhtım

// Test amaçlı: bu hesaplarla giriş yapıldığında gerçek GPS yerine hep Kadıköy
// civarında sabit bir konum döndürülür (uzaktan test edebilmek için). İki hesap
// birbirine yakın ama aynı noktada değil; böylece iki kullanıcıyla mükerrer
// hayvan tespiti ve 20m yakınlık kontrolü gerçekçi şekilde denenebiliyor.
// Yalnızca __DEV__ derlemelerinde aktiftir, prod derlemede bu dal hiç çalışmaz.
const LOCATION_OVERRIDES: Record<string, Coordinates> = {
  'oguzpancuk@gmail.com': KADIKOY,
  'sumeyyeayan@gmail.com': { lat: 40.9892, lng: 29.0301 }, // Kadıköy, Bahariye (~250m ötesi)
};

// Demo hesapları (test1@stray.test … test100@stray.test) de override kapsamında:
// aksi halde demo veriyle test ederken cihazın gerçek konumu kullanılıyor ve
// Kadıköy'e seed'lenmiş hayvanlar/bakım noktaları haritada hiç görünmüyor.
const DEMO_EMAIL_PATTERN = /^test(\d+)@stray\.test$/i;

/**
 * Demo hesabın numarasından sabit ama birbirinden farklı bir konum üretir.
 * Aynı hesap her açılışta aynı yerde durur (rastgele olsaydı hesap her
 * girişte başka yere ışınlanırdı), farklı hesaplar ise üst üste binmez —
 * altın açı ile dağıtıldıkları için birbirlerine yakın ama ayrı noktalarda.
 */
function demoLocationFor(email: string): Coordinates | null {
  const match = DEMO_EMAIL_PATTERN.exec(email);
  if (!match) return null;

  const n = Number(match[1]);
  const angle = (n * 137.5 * Math.PI) / 180;
  const radiusDeg = 0.0008 + (n % 7) * 0.0004; // merkeze ~90m - 400m arası
  return {
    lat: KADIKOY.lat + radiusDeg * Math.sin(angle),
    // Boylam dereceleri enleme göre daralıyor; aynı metrik mesafe için düzeltme.
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

// Uygulama arka plandayken de konum kontrolü yapabilmek için "her zaman" iznini
// ister. Reddedilirse uygulama çalışmaya devam eder; yalnızca arka plan
// bildirimleri gelmez (ön planda kontrol yine yapılır).
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const fine = await requestAndroidPermission();
    if (!fine) return false;
    // Android 10+ arka plan konumu ayrı bir izin olarak ister.
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
