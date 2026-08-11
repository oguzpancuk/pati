const pool = require('../config/db');

async function listRegions(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, name, status, status_updated_at,
              ST_AsGeoJSON(boundary)::json AS boundary
       FROM regions
       ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getRegion(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, name, status, status_updated_at,
              ST_AsGeoJSON(boundary)::json AS boundary
       FROM regions WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bölge bulunamadı' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function addAction(req, res, next) {
  const client = await pool.connect();
  try {
    const { actionType, animalId } = req.body;
    const regionId = req.params.id;

    if (!['food', 'water', 'sighting'].includes(actionType)) {
      return res.status(400).json({ error: 'actionType food, water veya sighting olmalıdır' });
    }

    await client.query('BEGIN');

    const action = await client.query(
      `INSERT INTO feeding_actions (region_id, animal_id, user_id, action_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [regionId, animalId || null, req.user.userId, actionType]
    );

    // Basit kural: son 24 saatte hiç aksiyon yoksa kırmızı, az aksiyon varsa sarı, yeterliyse yeşil.
    const counts = await client.query(
      `SELECT count(*)::int AS count FROM feeding_actions
       WHERE region_id = $1 AND created_at > now() - interval '24 hours'`,
      [regionId]
    );
    const recentCount = counts.rows[0].count;
    const newStatus = recentCount >= 3 ? 'green' : recentCount >= 1 ? 'yellow' : 'red';

    const region = await client.query('SELECT name, status FROM regions WHERE id = $1', [regionId]);
    const statusChanged = region.rows[0]?.status !== newStatus;

    await client.query(
      'UPDATE regions SET status = $1, status_updated_at = now() WHERE id = $2',
      [newStatus, regionId]
    );

    if (statusChanged && newStatus === 'red') {
      await client.query(
        `INSERT INTO notifications (user_id, region_id, message)
         SELECT DISTINCT user_id, $1, $2
         FROM feeding_actions WHERE region_id = $1`,
        [regionId, `${region.rows[0]?.name || 'Bölge'} bölgesi acil yardıma ihtiyaç duyuyor (Kırmızı)`]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ action: action.rows[0], regionStatus: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { listRegions, getRegion, addAction };
