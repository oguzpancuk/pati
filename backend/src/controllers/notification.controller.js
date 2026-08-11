const pool = require('../config/db');

async function listMyNotifications(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, region_id, message, is_read, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, region_id, message, is_read, created_at`,
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { listMyNotifications, markRead };
