#!/usr/bin/env node
/**
 * Generates the pati basemap styles from OpenFreeMap's "liberty" style.
 *
 * The output JSONs are COMMITTED (mobile/src/map/styles/pati-{light,dark}.json)
 * so app builds stay offline and deterministic; run this script only when
 * refreshing the base style or changing the palette:
 *
 *   node shared/mapstyle/build.mjs
 *
 * How it works: liberty's layer structure (sources, zoom ramps, label
 * placement) is kept as-is; only colors are rewritten so the map speaks the
 * app's studio-aesthetic language — cream ground, hairline roads, warm
 * label ink. Tiles/glyphs/sprites keep pointing at tiles.openfreemap.org
 * (free, no key; swap the source URL here if the provider ever changes —
 * see docs/adr/ for the basemap decision).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'mobile',
  'src',
  'map',
  'styles'
);

/**
 * The basemap palette, per theme. Grounds and label inks mirror the app
 * tokens (mobile/src/theme/colors.ts · web/src/theme.css): ground is
 * `mapGround`, label ink is `text`/`textBody`. The rest (water, greens,
 * road fills) exists only on the map, so it lives here — warm-shifted to
 * sit next to the cream/charcoal grounds without going gray.
 */
const PALETTES = {
  light: {
    ground: '#F7F0E7', // = mapGround
    residential: 'rgba(240, 229, 213, 0.45)',
    parkFill: '#DFEBD2',
    parkOutline: 'rgba(52, 168, 83, 0.25)',
    wood: '#B9D3A4',
    grass: '#C8DCB4',
    ice: '#EFF3F4',
    sand: '#F3E9D2',
    pitch: '#E2EAD3',
    hospital: '#F9EAE6',
    school: '#F2EDDA',
    water: '#B9D2E8',
    waterway: '#A9C8E0',
    aeroway: '#EFE8DC',
    aerowayLine: '#E7DCCB',
    building: '#EDE2D0',
    buildingOutline: '#E0D0BA',
    roadMinor: '#FFFFFF',
    roadMinorCasing: '#E3D6C2',
    roadMid: '#F8EBD3',
    roadMidCasing: '#E5D3B6',
    motorway: '#F5D9B6',
    motorwayCasing: '#E4C9A2',
    rail: '#CFC5B6',
    boundary: '#C4B8A8',
    labelPlace: '#21201E', // = text
    labelOther: '#4A4744', // = textBody
    labelRoad: '#6E675F',
    labelPath: '#A08A6E',
    labelPoi: '#665F58',
    labelTransit: '#4A6E8A',
    labelWater: '#56789E',
    halo: 'rgba(255, 252, 246, 0.8)',
  },
  dark: {
    ground: '#1D1A16', // = mapGround (dark)
    residential: 'rgba(36, 31, 25, 0.5)',
    parkFill: '#243024',
    parkOutline: 'rgba(76, 196, 107, 0.2)',
    wood: '#2E4030',
    grass: '#2B3B2C',
    ice: '#232830',
    sand: '#2C261D',
    pitch: '#232B1F',
    hospital: '#33231F',
    school: '#2B2820',
    water: '#24384A',
    waterway: '#2E4A61',
    aeroway: '#26211A',
    aerowayLine: '#2E271E',
    building: '#262019',
    buildingOutline: '#302820',
    roadMinor: '#2A251F',
    roadMinorCasing: '#171410',
    roadMid: '#332B21',
    roadMidCasing: '#221C13',
    motorway: '#3D3226',
    motorwayCasing: '#241D14',
    rail: '#3A332B',
    boundary: '#453D33',
    labelPlace: '#F3EEE8', // = text (dark)
    labelOther: '#CFC8C0', // = textBody (dark)
    labelRoad: '#9B948C',
    labelPath: '#877560',
    labelPoi: '#A89F93',
    labelTransit: '#8FB0CC',
    labelWater: '#7FA3C4',
    halo: 'rgba(22, 20, 18, 0.8)',
  },
};

/**
 * Layer-id pattern → paint-property → palette token. All matching rules
 * merge, later entries win. Road rules match across the road_/bridge_/
 * tunnel_ prefixes so the three variants stay one color family.
 */
