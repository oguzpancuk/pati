const pool = require('../config/db');

async function sendRequest(req, res, next) {
  try {
    const requesterId = req.user.userId;
    const addresseeId = Number(req.body.addresseeId);
    if (!addresseeId || addresseeId === requesterId) {
      return res.status(400).json({ error: 'Geçersiz addresseeId' });
    }

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [addresseeId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    const existing = await pool.query(
      `SELECT id, requester_id, status FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
      [requesterId, addresseeId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.status === 'accepted') {
        return res.status(409).json({ error: 'Zaten arkadaşsınız' });
      }
      if (row.requester_id === addresseeId) {
        // The other side already sent me a request: mutual requests auto-accept.
        const accepted = await pool.query(
          `UPDATE friendships SET status = 'accepted', responded_at = now() WHERE id = $1 RETURNING *`,
          [row.id]
        );
        return res.json({ ...accepted.rows[0], autoAccepted: true });
      }
      return res.status(409).json({ error: 'İstek zaten gönderilmiş' });
    }

    const result = await pool.query(
      'INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2) RETURNING *',
      [requesterId, addresseeId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function acceptRequest(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE friendships SET status = 'accepted', responded_at = now()
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
       RETURNING *`,
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'İstek bulunamadı' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// One endpoint for rejecting a pending request, withdrawing a sent one,
// and ending an accepted friendship (unfriend).
async function removeFriendship(req, res, next) {
  try {
    const result = await pool.query(
      `DELETE FROM friendships WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2) RETURNING id`,
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Kayıt bulunamadı' });
    }
    res.json({ removed: true });
  } catch (err) {
    next(err);
  }
}

async function listMyFriendships(req, res, next) {
  try {
    const userId = req.user.userId;

    const friends = await pool.query(
      `SELECT f.id AS friendship_id, u.id, u.name, u.avatar_url
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
       ORDER BY u.name`,
      [userId]
    );

    const incoming = await pool.query(
      `SELECT f.id AS friendship_id, u.id, u.name, u.avatar_url, f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.status = 'pending' AND f.addressee_id = $1
       ORDER BY f.created_at DESC`,
      [userId]
    );

    const outgoing = await pool.query(
      `SELECT f.id AS friendship_id, u.id, u.name, u.avatar_url, f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.addressee_id
       WHERE f.status = 'pending' AND f.requester_id = $1
       ORDER BY f.created_at DESC`,
      [userId]
    );

    res.json({
      friends: friends.rows,
      incomingRequests: incoming.rows,
      outgoingRequests: outgoing.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendRequest, acceptRequest, removeFriendship, listMyFriendships };
