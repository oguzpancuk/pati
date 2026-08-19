/**
 * Rehber verisi için ilçelerin mahalle merkezlerini OpenStreetMap'ten
 * (Overpass) bir kez çekip data/mahalleler.json'a yazar. Seed bu dosyayı
 * kullanıyor; dosya depoda, script yalnızca ilçe listesi değişince koşar.
 *
 *   node scripts/fetch-mahalleler.mjs
 *
 * Neden: rehber kayıtları ilçe merkezinde tek leke gibi yığılıyordu (±900 m
 * saçılım); rastgele geniş saçılım ise kıyı ilçelerinde denize düşüyor.
 * Gerçek mahalle noktaları hem karada hem ilçeye yayılmış.
 *
 * İlçe başına sorgu yerine şehir başına tek kutu sorgusu (3 istek): Overpass
 * yavaş/kısıtlı; noktalar sonra en yakın ilçe merkezine (≤ 6 km) atanıyor.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const seed = readFileSync(join(here, 'seed-rehber.js'), 'utf8');
const districts = [...seed.matchAll(/city: '([^']+)', name: '([^']+)', lat: ([\d.]+), lng: ([\d.]+)/g)].map(
  (m) => ({ city: m[1], name: m[2], lat: Number(m[3]), lng: Number(m[4]) })
);

// Şehir kutuları ilçe merkezlerinden türetiliyor (+ kenar payı).
const cities = {};
for (const d of districts) {
  const c = (cities[d.city] ??= { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 });
  c.minLat = Math.min(c.minLat, d.lat - 0.06);
  c.maxLat = Math.max(c.maxLat, d.lat + 0.06);
  c.minLng = Math.min(c.minLng, d.lng - 0.08);
  c.maxLng = Math.max(c.maxLng, d.lng + 0.08);
}

const km = (a, b) => {
  const dy = (a.lat - b.lat) * 111;
  const dx = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

const out = Object.fromEntries(districts.map((d) => [`${d.city}/${d.name}`, []]));
for (const [city, b] of Object.entries(cities)) {
  const q = `[out:json][timeout:120];node["place"~"neighbourhood|quarter|suburb"](${b.minLat},${b.minLng},${b.maxLat},${b.maxLng});out;`;
  // Birden çok ayna: ana sunucu yoğunken kumi/lz4 çoğu zaman yanıt veriyor.
  const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
  ];
  let json = null;
  for (let attempt = 1; attempt <= 3 && !json; attempt += 1) {
    const base = MIRRORS[(attempt - 1) % MIRRORS.length];
    try {
      // User-Agent şart: kimliksiz istekler 406/kesik bağlantı alıyor.
      const res = await fetch(base + '?data=' + encodeURIComponent(q), {
        headers: { 'User-Agent': 'pati-seed/1.0 (github.com/oguzpancuk/Pati)' },
        signal: AbortSignal.timeout(200000),
      });
      if (res.status === 200) json = await res.json();
      else console.log(`${city}: HTTP ${res.status}, deneme ${attempt}`);
    } catch (err) {
      console.log(`${city}: ${err.message}, deneme ${attempt}`);
    }
    if (!json) await new Promise((r) => setTimeout(r, 10000 * attempt));
  }
  const nodes = (json?.elements || []).filter((e) => e.tags?.name);
  let assigned = 0;
  for (const n of nodes) {
    const p = { lat: n.lat, lng: n.lon };
    let best = null;
    for (const d of districts.filter((x) => x.city === city)) {
      const dist = km(p, d);
      if (dist <= 6 && (!best || dist < best.dist)) best = { d, dist };
    }
    if (!best) continue;
    out[`${best.d.city}/${best.d.name}`].push({ name: n.tags.name, lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) });
    assigned += 1;
  }
  console.log(`${city}: ${nodes.length} nokta, ${assigned} ilçeye atandı`);
}
for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${v.length}`);
writeFileSync(join(here, 'data', 'mahalleler.json'), JSON.stringify(out, null, 1));
console.log('yazıldı: scripts/data/mahalleler.json');
