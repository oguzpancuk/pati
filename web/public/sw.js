// Bilinçli olarak küçük tutulan service worker: yalnızca uygulama kabuğunu
// önbelleğe alır. API istekleri HİÇ önbelleklenmiyor — bakım verisi bayat
// gösterilirse harita "burada mama var" diye yalan söyler; çevrimdışıyken
// eksik görünmek, yanlış görünmekten iyi.
const CACHE = 'pati-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;

  // Kabuk için önce ağ, düşerse önbellek: güncel sürüm her zaman öncelikli.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit ?? caches.match('/')))
  );
});
