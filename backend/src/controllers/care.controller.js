const fs = require('fs');
const pool = require('../config/db');
const { syncBadgeAwardsSafe } = require('../utils/badgeAwards');

// Food and water run out at different speeds: food finishes/spoils sooner,
// water stays useful longer. The map-green fade time and the "care missing"
// warning window are kept identical; otherwise inconsistencies appear, like
// a warning firing while the map is still green.
const WINDOW_HOURS = { food: 4, water: 6 };
const DEFAULT_WINDOW_HOURS = Math.max(WINDOW_HOURS.food, WINDOW_HOURS.water);
const DEFAULT_RADIUS_METERS = 3000;
// The "is care missing here?" radius equals the map's green-circle radius
// (100 m). The rule collapses to one sentence: outside a green circle you get
// warned, inside you don't. A wider radius counted food two streets away as
// "this spot is covered", which misled.
const DEFAULT_STATUS_RADIUS_METERS = 100;

function windowHoursFor(actionType) {
  return WINDOW_HOURS[actionType] ?? DEFAULT_WINDOW_HOURS;
}

/**
 * Food/water record. The location is no longer picked by tapping the map; the
 * app sends the user's **own** position via the bottom button. The old
 * "are you within 20 m of your chosen point" check therefore went away: it
 * had come to mean comparing the device's location with itself.
 */
async function addCareAction(req, res, next) {
  try {
    const { lat, lng, actionType } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }
    if (!['food', 'water'].includes(actionType)) {
      return res.status(400).json({ error: 'actionType food veya water olmalıdır' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Fotoğraf zorunludur' });
    }

    const pinLat = Number(lat);
    const pinLng = Number(lng);
    if (!Number.isFinite(pinLat) || !Number.isFinite(pinLng)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'lat ve lng sayı olmalıdır' });
    }

    const photoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO care_actions (location, user_id, action_type, photo_url)
       VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3, $4, $5)
       RETURNING id, action_type, photo_url, created_at,
                 ST_AsGeoJSON(location)::json AS location`,
      [pinLng, pinLat, req.user.userId, actionType, photoUrl]
    );

    // Newly earned badges ride along in the response so the client can show
    // the celebration popup without an extra request.
    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    res.status(201).json({ ...result.rows[0], newBadges });
  } catch (err) {
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    next(err);
  }
}

function actionTypeFilter(actionType, paramIndex) {
  if (!actionType) return { sql: '', param: undefined };
  if (!['food', 'water'].includes(actionType)) {
    throw Object.assign(new Error('actionType food veya water olmalıdır'), { status: 400 });
  }
  return { sql: `AND action_type = $${paramIndex}`, param: actionType };
}

// The window comes from each row's own action type, so food and water fade
// at their own speeds even when listed together.
const WINDOW_HOURS_SQL = `(CASE action_type
    WHEN 'food' THEN ${WINDOW_HOURS.food}
    WHEN 'water' THEN ${WINDOW_HOURS.water}
    ELSE ${DEFAULT_WINDOW_HOURS} END)`;
const WEIGHT_SQL = `GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - created_at)) / 3600.0 / ${WINDOW_HOURS_SQL})`;
const WITHIN_WINDOW_SQL = `created_at > now() - (${WINDOW_HOURS_SQL} * interval '1 hour')`;

async function listCareActions(req, res, next) {
  try {
    const { lat, lng, minLat, maxLat, minLng, maxLng, actionType } = req.query;
    const radiusMeters = Number(req.query.radiusMeters) || DEFAULT_RADIUS_METERS;

    if (minLat && maxLat && minLng && maxLng) {
      const params = [minLng, minLat, maxLng, maxLat];
      const filter = actionTypeFilter(actionType, params.length + 1);
      if (filter.param) params.push(filter.param);
      const result = await pool.query(
        `SELECT id, action_type, photo_url, created_at,
                ST_AsGeoJSON(location)::json AS location,
                ${WEIGHT_SQL} AS weight
         FROM care_actions
         WHERE location && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
           AND ${WITHIN_WINDOW_SQL}
           ${filter.sql}
         ORDER BY created_at DESC
         LIMIT 2000`,
        params
      );
      return res.json(result.rows);
    }

    if (lat === undefined || lng === undefined) {
      return res
        .status(400)
        .json({ error: 'lat/lng ya da minLat/maxLat/minLng/maxLng zorunludur' });
    }

    const params = [lng, lat, radiusMeters];
    const filter = actionTypeFilter(actionType, params.length + 1);
    if (filter.param) params.push(filter.param);
    const result = await pool.query(
      `SELECT id, action_type, photo_url, created_at,
              ST_AsGeoJSON(location)::json AS location,
              ${WEIGHT_SQL} AS weight
       FROM care_actions
       WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         AND ${WITHIN_WINDOW_SQL}
         ${filter.sql}
       ORDER BY created_at DESC
       LIMIT 1000`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getCareStatus(req, res, next) {
  try {
    const { lat, lng, actionType } = req.query;
    const radiusMeters = Number(req.query.radiusMeters) || DEFAULT_STATUS_RADIUS_METERS;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }

    const params = [lng, lat, radiusMeters];
    const filter = actionTypeFilter(actionType, params.length + 1);
    if (filter.param) params.push(filter.param);

    const result = await pool.query(
      `SELECT count(*)::int AS count, max(created_at) AS last_action_at
       FROM care_actions
       WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         AND ${WITHIN_WINDOW_SQL}
         ${filter.sql}`,
      params
    );

    const { count, last_action_at: lastActionAt } = result.rows[0];
    res.json({
      needsAttention: count === 0,
      actionCount: count,
      lastActionAt,
      radiusMeters,
      windowHours: actionType ? windowHoursFor(actionType) : WINDOW_HOURS,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { addCareAction, listCareActions, getCareStatus };
