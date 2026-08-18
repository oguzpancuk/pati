import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { checkCareAndNotify, requestNotificationPermission } from './careAlerts';
import { requestBackgroundLocationPermission } from './location';

// Kontrol aralığı. Arka planda iOS uygulamayı bir süre sonra askıya aldığı için
// bu zamanlayıcı garanti değil; uygulama öne geldiğinde de bir kontrol yapılıyor
// ki kaçırılan pencereler telafi edilsin.
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function useCareAlerts(enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    async function runCheck() {
      // Aynı anda birden fazla kontrol başlamasın (zamanlayıcı + uygulamanın
      // öne gelmesi aynı ana denk gelebiliyor).
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await checkCareAndNotify();
      } catch {
        // Konum/ağ hatası bildirim akışını sessizce atlar; kullanıcıya bu
        // arka plan işi için hata göstermek doğru olmaz.
      } finally {
        runningRef.current = false;
      }
    }

    async function start() {
      const granted = await requestNotificationPermission();
      if (!granted || cancelled) return;
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
