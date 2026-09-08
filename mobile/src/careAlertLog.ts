import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The device-side half of the inbox. Food/water care alerts are decided on
 * the device (careAlerts.ts: the location never reaches the server), so
 * the server inbox cannot list them. careAlerts.ts appends one entry here
 * as it shows the notification, and the inbox screen merges this list with
 * the server's. Same shape on web (web/src/careAlertLog.ts).
 *
 * Storage: AsyncStorage key `careAlertLog`, a JSON array, newest first,
 * capped at MAX_ENTRIES.
 */
export const CARE_ALERT_LOG_KEY = 'careAlertLog';
const MAX_ENTRIES = 50;

export interface CareAlertEntry {
  id: string;
  kind: 'care_alert';
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export async function readCareAlertLog(): Promise<CareAlertEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CARE_ALERT_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeCareAlertLog(entries: CareAlertEntry[]) {
  await AsyncStorage.setItem(CARE_ALERT_LOG_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

/** Called by careAlerts.ts right where the notification is shown. */
export async function appendCareAlert(alert: { title: string; body: string }): Promise<void> {
  const entries = await readCareAlertLog();
  const now = new Date();
  entries.unshift({
    id: `care-${now.getTime()}`,
    kind: 'care_alert',
    title: alert.title,
    body: alert.body,
    createdAt: now.toISOString(),
    readAt: null,
  });
  await writeCareAlertLog(entries);
}

export async function unreadCareAlertCount(): Promise<number> {
  return (await readCareAlertLog()).filter((e) => !e.readAt).length;
}

/** Opening the inbox reads every device alert, like the server rows. */
export async function markCareAlertsRead(): Promise<void> {
  const entries = await readCareAlertLog();
  if (!entries.some((e) => !e.readAt)) return;
  const now = new Date().toISOString();
  await writeCareAlertLog(entries.map((e) => (e.readAt ? e : { ...e, readAt: now })));
}
