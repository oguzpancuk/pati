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
 *
 * What a reload can change (owner, 2026-09-15, item L): WebKit remembers a
 * refusal for the life of the page, not beyond it — after "İzin Verme"
 * every later request in that page is refused without a prompt, while the
 * first request after a reload prompts again (seen in iOS 26 Safari). A
 * dismissed Chrome prompt also comes back on a later request. So a refused
 * action's warning offers to ask again (`retryLocationByReload`): the page
 * reloads straight back into the same action, whose request can prompt.
 * Only a refusal of that retry drops the offer and names the settings.
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

/** An action a refused request can be retried into after a reload. */
export type LocationRetryIntent =
  | { action: 'drop'; type: 'food' | 'water' }
  | { action: 'locate' }
  | { action: 'add-animal' };

export const LOCATION_RETRY_LABEL = 'Konum iznini tekrar iste';

const RETRY_KEY = 'pati.locationRetry';
// A reload lands within seconds. An older intent was never taken by the page
// it was meant for (a lapsed session sent the reload to the login screen,
// say) and must not run its action on a later visit nobody tapped for.
const RETRY_MAX_AGE_MS = 60_000;

/**
 * The warning's "ask again": stores the action and reloads, so the page
 * comes back running it with a request the browser can prompt for. Only a
 * user's tap may call this — nothing reloads on its own, and the retry's
 * own refusal offers no second one (`describeLocationRefusal`), so one tap
 * is at most one reload. Always a reload, even where the Permissions API
 * says 'granted': a new page is what clears WebKit's in-page refusal, and
 * whether a grant made in the settings meanwhile lifts it without one is
 * not known.
 */
export function retryLocationByReload(intent: LocationRetryIntent): void {
  try {
    sessionStorage.setItem(
      RETRY_KEY,
      JSON.stringify({ ...intent, path: window.location.pathname, at: Date.now() })
    );
  } catch {
    // Storage blocked: the page still reloads, so the user's next tap of
    // the action can prompt — it just does not reopen by itself.
  }
  window.location.reload();
}

/**
 * The action a retry reloaded this page for, at most once: the stored intent
 * is removed as it is read, whatever it held, so no later mount repeats the
 * action without a tap. It counts only on the path it was stored from and
 * while fresh; anything parsed from storage is checked field by field.
 */
export function takeLocationRetry(): LocationRetryIntent | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(RETRY_KEY);
    sessionStorage.removeItem(RETRY_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof stored !== 'object' || stored === null) return null;
  const { action, type, path, at } = stored as Record<string, unknown>;
  if (path !== window.location.pathname) return null;
  const age = typeof at === 'number' ? Date.now() - at : NaN;
  if (!(age >= 0 && age <= RETRY_MAX_AGE_MS)) return null;
  if (action === 'drop') {
    return type === 'food' || type === 'water' ? { action, type } : null;
  }
  if (action === 'locate' || action === 'add-animal') return { action };
  return null;
}

/**
 * Where the permission is turned back on, for the refusal a retry could not
 * change. The user agent only picks the text: iOS and iPadOS Safari (an
 * iPad asks for the desktop site, so it shows as a Mac with touch points —
 * a desktop Chrome or Firefox emulating touch does too, hence their names)
 * keep it in the system settings and the page menu; other browsers, and the
 * other browser apps on iOS, in the address bar's site controls.
 */
function locationSettingsSteps(): string {
  const ua = navigator.userAgent;
  const appleTouch =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Firefox/.test(ua);
  if (appleTouch && !otherBrowser) {
    return (
      'Açmak için: Ayarlar › Gizlilik ve Güvenlik › Konum Servisleri › Safari Web Siteleri, ' +
      "ve Safari'de aA › Web Sitesi Ayarları › Konum."
    );
  }
  return 'Adres çubuğundaki kilit/ayar simgesinden bu site için konum iznini aç.';
}

export interface LocationRefusal {
  /** The warning, the action's own advice at the end. */
  text: string;
  /** Whether the warning offers `retryLocationByReload`. */
  canRetry: boolean;
}

/**
 * The warning for a request's failure, or null when it is not one the user
 * has to fix (`isPermissionFailure`). Only a refusal is offered a retry: an
 * http origin or a browser without geolocation stays so after a reload.
 * `retried` says the request is the one a retry reloaded for — its refusal
 * names the settings and offers nothing more. A new tap of the action is a
 * new attempt (`retried` false) and gets the offer again.
 */
export function describeLocationRefusal(
  err: unknown,
  advice: string,
  retried: boolean
): LocationRefusal | null {
  if (!isPermissionFailure(err)) return null;
  const refused = err instanceof LocationError && err.reason === 'denied';
  const reason =
    refused && retried
      ? `Konum izni yine verilmedi. ${locationSettingsSteps()}`
      : describeLocationError(err);
  return {
    text: advice ? `${reason} ${advice}` : reason,
    canRetry: refused && !retried,
  };
}
