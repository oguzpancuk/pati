const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { UPLOADS_DIR } = require('../config/upload');
const { syncBadgeAwardsSafe } = require('../utils/badgeAwards');

// A record can only be deleted shortly after it was made: the feature exists
// to fix a mistaken tap, not to rewrite history — older records are the
// map's data and other users have already acted on them.
const DELETE_WINDOW_MINUTES = 15;

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

// The user's own drop history for the profile screen, newest first. `total`
// rides along (window function) so the client's "show more" button can say
// how much is left without a second query. `deletable` is computed
// server-side against the server clock — the client must not re-derive it
// from created_at with its own clock.
async function listMyCareActions(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const result = await pool.query(
      `SELECT id, action_type, photo_url, created_at,
              ST_AsGeoJSON(location)::json AS location,
              created_at > now() - interval '${DELETE_WINDOW_MINUTES} minutes' AS deletable,
              count(*) OVER ()::int AS total
       FROM care_actions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.userId, limit, offset]
    );
    // The window-function total rides on returned rows; with an offset past
    // the end there are none, so fall back to a plain count instead of
    // reporting a misleading 0.
    let total = result.rows[0]?.total;
    if (total === undefined) {
      const count = await pool.query(
        'SELECT count(*)::int AS total FROM care_actions WHERE user_id = $1',
        [req.user.userId]
      );
      total = count.rows[0].total;
    }
    res.json({
      total,
      deleteWindowMinutes: DELETE_WINDOW_MINUTES,
      actions: result.rows.map(({ total: _ignored, ...row }) => row),
    });
  } catch (err) {
    next(err);
  }
}

// Owner-only, inside the window; both conditions live in the DELETE's WHERE
// clause so a concurrent request can't slip through a check-then-delete gap.
async function deleteCareAction(req, res, next) {
  try {
    // A malformed id must be a 404, not a Postgres cast error surfacing as
    // a 500 (int4 range included).
    const recordId = Number(req.params.id);
    if (!Number.isInteger(recordId) || recordId <= 0 || recordId > 2147483647) {
      return res.status(404).json({ error: 'Kayıt bulunamadı' });
    }
    const deleted = await pool.query(
      `DELETE FROM care_actions
       WHERE id = $1 AND user_id = $2
         AND created_at > now() - interval '${DELETE_WINDOW_MINUTES} minutes'
       RETURNING photo_url`,
      [recordId, req.user.userId]
    );
    if (deleted.rows.length === 0) {
      const existing = await pool.query('SELECT user_id FROM care_actions WHERE id = $1', [
        recordId,
      ]);
      // Someone else's record answers 404, not 403: whether a given id
      // exists is nobody else's business.
      if (existing.rows.length === 0 || Number(existing.rows[0].user_id) !== req.user.userId) {
        return res.status(404).json({ error: 'Kayıt bulunamadı' });
      }
      return res.status(409).json({
        error: `Silme süresi doldu — kayıtlar ilk ${DELETE_WINDOW_MINUTES} dakika içinde silinebilir`,
      });
    }

    // Best-effort local file cleanup, same pattern as account deletion.
    const uploadsMatch = /\/uploads\/([^/?#]+)/.exec(deleted.rows[0].photo_url ?? '');
    if (uploadsMatch) {
      fs.unlink(path.join(UPLOADS_DIR, path.basename(uploadsMatch[1])), () => {});
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  addCareAction,
  listCareActions,
  getCareStatus,
  listMyCareActions,
  deleteCareAction,
};
