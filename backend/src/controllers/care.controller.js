const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { UPLOADS_DIR } = require('../config/upload');
const { syncBadgeAwardsSafe } = require('../utils/badgeAwards');
const ai = require('../utils/ai');
const { finiteNumber, isPresent } = require('../utils/numbers');

// A checked photo is handed back to the client as a signed claim over the
// stored file; the confirm step sends it instead of uploading again. Short
// lived: the confirm follows the check within seconds, and a leaked token
// should not stay usable.
const PHOTO_TOKEN_TTL = '15m';
const PHOTO_TOKEN_KIND = 'carePhoto';

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
/**
 * Step one of a drop: the photo goes up, the model looks at it, and the
 * client learns the verdict before anything is recorded (ADR-0005). An
 * approved (or unchecked — the model may be off) photo comes back as a
 * `photoToken` the confirm step redeems, so the photo travels once and the
 * server, not the client, is what decided it was acceptable. A rejected
 * photo is deleted on the spot and answered with 422 and the model's
 * one-line reason in Turkish.
 */
async function checkCarePhoto(req, res, next) {
  try {
    const { actionType } = req.body;
    if (!['food', 'water'].includes(actionType)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'actionType food veya water olmalıdır' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Fotoğraf zorunludur' });
    }

    const check = await ai.checkCarePhoto(req.file.path, actionType);
    if (check.verdict === 'rejected') {
      fs.unlink(req.file.path, () => {});
      return res.status(422).json({
        error: check.reason || rejectionMessage(actionType),
        code: 'photoRejected',
        verdict: 'rejected',
        reason: check.reason,
      });
    }

    // The jti is what makes the token single-use: the confirm stores it in
    // a unique column, so two redemptions race on the index, not on a read.
    const photoToken = jwt.sign(
      {
        kind: PHOTO_TOKEN_KIND,
        userId: req.user.userId,
        file: req.file.filename,
        actionType,
        check: aiCheckRecord(check),
      },
      process.env.JWT_SECRET,
      { expiresIn: PHOTO_TOKEN_TTL, jwtid: crypto.randomUUID() }
    );
    res.json({ verdict: check.verdict, reason: check.reason, photoToken });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

function rejectionMessage(actionType) {
  return actionType === 'food'
    ? 'Fotoğrafta mama görünmüyor. Bıraktığın mamayı çekip tekrar dener misin?'
    : 'Fotoğrafta su görünmüyor. Bıraktığın suyu çekip tekrar dener misin?';
}

/** What gets stored in care_actions.ai_check — null when nothing was checked. */
function aiCheckRecord(check) {
  if (!check || check.verdict === 'unavailable') return null;
  const { verdict, subject, reason, model, ms } = check;
  return { verdict, subject, reason, model, ms };
}

/**
 * Redeems a photoToken from checkCarePhoto: ours, this user's, this action
 * type, the file still on disk, and not already used for a record (a token
 * replayed within its lifetime would otherwise mint duplicate drops).
 * Returns the stored filename plus the check record, or a refusal.
 */
async function redeemPhotoToken(token, userId, actionType) {
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { error: 'Fotoğraf kontrolünün süresi doldu. Fotoğrafı tekrar çeker misin?' };
  }
  if (
    claims.kind !== PHOTO_TOKEN_KIND ||
    claims.userId !== userId ||
    claims.actionType !== actionType ||
    typeof claims.file !== 'string' ||
    path.basename(claims.file) !== claims.file ||
    typeof claims.jti !== 'string'
  ) {
    return { error: 'Fotoğraf bu kayıtla eşleşmiyor. Fotoğrafı tekrar çeker misin?' };
  }
  if (!fs.existsSync(path.join(UPLOADS_DIR, claims.file))) {
    return { error: 'Fotoğraf bulunamadı. Fotoğrafı tekrar çeker misin?' };
  }
  return { file: claims.file, check: claims.check ?? null, jti: claims.jti };
}

async function addCareAction(req, res, next) {
  try {
    const { lat, lng, actionType, photoToken } = req.body;

    if (lat === undefined || lng === undefined) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }
    if (!['food', 'water'].includes(actionType)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'actionType food veya water olmalıdır' });
    }
    if (!req.file && !photoToken) {
      return res.status(400).json({ error: 'Fotoğraf zorunludur' });
    }

    // finiteNumber, not Number: '' would otherwise record the drop at 0,0.
    const pinLat = finiteNumber(lat);
    const pinLng = finiteNumber(lng);
    if (pinLat === null || pinLng === null) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'lat ve lng sayı olmalıdır' });
    }

    // Two ways in: a photoToken from the check step (both apps), or a
    // direct upload, which is checked here so that no client can skip the
    // check by not calling it.
    let file;
    let check;
    let jti = null;
    if (req.file) {
      const result = await ai.checkCarePhoto(req.file.path, actionType);
      if (result.verdict === 'rejected') {
        fs.unlink(req.file.path, () => {});
        return res.status(422).json({
          error: result.reason || rejectionMessage(actionType),
          code: 'photoRejected',
          verdict: 'rejected',
          reason: result.reason,
        });
      }
      file = req.file.filename;
      check = aiCheckRecord(result);
    } else {
      const redeemed = await redeemPhotoToken(String(photoToken), req.user.userId, actionType);
      if (redeemed.error) {
        return res.status(400).json({ error: redeemed.error, code: 'photoTokenInvalid' });
      }
      file = redeemed.file;
      check = redeemed.check;
      jti = redeemed.jti;
    }

    const photoUrl = `${req.protocol}://${req.get('host')}/uploads/${file}`;
    let result;
    try {
      result = await pool.query(
        `INSERT INTO care_actions (location, user_id, action_type, photo_url, ai_check, photo_token_jti)
         VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3, $4, $5, $6, $7)
         RETURNING id, action_type, photo_url, created_at,
                   ST_AsGeoJSON(location)::json AS location`,
        [
          pinLng,
          pinLat,
          req.user.userId,
          actionType,
          photoUrl,
          check ? JSON.stringify(check) : null,
          jti,
        ]
      );
    } catch (err) {
      // The unique index on the jti is the single-use rule: a replayed
      // token — a double tap, a retried request, another Host header —
      // lands here instead of minting a second drop.
      if (err.code === '23505' && jti) {
        return res
          .status(409)
          .json({ error: 'Bu fotoğraf zaten kaydedildi.', code: 'photoAlreadyUsed' });
      }
      throw err;
    }

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
    // A junk radius must not fall back to the default silently.
    if (isPresent(req.query.radiusMeters) && finiteNumber(req.query.radiusMeters) === null) {
      return res.status(400).json({ error: 'radiusMeters sayı olmalıdır' });
    }
    const radiusMeters = finiteNumber(req.query.radiusMeters) ?? DEFAULT_RADIUS_METERS;

    // "Present" means given and non-empty: an empty corner falls through to
    // the radius branch and its "zorunludur" 400, as it always did.
    if ([minLat, maxLat, minLng, maxLng].every(isPresent)) {
      // The viewport comes from a public route: a non-numeric corner must
      // be a 400, not a Postgres "invalid input syntax" 500.
      const box = [minLng, minLat, maxLng, maxLat].map(finiteNumber);
      if (box.some((n) => n === null)) {
        return res.status(400).json({ error: 'Harita sınırları sayı olmalıdır' });
      }
      const params = box;
      const filter = actionTypeFilter(actionType, params.length + 1);
      if (filter.param) params.push(filter.param);
      const result = await pool.query(
        `SELECT id, action_type, photo_url, created_at,
                ST_AsGeoJSON(location)::json AS location,
                ${WEIGHT_SQL} AS weight
         FROM care_actions
         -- Planar comparison on purpose: a geography envelope's edges are
         -- great circles, so a world-wide viewport stopped matching its own
         -- interior (010_care_bbox_geometry.sql). Distance work stays on
         -- the geography column below.
         WHERE location::geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
           AND ${WITHIN_WINDOW_SQL}
           ${filter.sql}
         ORDER BY created_at DESC
         LIMIT 2000`,
        params
      );
      return res.json(result.rows);
    }

    if (!isPresent(lat) || !isPresent(lng)) {
      return res
        .status(400)
        .json({ error: 'lat/lng ya da minLat/maxLat/minLng/maxLng zorunludur' });
    }
    const centre = [finiteNumber(lng), finiteNumber(lat)];
    if (centre.some((n) => n === null)) {
      return res.status(400).json({ error: 'lat ve lng sayı olmalıdır' });
    }

    const params = [...centre, radiusMeters];
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
    if (isPresent(req.query.radiusMeters) && finiteNumber(req.query.radiusMeters) === null) {
      return res.status(400).json({ error: 'radiusMeters sayı olmalıdır' });
    }
    const radiusMeters = finiteNumber(req.query.radiusMeters) ?? DEFAULT_STATUS_RADIUS_METERS;

    if (!isPresent(lat) || !isPresent(lng)) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }
    const centre = [finiteNumber(lng), finiteNumber(lat)];
    if (centre.some((n) => n === null)) {
      return res.status(400).json({ error: 'lat ve lng sayı olmalıdır' });
    }

    const params = [...centre, radiusMeters];
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
    // Clamp both ends: negatives reach Postgres as "OFFSET must not be
    // negative" and surface as a raw 500 otherwise.
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
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
  checkCarePhoto,
  addCareAction,
  listCareActions,
  getCareStatus,
  listMyCareActions,
  deleteCareAction,
};
