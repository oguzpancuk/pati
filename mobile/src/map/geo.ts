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
