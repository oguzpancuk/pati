import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { checkCareAndNotify, requestNotificationPermission } from './careAlerts';
import { hasLocationPermission, requestBackgroundLocationPermission } from './location';

// The check interval. iOS suspends the app in the background after a while,
// so this timer is not guaranteed; a check also runs when the app
// foregrounds, to make up for missed windows.
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function useCareAlerts(enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    async function runCheck() {
      // Don't start overlapping checks (the timer and the app foregrounding
      // can coincide).
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await checkCareAndNotify();
      } catch {
        // Location/network errors skip the notification flow silently;
        // showing the user an error for this background job would be wrong.
      } finally {
        runningRef.current = false;
      }
    }

    async function start() {
      const granted = await requestNotificationPermission();
      if (!granted || cancelled) return;
      // The first location sheet belongs to a user action (the map, the
      // add-animal button), never to app start: without the when-in-use
      // permission the alerts wait for a later launch. Only Android's
      // separate background permission is asked here.
      if (!(await hasLocationPermission()) || cancelled) return;
      await requestBackgroundLocationPermission();
      if (cancelled) return;

      runCheck();
      timerRef.current = setInterval(runCheck, CHECK_INTERVAL_MS);
    }

    function handleAppStateChange(state: AppStateStatus) {
      if (state === 'active') runCheck();
    }

    start();
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      cancelled = true;
      subscription.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled]);
}
