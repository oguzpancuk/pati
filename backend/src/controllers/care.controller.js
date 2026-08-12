const fs = require('fs');
const pool = require('../config/db');
const { distanceMeters } = require('../utils/distance');

const NEEDS_ATTENTION_HOURS = 24;
const HEATMAP_WINDOW_HOURS = 24;
const DEFAULT_RADIUS_METERS = 3000;
const DEFAULT_STATUS_RADIUS_METERS = 500;
const MAX_DISTANCE_TO_PIN_METERS = 10;

async function addCareAction(req, res, next) {
  try {
    const { lat, lng, actionType, deviceLat, deviceLng } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }
    if (!['food', 'water'].includes(actionType)) {
      return res.status(400).json({ error: 'actionType food veya water olmalıdır' });
    }
    if (deviceLat === undefined || deviceLng === undefined) {
      return res.status(400).json({ error: 'deviceLat ve deviceLng zorunludur' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Fotoğraf zorunludur' });
    }

    const pinLat = Number(lat);
    const pinLng = Number(lng);
    const userLat = Number(deviceLat);
    const userLng = Number(deviceLng);

    const distance = distanceMeters(pinLat, pinLng, userLat, userLng);
    if (distance > MAX_DISTANCE_TO_PIN_METERS) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        error: `İşaretlediğiniz konuma çok uzaktasınız (${Math.round(distance)}m). En az ${MAX_DISTANCE_TO_PIN_METERS}m yaklaşın.`,
        distanceMeters: distance,
      });
    }

    const photoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO care_actions (location, user_id, action_type, photo_url)
       VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3, $4, $5)
       RETURNING id, action_type, photo_url, created_at,
                 ST_AsGeoJSON(location)::json AS location`,
      [pinLng, pinLat, req.user.userId, actionType, photoUrl]
    );

    res.status(201).json(result.rows[0]);
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

async function listCareActions(req, res, next) {
  try {
    const { lat, lng, minLat, maxLat, minLng, maxLng, actionType } = req.query;
    const radiusMeters = Number(req.query.radiusMeters) || DEFAULT_RADIUS_METERS;

    // Isı haritası için ağırlık: taze aksiyonlarda 1'e yakın, pencerenin sonunda (24 saat) 0'a yaklaşır.
    const weightExpr = `GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - created_at)) / 3600.0 / $1)`;

    if (minLat && maxLat && minLng && maxLng) {
      const params = [HEATMAP_WINDOW_HOURS, minLng, minLat, maxLng, maxLat];
      const filter = actionTypeFilter(actionType, params.length + 1);
      if (filter.param) params.push(filter.param);
      const result = await pool.query(
        `SELECT id, action_type, photo_url, created_at,
                ST_AsGeoJSON(location)::json AS location,
                ${weightExpr} AS weight
         FROM care_actions
         WHERE location && ST_MakeEnvelope($2, $3, $4, $5, 4326)::geography
           AND created_at > now() - ($1 || ' hours')::interval
           ${filter.sql}
         ORDER BY created_at DESC
         LIMIT 2000`,
        params
      );
      return res.json(result.rows);
    }

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat/lng ya da minLat/maxLat/minLng/maxLng zorunludur' });
    }

    const params = [HEATMAP_WINDOW_HOURS, lng, lat, radiusMeters];
    const filter = actionTypeFilter(actionType, params.length + 1);
    if (filter.param) params.push(filter.param);
    const result = await pool.query(
      `SELECT id, action_type, photo_url, created_at,
              ST_AsGeoJSON(location)::json AS location,
              ${weightExpr} AS weight
       FROM care_actions
       WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
         AND created_at > now() - ($1 || ' hours')::interval
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

    const params = [lng, lat, radiusMeters, NEEDS_ATTENTION_HOURS];
    const filter = actionTypeFilter(actionType, params.length + 1);
    if (filter.param) params.push(filter.param);

    const result = await pool.query(
      `SELECT count(*)::int AS count, max(created_at) AS last_action_at
       FROM care_actions
       WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         AND created_at > now() - ($4 || ' hours')::interval
         ${filter.sql}`,
      params
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
