/**
 * Query parameters arrive as strings from public routes. `Number('')` is
 * 0 and `Number(' ')` is 0 too, so a plain `Number.isFinite(Number(v))`
 * check lets an empty coordinate through to Postgres, which answers with
 * an English "invalid input syntax" the error middleware echoes back
 * (review finding, 2026-09-09). This is the one place that decides what
 * counts as a number on the wire.
 */
function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** True when the value is present (not undefined and not an empty string). */
function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/**
 * A latitude/longitude pair from the wire. PostGIS silently coerces an
 * out-of-range coordinate (lat 999 becomes −81) and would store a record
 * hundreds of kilometres from where the client said, so the range is
 * checked here, not left to the database (review finding, 2026-09-09).
 */
function coordinate(lat, lng) {
  const latN = finiteNumber(lat);
  const lngN = finiteNumber(lng);
  if (latN === null || lngN === null) return null;
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) return null;
  return { lat: latN, lng: lngN };
}

/**
 * The widest radius a public route will search, in metres. The clients ask
 * for 100 m to 3 km; a whole country is 1.500 km across. Anything past this
 * is not a viewport, it is `radiusMeters=1e300` walking the whole table
 * through ST_DWithin — accepted with a 200 until now (review finding).
 * A world-scale view has its own path: the bounding-box branch, which the
 * GIST index answers.
 */
const MAX_RADIUS_METERS = 200000;

/**
 * A search radius from the wire: a positive number no wider than
 * MAX_RADIUS_METERS, or null. Refused rather than clamped, so a client
 * asking for something impossible is told, the way every other bad
 * parameter on these routes is.
 */
function radiusMeters(value) {
  const n = finiteNumber(value);
  if (n === null || n <= 0 || n > MAX_RADIUS_METERS) return null;
  return n;
}

module.exports = { finiteNumber, isPresent, coordinate, radiusMeters, MAX_RADIUS_METERS };
