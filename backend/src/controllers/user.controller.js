const pool = require('../config/db');

async function getMe(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function getMyAnimals(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at,
              ST_AsGeoJSON(a.location)::json AS location
       FROM animals a
       JOIN user_animal_care c ON c.animal_id = a.id
       WHERE c.user_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, getMyAnimals };
