import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';
import { fetchCareStatus } from './api/care';
import { getCurrentLocation } from './location';

const CHANNEL_ID = 'care-alerts';
// Aynı bölge için sürekli bildirim yağmasın: bir uyarı gönderildikten sonra bu
// süre boyunca aynı tür için tekrar gönderilmiyor.
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const LAST_ALERT_KEY = 'careAlerts:lastSentAt';

let channelReady = false;

async function ensureChannel() {
  if (channelReady) return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Bakım uyarıları',
    importance: AndroidImportance.DEFAULT,
  });
  channelReady = true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

async function readCooldown(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ALERT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeCooldown(map: Record<string, number>) {
  await AsyncStorage.setItem(LAST_ALERT_KEY, JSON.stringify(map));
}

/**
 * Kullanıcının bulunduğu yerin yakın çevresinde mama/su kalmadıysa (yeşil alan
 * solup bittiyse) cihaz üzerinde bir bildirim gösterir. Yarıçapı sunucu
 * belirliyor ve haritadaki yeşil dairenin yarıçapıyla aynı: yeşil dairenin
 * dışındaysa uyarı gelir, içindeyse gelmez.
 *
 * Sunucuya "bu kullanıcıya bildirim gönder" demek yerine cihazın kendi konumunu
 * kontrol etmesinin sebebi: konum sürekli sunucuya gönderilmediği için sunucu
 * kimin nerede olduğunu bilmiyor. Bu yaklaşım konum verisini cihazda tutuyor.
 */
export async function checkCareAndNotify(): Promise<boolean> {
  const token = await AsyncStorage.getItem('token');
  if (!token) return false;

  const location = await getCurrentLocation();
  const [foodStatus, waterStatus] = await Promise.all([
    fetchCareStatus(location.lat, location.lng, 'food'),
    fetchCareStatus(location.lat, location.lng, 'water'),
  ]);

  const missing: string[] = [];
  if (foodStatus.needsAttention) missing.push('mama');
  if (waterStatus.needsAttention) missing.push('su');
  if (missing.length === 0) return false;

  const cooldownKey = missing.join('+');
  const cooldowns = await readCooldown();
  const now = Date.now();
  if (cooldowns[cooldownKey] && now - cooldowns[cooldownKey] < COOLDOWN_MS) {
    return false;
  }

  await ensureChannel();
  await notifee.displayNotification({
    title: 'Bu bölgede bakım gerekiyor',
    body: `Bulunduğunuz konumun ${foodStatus.radiusMeters}m çevresinde ${missing.join(
      ' ve '
    )} bırakılmamış.`,
    android: { channelId: CHANNEL_ID, pressAction: { id: 'default' } },
  });

  await writeCooldown({ ...cooldowns, [cooldownKey]: now });
  return true;
}
