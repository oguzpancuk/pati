/*
 * Ana ekrana eklenen kısayolun çevrimdışı da açılabilmesi için kabuk (HTML,
 * manifest, ikonlar) önbelleğe alınıyor. API istekleri hiç ele alınmıyor —
 * mama/su durumu her zaman canlı gelmeli, bayat "yakınında su var" demek
 * hiç dememekten kötü.
 *
 * Sürüm adı değişince eski önbellek siliniyor; kabuk dosyalarını değiştirince
 * bunu artırın, aksi halde eski sayfa görünmeye devam eder.
 */
const CACHE = 'pati-shell-v1';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // Kabuk için "önce ağ, düşerse önbellek": güncel sayfa gelir, ağ yoksa
  // eldeki kopya açılır.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/')))
  );
});
