const fs = require('fs');
const pool = require('../config/db');
const { syncBadgeAwardsSafe } = require('../utils/badgeAwards');

// Mama ve su farklı hızda tükeniyor: mama daha çabuk bitiyor/bozuluyor, su daha
// uzun süre işe yarıyor. Haritadaki yeşil alanın solma süresi ile "bu bölgede
// bakım eksik" uyarısının süresi aynı tutuluyor; aksi halde harita yeşilken
// uyarı çıkması gibi tutarsızlıklar oluşuyor.
const WINDOW_HOURS = { food: 4, water: 6 };
const DEFAULT_WINDOW_HOURS = Math.max(WINDOW_HOURS.food, WINDOW_HOURS.water);
const DEFAULT_RADIUS_METERS = 3000;
// "Bu bölgede bakım eksik mi?" yarıçapı, haritadaki yeşil dairenin yarıçapıyla
// aynı (100m). Böylece kural tek cümleye iniyor: kırmızı zemindeyseniz uyarı
// alırsınız, yeşil zemindeyseniz almazsınız. Daha geniş bir yarıçap, iki sokak
// ötedeki mamayı "buraya bakılıyor" saydığı için yanıltıcı oluyordu.
const DEFAULT_STATUS_RADIUS_METERS = 100;

function windowHoursFor(actionType) {
  return WINDOW_HOURS[actionType] ?? DEFAULT_WINDOW_HOURS;
}

/**
 * Mama/su kaydı. Konum artık haritaya dokunarak seçilmiyor; uygulama alttaki
 * butonla kullanıcının **kendi** konumunu gönderiyor. Bu yüzden eskiden burada
 * duran "seçtiğin noktaya 20 m'den yakın mısın" kontrolü kalktı: karşılaştırma
 * artık cihazın konumunu kendisiyle karşılaştırmak anlamına geliyordu.
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

    // Yeni kazanılan rozetler yanıtla birlikte dönüyor ki istemci ayrı bir
    // istek atmadan kutlama popup'ını gösterebilsin.
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

// Pencere satır bazında kendi aksiyon türünden geliyor; böylece mama ve su
// birlikte listelendiğinde de her biri kendi süresine göre soluyor.
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
