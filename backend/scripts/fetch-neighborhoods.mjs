/**
 * Fetches district neighborhood centers from OpenStreetMap (Overpass) once
 * for the guide data and writes them to data/neighborhoods.json. The seed
 * uses that file; it lives in the repo and this script only runs when the
 * district list changes.
 *
 *   node scripts/fetch-neighborhoods.mjs
 *
 * Why: guide records used to pile up as one blot at the district center
 * (±900 m spread), while a wide random spread landed in the sea in coastal
 * districts. Real neighborhood points are both on land and spread across
 * the district.
 *
 * One bounding-box query per city instead of per district (3 requests):
 * Overpass is slow/throttled; points are then assigned to the nearest
 * district center (≤ 6 km).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Parse the district list out of the seed source; the first anchor of each
// district acts as its center. (Importing the seed would drag in dotenv and
// the db pool.)
const seed = readFileSync(join(here, 'seed-guides.js'), 'utf8');
const districts = [
  ...seed.matchAll(
    /city: '([^']+)',\s*name: '([^']+)',\s*anchors: \[\s*\[([\d.]+), ([\d.]+)/g
  ),
].map((m) => ({ city: m[1], name: m[2], lat: Number(m[3]), lng: Number(m[4]) }));

// City bounding boxes derive from district centers (+ margin).
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
  // Multiple mirrors: kumi/lz4 usually answer while the main server is busy.
  const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
  ];
  let json = null;
  for (let attempt = 1; attempt <= 3 && !json; attempt += 1) {
    const base = MIRRORS[(attempt - 1) % MIRRORS.length];
    try {
      // The User-Agent is required: anonymous requests get 406 / dropped connections.
      const res = await fetch(base + '?data=' + encodeURIComponent(q), {
        headers: { 'User-Agent': 'pati-seed/1.0 (github.com/oguzpancuk/Pati)' },
        signal: AbortSignal.timeout(200000),
      });
      if (res.status === 200) json = await res.json();
      else console.log(`${city}: HTTP ${res.status}, attempt ${attempt}`);
    } catch (err) {
      console.log(`${city}: ${err.message}, attempt ${attempt}`);
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
    out[`${best.d.city}/${best.d.name}`].push({
      name: n.tags.name,
      lat: +p.lat.toFixed(5),
      lng: +p.lng.toFixed(5),
    });
    assigned += 1;
  }
  console.log(`${city}: ${nodes.length} points, ${assigned} assigned to districts`);
}
for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${v.length}`);
writeFileSync(join(here, 'data', 'neighborhoods.json'), JSON.stringify(out, null, 1));
console.log('wrote: scripts/data/neighborhoods.json');
