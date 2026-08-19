const pool = require('../config/db');
const { writeAuditLog } = require('../utils/auditLog');

const TARGET_TYPES = ['animal', 'comment', 'care_action', 'user'];
const REASONS = ['spam', 'abuse', 'wrong_info', 'animal_welfare', 'other'];
const MAX_DETAILS = 1000;

// The report must point at something that exists *now*; free-form ids would
// let the queue fill with garbage. After creation there is no foreign key on
// purpose — the report must survive the target's deletion (see 001_init.sql).
const TARGET_LOOKUP = {
  animal: 'SELECT id FROM animals WHERE id = $1',
  comment: 'SELECT id FROM animal_comments WHERE id = $1',
  care_action: 'SELECT id FROM care_actions WHERE id = $1',
  user: 'SELECT id FROM users WHERE id = $1',
};

async function createReport(req, res, next) {
  try {
    const { targetType, targetId, reason, details } = req.body;

    if (!TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ error: 'Geçersiz şikayet hedefi' });
    }
    const id = Number(targetId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Geçersiz hedef' });
    }
    if (!REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Geçersiz şikayet nedeni' });
    }
    if (details && String(details).length > MAX_DETAILS) {
      return res.status(400).json({ error: `Açıklama en fazla ${MAX_DETAILS} karakter olabilir` });
    }
    if (targetType === 'user' && id === req.user.userId) {
      return res.status(400).json({ error: 'Kendini şikayet edemezsin' });
    }

    const target = await pool.query(TARGET_LOOKUP[targetType], [id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'Şikayet edilecek içerik bulunamadı' });
    }

    // The partial unique index blocks a second *open* report from the same
    // user on the same target; catching the conflict here turns it into a
    // friendly answer instead of a 500.
    const inserted = await pool.query(
      `INSERT INTO content_reports (reporter_id, target_type, target_id, reason, details)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (reporter_id, target_type, target_id) WHERE status = 'open'
       DO NOTHING
       RETURNING id, target_type, target_id, reason, status, created_at`,
      [req.user.userId, targetType, id, reason, details ? String(details).trim() : null]
    );

    if (inserted.rows.length === 0) {
      return res
        .status(409)
        .json({ error: 'Bu içeriği zaten şikayet ettin; inceleme bekliyor.' });
    }

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { createReport, TARGET_TYPES, REASONS };
