const pool = require('../config/db');
const { verifyToken } = require('../utils/jwt');

/**
 * Builds the authenticator. `allowPending` opens a route to accounts whose
 * e-mail is still unverified — only the verification endpoints themselves and
 * the account's own read/delete (user.routes) want that; everything else gets
 * a 403 the clients recognise by `emailUnverified` and answer with the code
 * screen (ADR-0004).
 */
function authenticator({ allowPending }) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Yetkilendirme başlığı eksik' });
    }

    const token = header.slice('Bearer '.length);
    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
    }

    try {
      // Even with a valid token the user may no longer exist (e.g. after a dev
      // database reset). We return 401 so the client can clear the session and
      // log in again; otherwise every request turns into a meaningless error and
      // logging out from inside the app becomes impossible.
      const result = await pool.query(
        `SELECT id, role, suspended_at, suspended_reason, email_verification_pending
         FROM users WHERE id = $1`,
        [payload.userId]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Oturumunuz geçersiz, lütfen tekrar giriş yapın' });
      }

      const user = result.rows[0];
      // The JWT itself cannot be revoked (see docs/NOTES.md), so suspension is
      // checked against the database on every request. A suspended user can do
      // nothing even while holding a valid token.
      if (user.suspended_at) {
        return res.status(403).json({
          error: user.suspended_reason
            ? `Hesabınız askıya alındı: ${user.suspended_reason}`
            : 'Hesabınız askıya alındı.',
          suspended: true,
        });
      }

      // Read from the database like suspension, for the same reason: the token
      // was issued before the code was typed and stays valid afterwards.
      if (user.email_verification_pending && !allowPending) {
        return res.status(403).json({
          error: 'Devam etmek için e-posta adresini doğrulaman gerekiyor',
          emailUnverified: true,
        });
      }

      req.user = { ...payload, role: user.role };
      next();
    } catch (err) {
      next(err);
    }
  };
}

const requireAuth = authenticator({ allowPending: false });
const requireAuthAllowPending = authenticator({ allowPending: true });

// Used after requireAuth; the role has been read from the database, so a
// stale role inside the token cannot be used for privilege escalation.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekiyor' });
  }
  next();
}

module.exports = { requireAuth, requireAuthAllowPending, requireAdmin };
