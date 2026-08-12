const pool = require('../config/db');

const NEEDS_ATTENTION_HOURS = 24;
const HEATMAP_WINDOW_HOURS = 24 * 7;
const DEFAULT_RADIUS_METERS = 3000;
const DEFAULT_STATUS_RADIUS_METERS = 500;

async function addCareAction(req, res, next) {
  try {
    const { lat, lng, actionType } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }
    if (!['food', 'water'].includes(actionType)) {
      return res.status(400).json({ error: 'actionType food veya water olmalıdır' });
    }

    const result = await pool.query(
      `INSERT INTO care_actions (location, user_id, action_type)
       VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3, $4)
       RETURNING id, action_type, created_at,
                 ST_AsGeoJSON(location)::json AS location`,
      [lng, lat, req.user.userId, actionType]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function listCareActions(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const radiusMeters = Number(req.query.radiusMeters) || DEFAULT_RADIUS_METERS;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }

    // Isı haritası için ağırlık: son 24 saatte 1'e yakın, pencerenin sonunda (7 gün) 0'a yaklaşır.
    const result = await pool.query(
      `SELECT id, action_type, created_at,
              ST_AsGeoJSON(location)::json AS location,
              GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - created_at)) / 3600.0 / $4) AS weight
       FROM care_actions
       WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         AND created_at > now() - ($4 || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT 1000`,
      [lng, lat, radiusMeters, HEATMAP_WINDOW_HOURS]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getCareStatus(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const radiusMeters = Number(req.query.radiusMeters) || DEFAULT_STATUS_RADIUS_METERS;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }

    const result = await pool.query(
      `SELECT count(*)::int AS count, max(created_at) AS last_action_at
       FROM care_actions
       WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         AND created_at > now() - ($4 || ' hours')::interval`,
      [lng, lat, radiusMeters, NEEDS_ATTENTION_HOURS]
    );

    const { count, last_action_at: lastActionAt } = result.rows[0];
    res.json({
      needsAttention: count === 0,
      actionCountLast24h: count,
      lastActionAt,
      radiusMeters,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { addCareAction, listCareActions, getCareStatus };
