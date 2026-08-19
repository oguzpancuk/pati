import { useEffect, useRef } from 'react';
import { fetchCareStatus, getToken } from './api';
import { getCurrentLocation } from './location';

/**
 * Bakım uyarıları (mobildeki careAlerts ile aynı kural): kullanıcının 100 m
 * çevresinde mama/su kalmadıysa tarayıcı bildirimi. Konum cihazda kalıyor,
 * sunucuya "kime bildirim gönder" denmiyor.
 *
 * Sınırlar: bildirim yalnızca sekme açıkken/PWA çalışırken (arka plan push
 * yok); iOS Safari'de Notification API yalnızca ana ekrana eklenmiş PWA'da
 * var — desteklenmiyorsa sessizce hiç sorulmaz. Konum alınamıyorsa (http
 * adresi) da atlanır; hata gösterilmez, arka plan işi.
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
  const loc = await getCurrentLocation();
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
        // konum/ağ hatası: sessizce geç
      } finally {
        running.current = false;
      }
    }

    async function start() {
      // İzin yalnızca bir kez sorulur; reddedildiyse tekrar sormayız.
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
