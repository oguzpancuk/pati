import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';
import { fetchCareStatus } from './api/care';
import { appendCareAlert } from './careAlertLog';
import { getCurrentLocationIfPermitted } from './location';

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
 * The device decides instead of the server deciding "notify this user":
 * the server is asked "is there food/water around THIS point", answers,
 * and keeps nothing — it never builds a picture of who is where, and it
 * is not asked at all unless the user has agreed to be notified.
 */
export async function checkCareAndNotify(): Promise<boolean> {
  const token = await AsyncStorage.getItem('token');
  if (!token) return false;

  // Without the notification permission there is nobody to tell, so there
  // is nothing to ask. `start()` already bails out when the permission is
  // refused, but the AppState listener it registers does not — so every
  // foreground transition used to send this user's coordinates for an
  // alert that could never be shown. Web has had this guard; mobile did
  // not, which made the privacy notice's "turning alerts off stops the
  // query" false on the primary client (review finding).
  const settings = await notifee.getNotificationSettings();
  if (settings.authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
      settings.authorizationStatus !== AuthorizationStatus.PROVISIONAL) {
    return false;
  }

  // A background job never shows the permission sheet (owner rule,
  // 2026-09-07): without the permission there is simply nothing to check.
  const location = await getCurrentLocationIfPermitted();
  if (!location) return false;
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
  const title = 'Bu bölgede bakım gerekiyor';
  const body = `Bulunduğunuz konumun ${foodStatus.radiusMeters}m çevresinde ${missing.join(
    ' ve '
  )} bırakılmamış.`;
  await notifee.displayNotification({
    title,
    body,
    android: { channelId: CHANNEL_ID, pressAction: { id: 'default' } },
  });
  // The inbox lists this alert too; it is decided here, so it is logged here.
  await appendCareAlert({ title, body });

  await writeCooldown({ ...cooldowns, [cooldownKey]: now });
  return true;
}
