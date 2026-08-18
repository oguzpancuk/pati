const pool = require('../config/db');

/**
 * Admin panelinden yapılan değişiklikleri kaydeder.
 *
 * Denetim kaydı yazılamazsa asıl işlem geri alınmıyor ama hata loglanıyor:
 * silme/düzenleme işlemi zaten gerçekleşmiş oluyor, kaydı yazamamak yüzünden
 * kullanıcıya hata döndürmek durumu daha da karıştırır. Yine de bu bir uyarı —
 * denetim kaydının sürekli düşmesi araştırılmalı.
 */
async function writeAuditLog(actorId, action, targetType, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actorId, action, targetType, targetId ?? null, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Denetim kaydı yazılamadı:', action, targetType, targetId, err.message);
  }
}

module.exports = { writeAuditLog };
