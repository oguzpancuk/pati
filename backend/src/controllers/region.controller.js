const pool = require('../config/db');

// Bölge durumu, o bölgedeki en son aksiyonun ne kadar eski olduğuna göre anlık hesaplanır:
// son 8 saat içinde aksiyon varsa yeşil, 24 saat içindeyse sarı, daha eskiyse (veya hiç yoksa) kırmızı.
const STATUS_CASE_SQL = `
  CASE
    WHEN la.last_action_at IS NULL THEN 'red'
    WHEN la.last_action_at > now() - interval '8 hours' THEN 'green'
    WHEN la.last_action_at > now() - interval '24 hours' THEN 'yellow'
    ELSE 'red'
  END
`;

const REGION_SELECT_SQL = `
  SELECT r.id, r.name,
         ${STATUS_CASE_SQL} AS status,
         la.last_action_at AS status_updated_at,
         ST_AsGeoJSON(r.boundary)::json AS boundary
  FROM regions r
  LEFT JOIN LATERAL (
    SELECT max(created_at) AS last_action_at FROM feeding_actions WHERE region_id = r.id
  ) la ON true
`;

async function listRegions(req, res, next) {
  try {
    const result = await pool.query(`${REGION_SELECT_SQL} ORDER BY r.name`);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getRegion(req, res, next) {
  try {
    const result = await pool.query(`${REGION_SELECT_SQL} WHERE r.id = $1`, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bölge bulunamadı' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function addAction(req, res, next) {
  try {
    const { actionType, animalId } = req.body;
    const regionId = req.params.id;

    if (!['food', 'water', 'sighting'].includes(actionType)) {
      return res.status(400).json({ error: 'actionType food, water veya sighting olmalıdır' });
    }

    const action = await pool.query(
      `INSERT INTO feeding_actions (region_id, animal_id, user_id, action_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [regionId, animalId || null, req.user.userId, actionType]
    );

    // Bir aksiyon eklendiğinde bölge her zaman "yeşil"e döner; kırmızıya geçiş yalnızca
    // uzun süre aksiyon gelmemesiyle oluşur ve bildirimleri scripts/check-stale-regions.js
    // periyodik olarak tetikler (bkz. README).
    await pool.query('UPDATE regions SET status = $1, status_updated_at = now() WHERE id = $2', [
      'green',
      regionId,
    ]);

    res.status(201).json({ action: action.rows[0], regionStatus: 'green' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listRegions, getRegion, addAction, STATUS_CASE_SQL };
