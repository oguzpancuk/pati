import { useEffect, useRef } from 'react';
import { fetchCareStatus, getToken } from './api';
import { getCurrentLocationIfPermitted } from './location';

/**
 * Care alerts (same rule as mobile's careAlerts): a browser notification
 * when no food/water remains within 100 m of the user. The location stays on
 * the device; the server is never told "who to notify".
 *
 * Limits: notifications only while the tab is open / the PWA is running (no
 * background push); on iOS Safari the Notification API only exists in a PWA
 * added to the home screen — when unsupported we silently never ask. Also
 * skipped when the location can't be read (http origin); no error shown,
 * it's a background job.
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const LAST_KEY = 'careAlerts:lastSentAt';

function readCooldown(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || '{}');
  } catch {
    return {};
  }
}

export async function checkCareAndNotify(): Promise<boolean> {
  if (!getToken() || typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  // A background job never shows the browser's prompt (owner rule,
  // 2026-09-07, mobile parity): without the permission there is nothing to check.
  const loc = await getCurrentLocationIfPermitted();
  if (!loc) return false;
  const [food, water] = await Promise.all([
    fetchCareStatus(loc.lat, loc.lng, 'food'),
    fetchCareStatus(loc.lat, loc.lng, 'water'),
  ]);
  const missing: string[] = [];
  if (food.needsAttention) missing.push('mama');
  if (water.needsAttention) missing.push('su');
  if (missing.length === 0) return false;

  const key = missing.join('+');
  const cooldowns = readCooldown();
  const now = Date.now();
  if (cooldowns[key] && now - cooldowns[key] < COOLDOWN_MS) return false;

  new Notification('Bu bölgede bakım gerekiyor', {
    body: `Bulunduğun konumun ${food.radiusMeters} m çevresinde ${missing.join(' ve ')} bırakılmamış.`,
    icon: '/icons/icon-192.png',
    tag: 'care-alert',
  });
  localStorage.setItem(LAST_KEY, JSON.stringify({ ...cooldowns, [key]: now }));
  return true;
}

export function useCareAlerts(enabled: boolean) {
  const running = useRef(false);
  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined') return undefined;
    let cancelled = false;
    let timer: number | null = null;

    async function run() {
      if (running.current) return;
      running.current = true;
      try {
        await checkCareAndNotify();
      } catch {
        // location/network error: skip silently
      } finally {
        running.current = false;
      }
    }

    async function start() {
      // Permission is asked once; if denied we don't ask again.
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {
          return;
        }
      }
      if (cancelled || Notification.permission !== 'granted') return;
      run();
      timer = window.setInterval(run, CHECK_INTERVAL_MS);
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    start();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [enabled]);
}
