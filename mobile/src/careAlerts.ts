import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';
import { fetchCareStatus } from './api/care';
import { getCurrentLocation } from './location';

const CHANNEL_ID = 'care-alerts';
// No notification storm for the same area: after one alert, the same type
// isn't sent again for this long.
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
 * Shows an on-device notification when no food/water remains near the user
 * (the green area has faded out). The radius is set by the server and equals
 * the green circle on the map: outside the green circle you get the alert,
 * inside you don't.
 *
 * The device checks its own location instead of the server deciding "notify
 * this user" because the location is never streamed to the server — it has
 * no idea who is where. This approach keeps location data on the device.
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
