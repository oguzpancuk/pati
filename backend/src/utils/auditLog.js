const pool = require('../config/db');

/**
 * Records changes made through the admin panel.
 *
 * If the audit write fails, the primary action is not rolled back — only
 * logged: the delete/edit has already happened, and failing the request over
 * the log would make things worse. Still a warning: a consistently failing
 * audit log deserves investigation.
 */
async function writeAuditLog(actorId, action, targetType, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actorId, action, targetType, targetId ?? null, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Audit log write failed:', action, targetType, targetId, err.message);
  }
}

module.exports = { writeAuditLog };
