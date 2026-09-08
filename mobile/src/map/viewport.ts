/**
 * The viewport of a worldwide map turned into the bounding box the server
 * wants (owner, 2026-09-09 — the map used to ask for one fixed Turkey
 * box). Both clients feed it the corners their engine reports; web reads
 * it through the `@mobile` alias, so like geo.ts this file has no imports.
 *
 * MapLibre reports UNWRAPPED longitudes: a viewport centred on the
 * antimeridian comes back as 159…199, and one zoomed far out as
 * -400…+400. Anything that leaves the -180…180 window, or spans a
 * meaningful part of the globe, is answered with the whole world — the
 * server clips by the freshness window and a LIMIT anyway, and a
 * half-clamped box would silently hide records on one side.
 */

export interface ViewportBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Web Mercator's usable latitude range. */
const MAX_LAT = 85;
/** Beyond this span the box is the world; below it the corners are used. */
export const WORLD_SPAN_DEG = 150;

/**
 * @param ne north-east corner as [lng, lat]
 * @param sw south-west corner as [lng, lat]
 */
export function viewportBounds(ne: number[], sw: number[]): ViewportBounds {
  const [east, north] = ne;
  const [west, south] = sw;
  const spansWorld =
    !Number.isFinite(east) ||
    !Number.isFinite(west) ||
    east <= west ||
    east - west >= WORLD_SPAN_DEG ||
    east > 180 ||
    west < -180;
  return {
    minLat: Math.max(-MAX_LAT, Math.min(south, north)),
    maxLat: Math.min(MAX_LAT, Math.max(south, north)),
    minLng: spansWorld ? -180 : west,
    maxLng: spansWorld ? 180 : east,
  };
}
