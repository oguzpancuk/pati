const pool = require('../config/db');
const { AuthTokenError, isEnabled, isProvider, verifyIdentityToken } = require('./socialAuth');

/**
 * Fresh provider proof for an account that has no password of its own: the
 * caller signs in with Apple/Google once more and that token is the proof.
 * Returns null when it holds, or the `{ status, error }` to answer with.
 *
 * It lives here because TWO doors need it — account deletion
 * (user.controller.js) and setting a first password (auth.controller.js) —
 * and a copy in each would drift. They are the same proof: both take a
 * permanent, irreversible decision about an account whose owner has never
 * typed a secret we hold.
 *
 * A bearer token alone is NOT the proof. It is exactly what a borrowed tab
 * or an XSS leak hands an attacker, it outlives nothing (the account cannot
 * revoke it), and the two operations it would authorise are the two this
 * account demonstrably could not do before.
 *
 * 403 rather than 401 throughout: both clients read a 401 as "session
 * expired" and log the user out globally, which a cancelled provider sheet
 * must not do. Every status and Turkish sentence here is branched on by both
 * clients — change one and you change an already-shipped contract.
 */
async function reauthenticateWithProvider(userId, { provider, identityToken }) {
  if (typeof identityToken !== 'string' || identityToken.length === 0) {
    return { status: 400, error: 'Hesabınızı doğrulamanız gerekiyor' };
  }
  // Validated here rather than inside the verifier: an unknown provider is a
  // bad request, and letting it reach socialAuth turns our own configuration
  // errors into 500s whose body names the missing env var.
  if (!isProvider(provider)) {
    return { status: 400, error: 'Geçersiz doğrulama sağlayıcısı' };
  }
  if (!isEnabled(provider)) {
    return { status: 503, error: 'Doğrulama şu anda kullanılamıyor, sonra tekrar dene' };
  }
  let identity;
  try {
    identity = await verifyIdentityToken(provider, identityToken);
  } catch (err) {
    if (err instanceof AuthTokenError) {
      return { status: 403, error: 'Doğrulama başarısız, tekrar deneyin' };
    }
    throw err;
  }
  // The token must belong to THIS account: a valid token for somebody else's
  // identity is exactly the confused-deputy case to refuse.
  const linked = await pool.query(
    'SELECT 1 FROM user_identities WHERE user_id = $1 AND provider = $2 AND subject = $3',
    [userId, identity.provider, identity.subject]
  );
  if (linked.rows.length === 0) {
    return { status: 403, error: 'Doğrulama başarısız, tekrar deneyin' };
  }
  return null;
}

module.exports = { reauthenticateWithProvider };
