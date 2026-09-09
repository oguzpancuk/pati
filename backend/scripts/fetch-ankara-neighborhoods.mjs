/**
 * Adds Ankara's central districts to data/neighborhoods.json, from the same
 * source and with the same shape as fetch-neighborhoods.mjs (OpenStreetMap
 * via Overpass). That script derives its district list from seed-guides.js,
 * which has no Ankara entry — so the districts and their centers are listed
 * here instead and the neighbourhood points still come from OSM.
 *
 *   node scripts/fetch-ankara-neighborhoods.mjs
 *
 * Idempotent: existing İstanbul/İzmir entries are read back and rewritten
 * untouched; Ankara keys are replaced with the fresh result. Run only when
 * the district list changes — the JSON lives in the repo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, 'data', 'neighborhoods.json');

// Ankara's central districts (the metropolitan core), with the district
// center used to claim OSM points. Outlying rural districts are left out:
// the demo world needs dense, walkable neighbourhoods.
const DISTRICTS = [
  { name: 'Çankaya', lat: 39.885, lng: 32.86 },
  { name: 'Keçiören', lat: 39.98, lng: 32.87 },
  { name: 'Yenimahalle', lat: 39.96, lng: 32.77 },
  { name: 'Mamak', lat: 39.93, lng: 32.92 },
  { name: 'Etimesgut', lat: 39.945, lng: 32.67 },
  { name: 'Sincan', lat: 39.965, lng: 32.58 },
  { name: 'Altındağ', lat: 39.95, lng: 32.87 },
  { name: 'Pursaklar', lat: 40.04, lng: 32.9 },
  { name: 'Gölbaşı', lat: 39.79, lng: 32.81 },
];
const CITY = 'Ankara';
// Same radius as fetch-neighborhoods.mjs: a point further than this from
// every center is in a district we do not seed.
const CLAIM_KM = 6;

const km = (a, b) => {
  const dy = (a.lat - b.lat) * 111;
  const dx = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

const bbox = DISTRICTS.reduce(
  (b, d) => ({
    minLat: Math.min(b.minLat, d.lat - 0.06),
    maxLat: Math.max(b.maxLat, d.lat + 0.06),
    minLng: Math.min(b.minLng, d.lng - 0.08),
    maxLng: Math.max(b.maxLng, d.lng + 0.08),
  }),
  { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 }
);

const query = `[out:json][timeout:120];node["place"~"neighbourhood|quarter|suburb"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});out;`;
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

let json = null;
for (let attempt = 1; attempt <= 4 && !json; attempt += 1) {
  const base = MIRRORS[(attempt - 1) % MIRRORS.length];
  try {
    // The User-Agent is required: anonymous requests get 406 / dropped connections.
    const res = await fetch(base + '?data=' + encodeURIComponent(query), {
      headers: { 'User-Agent': 'pati-seed/1.0 (github.com/oguzpancuk/Pati)' },
      signal: AbortSignal.timeout(200000),
    });
    if (res.status === 200) json = await res.json();
    else console.log(`HTTP ${res.status} from ${base}, attempt ${attempt}`);
  } catch (err) {
    console.log(`${err.message} (${base}), attempt ${attempt}`);
  }
  if (!json) await new Promise((r) => setTimeout(r, 10000 * attempt));
}
if (!json) throw new Error('Overpass gave no answer; nothing written');

const out = Object.fromEntries(DISTRICTS.map((d) => [`${CITY}/${d.name}`, []]));
let assigned = 0;
for (const node of json.elements || []) {
  if (!node.tags?.name) continue;
  const p = { lat: node.lat, lng: node.lon };
  let best = null;
  for (const d of DISTRICTS) {
    const dist = km(p, d);
    if (dist <= CLAIM_KM && (!best || dist < best.dist)) best = { d, dist };
  }
  if (!best) continue;
  const bucket = out[`${CITY}/${best.d.name}`];
  // OSM carries duplicate place nodes for the same quarter; keep the first.
  if (bucket.some((n) => n.name === node.tags.name)) continue;
  bucket.push({ name: node.tags.name, lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) });
  assigned += 1;
}

const existing = JSON.parse(readFileSync(FILE, 'utf8'));
for (const key of Object.keys(existing)) {
  if (key.startsWith(`${CITY}/`)) delete existing[key];
}
const merged = { ...existing, ...out };
for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${v.length}`);
console.log(`${assigned} points assigned to ${DISTRICTS.length} Ankara districts`);
writeFileSync(FILE, JSON.stringify(merged, null, 1));
console.log('wrote: scripts/data/neighborhoods.json');
