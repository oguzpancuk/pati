/**
 * The device-side half of the inbox (mobile parity: mobile/src/careAlertLog.ts).
 * Food/water care alerts are decided in the browser (careAlerts.ts: the
 * location never reaches the server), so the server inbox cannot list
 * them. careAlerts.ts appends one entry here as it shows the notification,
 * and the inbox page merges this list with the server's.
 *
 * Storage: localStorage key `pati-care-alert-log`, a JSON array, newest
 * first, capped at MAX_ENTRIES.
 */
export const CARE_ALERT_LOG_KEY = 'pati-care-alert-log';
const MAX_ENTRIES = 50;

export interface CareAlertEntry {
  id: string;
  kind: 'care_alert';
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export function readCareAlertLog(): CareAlertEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CARE_ALERT_LOG_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCareAlertLog(entries: CareAlertEntry[]) {
  localStorage.setItem(CARE_ALERT_LOG_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

/** Called by careAlerts.ts right where the notification is shown. */
export function appendCareAlert(alert: { title: string; body: string }) {
  const entries = readCareAlertLog();
  const now = new Date();
  entries.unshift({
    id: `care-${now.getTime()}`,
    kind: 'care_alert',
    title: alert.title,
    body: alert.body,
    createdAt: now.toISOString(),
    readAt: null,
  });
  writeCareAlertLog(entries);
}

export function unreadCareAlertCount(): number {
  return readCareAlertLog().filter((e) => !e.readAt).length;
}

/** Opening the inbox reads every device alert, like the server rows. */
export function markCareAlertsRead() {
  const entries = readCareAlertLog();
  if (!entries.some((e) => !e.readAt)) return;
  const now = new Date().toISOString();
  writeCareAlertLog(entries.map((e) => (e.readAt ? e : { ...e, readAt: now })));
}
