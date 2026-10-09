/**
 * Location-targeted ads (018_ad_targeting.sql): an ad may carry a point and
 * a radius, and is then served only to viewers known to be inside that
 * circle. These are the two wire-facing parsers — the admin form's target
 * and the viewer's location on GET /ads — kept apart from the controllers so
 * they can be pinned without a database. The circle test itself is PostGIS's
 * (ST_DWithin in ad.controller.js); the end-to-end evidence is
 * scripts/ad-targeting-check/run.sh.
 */
const { coordinate, finiteNumber, isPresent } = require('./numbers');

// A shop's street at the small end, a province at the large one. The same
// bounds are the table's CHECK constraint (018), so the database refuses
// what this lets through only if the two drift apart.
const MIN_TARGET_RADIUS_METERS = 100;
const MAX_TARGET_RADIUS_METERS = 200000;

/**
 * The admin form's `target`. Three meanings, kept distinct because an edit
 * is a partial update:
 *   undefined          -> { target: undefined }  (leave the ad's circle as is)
 *   null               -> { target: null }       (nationwide)
 *   { lat, lng, radiusMeters } -> { target: {...} }
 * Anything else -> { error } with the Turkish message for the 400.
 */
function parseAdTarget(value) {
  if (value === undefined) return { target: undefined };
  if (value === null) return { target: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Hedef bölge geçersiz' };
  }
  const point = coordinate(value.lat, value.lng);
  if (!point) return { error: 'Hedef bölgenin konumu geçerli bir enlem/boylam olmalıdır' };
  const radius = finiteNumber(value.radiusMeters);
  if (
    radius === null ||
    !Number.isInteger(radius) ||
    radius < MIN_TARGET_RADIUS_METERS ||
    radius > MAX_TARGET_RADIUS_METERS
  ) {
    return { error: 'Hedef yarıçap 0,1 ile 200 km arasında olmalıdır' };
  }
  return { target: { lat: point.lat, lng: point.lng, radiusMeters: radius } };
}

/**
 * The viewer's location as GET /ads?lat=&lng= sends it. Optional — clients
 * that predate targeting send neither, and the controller then falls back to
 * the viewer's last care drop — but half a pair or a non-coordinate is a
 * 400, the way every other coordinate route answers.
 *   -> { location: null } | { location: { lat, lng } } | { error }
 */
function parseViewerLocation(query) {
  const hasLat = isPresent(query.lat);
  const hasLng = isPresent(query.lng);
  if (!hasLat && !hasLng) return { location: null };
  const point = hasLat && hasLng ? coordinate(query.lat, query.lng) : null;
  if (!point) return { error: 'lat ve lng geçerli koordinat olmalıdır' };
  return { location: point };
}

module.exports = {
  parseAdTarget,
  parseViewerLocation,
  MIN_TARGET_RADIUS_METERS,
  MAX_TARGET_RADIUS_METERS,
};
