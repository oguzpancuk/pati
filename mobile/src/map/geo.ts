import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  LineString,
  Point,
  Polygon,
  Position,
} from 'geojson';

/**
 * Tiny GeoJSON helpers for the map screens. The circles on the map are real
 * geographic areas (the 100 m care range, the 200 m animal range), so they
 * are drawn as polygons sized in meters — MapLibre's CircleLayer radius is
 * in pixels and would not scale with zoom. web/ imports these via the
 * `@mobile` alias (same pattern as taxonomy/avatars) — which is why this
 * file must stay free of react-native imports; the local LatLng type is
 * structurally the same as ../location's Coordinates.
 */

type LatLng = { lat: number; lng: number };

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
