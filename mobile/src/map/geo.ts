/**
 * Tiny GeoJSON helpers for the map screens. The circles on the map are real
 * geographic areas (the 100 m care range, the 200 m animal range), so they
 * are drawn as polygons sized in meters — MapLibre's CircleLayer radius is
 * in pixels and would not scale with zoom.
 *
 * web/ imports this file via the `@mobile` alias (same pattern as
 * taxonomy/avatars), and the deploy image compiles it WITHOUT mobile's
 * node_modules — so it must stay free of ALL imports, `import type
 * {...} from 'geojson'` included (that one broke the production build).
 * The minimal structural types below are assignment-compatible with
 * @types/geojson in both directions; LatLng matches ../location's
 * Coordinates.
 */

type LatLng = { lat: number; lng: number };

export type Position = number[];
export type GeoJsonProperties = { [name: string]: unknown } | null;
export interface Polygon {
  type: 'Polygon';
  coordinates: Position[][];
}
export interface LineString {
  type: 'LineString';
  coordinates: Position[];
}
export interface Point {
  type: 'Point';
  coordinates: Position;
}
export type Geometry = Polygon | LineString | Point;
export interface Feature<G extends Geometry = Geometry> {
  type: 'Feature';
  properties: GeoJsonProperties;
  geometry: G;
}
export interface FeatureCollection<G extends Geometry = Geometry> {
  type: 'FeatureCollection';
  features: Feature<G>[];
}

const EARTH_RADIUS_M = 6371000;

export function circlePolygon(
  center: LatLng,
  radiusMeters: number,
  properties: GeoJsonProperties = {},
  steps = 48
): Feature<Polygon> {
  const latOffset = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const lngOffset = latOffset / Math.cos((center.lat * Math.PI) / 180);
  const ring: Position[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + lngOffset * Math.sin(angle), center.lat + latOffset * Math.cos(angle)]);
  }
  return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/**
 * The same circle as a LineString ring — for stroke (line) layers. MapLibre
 * native logs "Invalid geometry in line layer" when a LineLayer is fed
 * polygons, so outlines get their own ring features.
 */
export function circleRing(
  center: LatLng,
  radiusMeters: number,
  properties: GeoJsonProperties = {},
  steps = 48
): Feature<LineString> {
  const polygon = circlePolygon(center, radiusMeters, properties, steps);
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: polygon.geometry.coordinates[0] },
  };
}

export function pointFeature(center: LatLng, properties: GeoJsonProperties = {}): Feature<Point> {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
  };
}

export function featureCollection<G extends Geometry>(
  features: Feature<G>[]
): FeatureCollection<G> {
  return { type: 'FeatureCollection', features };
}

/**
 * Ground distance covered by one screen pixel at a zoom level (Web
 * Mercator, 512 px tiles as MapLibre uses). The fan-out and "attached to an
 * animal" rules are screen-pixel rules, so the clients convert them to
 * meters with this before comparing against record positions.
 */
export function metersPerPixel(zoom: number, latitude: number): number {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom + 1);
}

/** A point `east`/`north` meters away from `center`. */
export function offsetMeters(center: LatLng, east: number, north: number): LatLng {
  const lat = center.lat + (north / EARTH_RADIUS_M) * (180 / Math.PI);
  const lng =
    center.lng +
    ((east / EARTH_RADIUS_M) * (180 / Math.PI)) / Math.cos((center.lat * Math.PI) / 180);
  return { lat, lng };
}

/** Great-circle distance in meters (haversine) — import-free copy of the
 * clients' own helpers so map code needs nothing from ../location. */
export function distanceBetween(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** A straight segment between two points — the fan's spokes. */
export function segmentFeature(
  from: LatLng,
  to: LatLng,
  properties: GeoJsonProperties = {}
): Feature<LineString> {
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'LineString',
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    },
  };
}