const RULES = [
  [/^background$/, { 'background-color': 'ground' }],
  [/^landuse_residential$/, { 'fill-color': 'residential' }],
  [/^park$/, { 'fill-color': 'parkFill', 'fill-outline-color': 'parkOutline' }],
  [/^park_outline$/, { 'line-color': 'parkOutline' }],
  [/^landcover_wood$/, { 'fill-color': 'wood' }],
  [/^landcover_(grass|wetland)$/, { 'fill-color': 'grass' }],
  [/^landcover_ice$/, { 'fill-color': 'ice' }],
  [/^landcover_sand$/, { 'fill-color': 'sand' }],
  [/^landuse_(pitch|track|cemetery)$/, { 'fill-color': 'pitch' }],
  [/^landuse_hospital$/, { 'fill-color': 'hospital' }],
  [/^landuse_school$/, { 'fill-color': 'school' }],
  [/^water$/, { 'fill-color': 'water' }],
  [/^waterway_/, { 'line-color': 'waterway' }],
  [/^aeroway_fill$/, { 'fill-color': 'aeroway' }],
  [/^aeroway_(runway|taxiway)$/, { 'line-color': 'aerowayLine' }],
  [/^building$/, { 'fill-color': 'building', 'fill-outline-color': 'buildingOutline' }],
  [/^building-3d$/, { 'fill-extrusion-color': 'building' }],

  // Roads: small streets stay white-on-cream with hairline casings; the
  // bigger the road, the warmer the fill (liberty's yellow/orange ramp,
  // pulled toward the brand's cream-amber).
  [/(minor|street|service_track|path_pedestrian|link)$/, { 'line-color': 'roadMinor' }],
  [
    /(minor|street|service_track|path_pedestrian|link)_casing$/,
    { 'line-color': 'roadMinorCasing' },
  ],
  [/(trunk_primary|secondary_tertiary)$/, { 'line-color': 'roadMid' }],
  [/(trunk_primary|secondary_tertiary)_casing$/, { 'line-color': 'roadMidCasing' }],
  [/motorway(_link)?$/, { 'line-color': 'motorway' }],
  [/motorway(_link)?_casing$/, { 'line-color': 'motorwayCasing' }],
  [/(rail|rail_hatching)$/, { 'line-color': 'rail' }],
  [/^boundary_/, { 'line-color': 'boundary' }],

  // Labels: place names in text ink, everything else a muted warm gray;
  // halos are the ground's warm white/charcoal so text floats on the map.
  [
    /^label_(village|town|city|city_capital|country_\d)$/,
    { 'text-color': 'labelPlace', 'text-halo-color': 'halo' },
  ],
  [/^label_(other|state)$/, { 'text-color': 'labelOther', 'text-halo-color': 'halo' }],
  [/^highway-name-(minor|major)$/, { 'text-color': 'labelRoad', 'text-halo-color': 'halo' }],
  [/^highway-name-path$/, { 'text-color': 'labelPath', 'text-halo-color': 'halo' }],
  [/^(poi_r\d+|airport)$/, { 'text-color': 'labelPoi', 'text-halo-color': 'halo' }],
  [/^poi_transit$/, { 'text-color': 'labelTransit', 'text-halo-color': 'halo' }],
  [
    /^(waterway_line_label|water_name_point_label|water_name_line_label)$/,
    { 'text-color': 'labelWater', 'text-halo-color': 'halo' },
  ],
];

function tint(base, theme) {
  const palette = PALETTES[theme];
  const style = structuredClone(base);
  style.name = `pati-${theme}`;

  // The low-zoom shaded-relief raster fights the flat cream ground and the
  // app never shows those zooms (Turkey bounds, street focus). Drop it.
  // The 3D building extrusions go too: GL JS and MapLibre Native shade them
  // differently (heavy gray blocks on iOS), and flat buildings are truer to
  // the studio language anyway.
  style.layers = style.layers.filter((l) => l.id !== 'natural_earth' && l.id !== 'building-3d');
  delete style.sources.ne2_shaded;

  for (const layer of style.layers) {
    for (const [pattern, overrides] of RULES) {
      if (!pattern.test(layer.id)) continue;
      for (const [prop, token] of Object.entries(overrides)) {
        // Only recolor properties the base layer actually paints — adding
        // e.g. a halo where liberty has none would change label rendering.
        if (layer.paint && prop in layer.paint) layer.paint[prop] = palette[token];
      }
    }
  }
  return style;
}

/** Colors the rules didn't reach, so palette gaps are visible at build time. */
function reportUntouched(style) {
  const known = new Set(Object.values(PALETTES.light).concat(Object.values(PALETTES.dark)));
  const seen = new Map();
  for (const layer of style.layers) {
    for (const [prop, value] of Object.entries(layer.paint ?? {})) {
      if (!/color$/.test(prop)) continue;
      const literals =
        typeof value === 'string'
          ? [value]
          : JSON.stringify(value).match(/"(#|rgb|hsl)[^"]*"/g) ?? [];
      for (const raw of literals) {
        const color = raw.replace(/"/g, '');
        if (!known.has(color)) seen.set(`${layer.id}.${prop}`, color);
      }
    }
  }
  return seen;
}

const res = await fetch(BASE_STYLE_URL);
if (!res.ok) throw new Error(`fetch ${BASE_STYLE_URL}: ${res.status}`);
const base = await res.json();

mkdirSync(OUT_DIR, { recursive: true });
for (const theme of ['light', 'dark']) {
  const style = tint(base, theme);
  const out = join(OUT_DIR, `pati-${theme}.json`);
  writeFileSync(out, JSON.stringify(style, null, 2) + '\n');
  const untouched = reportUntouched(style);
  console.log(`wrote ${out} (${style.layers.length} layers)`);
  for (const [where, color] of untouched) console.log(`  untouched: ${where} = ${color}`);
}
