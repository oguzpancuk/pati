/**
 * The viewport of a worldwide map turned into the bounding boxes the
 * server wants (owner, 2026-09-09 — the map used to ask for one fixed
 * Turkey box). Both clients feed it the corners their engine reports; web
 * reads it through the `@mobile` alias, so like geo.ts this file has no
 * imports.
 *
 * MapLibre reports UNWRAPPED longitudes: a viewport centred on the
 * antimeridian comes back as 159…199, and one zoomed far out as
 * -400…+400. Such a viewport is answered with TWO boxes (the piece each
 * side of the antimeridian) rather than the whole world: the server
 * answers a box with the 2000 newest records in it, so asking for the
 * world would return the newest records anywhere on earth and could hide
 * the ones under the user's feet. Only a viewport that genuinely spans
 * most of the globe gets the world box, where that trade is the honest
 * one.
 */

export interface ViewportBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Web Mercator's usable latitude range. */
const MAX_LAT = 85;
/** At or beyond this span the viewport is the world. */
export const WORLD_SPAN_DEG = 150;

const WORLD: ViewportBounds = { minLat: -MAX_LAT, maxLat: MAX_LAT, minLng: -180, maxLng: 180 };

/** Longitude folded back into [-180, 180]; an in-range value is returned
 * untouched (the modulo would otherwise add float noise to it). */
function wrapLng(lng: number): number {
  if (lng >= -180 && lng <= 180) return lng;
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/**
 * @param ne north-east corner as [lng, lat]
 * @param sw south-west corner as [lng, lat]
 * @returns one box, or two when the viewport crosses the antimeridian
 */
export function viewportBoxes(ne: number[], sw: number[]): ViewportBounds[] {
  const [east, north] = ne;
  const [west, south] = sw;
  if (![east, west, north, south].every((n) => Number.isFinite(n))) return [WORLD];

  const minLat = Math.max(-MAX_LAT, Math.min(south, north));
  const maxLat = Math.min(MAX_LAT, Math.max(south, north));
  const span = east - west;
  if (span <= 0 || span >= WORLD_SPAN_DEG) return [{ ...WORLD, minLat, maxLat }];

  const left = wrapLng(west);
  const right = wrapLng(east);
  // Folding kept the order: one plain box.
  if (left < right) return [{ minLat, maxLat, minLng: left, maxLng: right }];
  // The viewport straddles the antimeridian: ask for both halves.
  return [
    { minLat, maxLat, minLng: left, maxLng: 180 },
    { minLat, maxLat, minLng: -180, maxLng: right },
  ];
}
