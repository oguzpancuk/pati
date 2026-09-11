const crypto = require('crypto');
const pool = require('../config/db');
const { isConfigured, sendMail } = require('./mailer');

/**
 * Password reset by 6-digit code — utils/emailVerification.js pointed at the
 * one thing a signed-out person can prove: that they can read the address's
 * mail. Same six digits, same salted hash, same attempt cap, same "mail is
 * off wherever there is no transport" behaviour (ADR-0004).
 *
 * A code, not a link, for the same reason verification uses one: the code has
 * to be typed into the app, so a mail forwarded or clicked by someone else
 * proves nothing on its own. It also keeps the flow inside the login screen —
 * neither client needs a route a mail can deep-link into.
 *
 * Six digits are only safe with the attempt cap: a code is retired after
 * MAX_ATTEMPTS wrong guesses, and a fresh one costs a send plus the cooldown
 * below plus the per-IP limiter on the endpoint, so guessing stays at a few
 * dozen tries an hour against a million possibilities.
 */

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Seconds between two codes for one account; enforced inside issueCode. */
const RESEND_COOLDOWN_S = 60;

/**
 * The ONE answer POST /auth/forgot-password ever gives. Whether an address
 * has an account is not ours to disclose — the endpoint is unauthenticated,
 * so any difference between "sent" and "no such account" (wording, status, a
 * cooldown 429, even response time) is an enumeration oracle someone can run
 * down a leaked address list. Frozen so no caller can decorate it with
 * something that varies.
 */
const NEUTRAL_ANSWER = Object.freeze({
  ok: true,
  message: 'Bu adrese ait bir hesap varsa 6 haneli bir kod gönderdik.',
});

/** Reset is on wherever a mail transport exists, exactly like verification. */
function isEnabled() {
  return isConfigured();
}

function hashCode(salt, code) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function newCode() {
  // randomInt is uniform; Math.random would not be, and a leading-zero code
  // is as valid as any other, hence the padding.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Creates (or replaces) the account's outstanding code and returns it — or
 * null when the last code went out less than RESEND_COOLDOWN_S ago.
 *
 * The cooldown lives INSIDE the upsert rather than in a read before it, for
 * two reasons. Two requests racing on one address would each pass a separate
 * check and mail two codes; and a cooldown the caller can see is exactly the
 * account-existence oracle this flow refuses to be, so it may only decide
 * whether a mail goes out, never what the caller is told.
 *
 * Replacing also resets the attempt counter — a new code is a new set of
 * guesses, not a way around the cap, because it costs a send and the wait.
 */
async function issueCode(userId) {
  const code = newCode();
  const salt = crypto.randomBytes(16).toString('hex');
  const result = await pool.query(
    `INSERT INTO password_resets (user_id, code_hash, salt, expires_at, attempts, last_sent_at)
     VALUES ($1, $2, $3, $4, 0, now())
     ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash,
           salt = EXCLUDED.salt,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           last_sent_at = now()
       WHERE password_resets.last_sent_at < now() - make_interval(secs => $5::int)
     RETURNING user_id`,
    [userId, hashCode(salt, code), salt, new Date(Date.now() + CODE_TTL_MS), RESEND_COOLDOWN_S]
  );
  return result.rowCount > 0 ? code : null;
}

function message(name, code) {
  const subject = `Pati şifre sıfırlama kodun: ${code}`;
  const text = [
    `Merhaba ${name},`,
    '',
    'Pati şifreni sıfırlamak için bu kodu uygulamaya gir:',
    '',
    code,
    '',
    'Kod 15 dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez. Kodu kimseyle paylaşma.',
    '',
    'Pati',
  ].join('\n');
  const html = `<p>Merhaba ${escapeHtml(name)},</p>
<p>Pati şifreni sıfırlamak için bu kodu uygulamaya gir:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
<p>Kod 15 dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez. Kodu kimseyle paylaşma.</p>
<p>Pati</p>`;
  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[ch])
  );
}

/**
 * Issues a fresh code and mails it. Returns false when the cooldown swallowed
 * the request — the caller answers the same either way. Throws when the mail
 * cannot be sent, which the caller logs rather than reports (see the neutral
 * answer above).
 */
async function sendCode(user) {
  const code = await issueCode(user.id);
  if (!code) return false;
  await sendMail({ to: user.email, ...message(user.name, code) });
  return true;
}

/**
 * Checks a guess. The attempt is counted BEFORE the comparison, in the same
 * statement that reads the row, so concurrent guesses cannot share one
 * attempt. Returns { ok: true } or { ok: false, reason } with reason one of
 * 'none' (no outstanding code), 'expired', 'attempts', 'wrong'.
 */
async function checkCode(userId, code) {
  const result = await pool.query(
    `UPDATE password_resets SET attempts = attempts + 1
      WHERE user_id = $1
      RETURNING code_hash, salt, expires_at, attempts`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return { ok: false, reason: 'none' };
  if (row.attempts > MAX_ATTEMPTS) return { ok: false, reason: 'attempts' };
  if (row.expires_at.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  const expected = Buffer.from(row.code_hash, 'hex');
  const actual = Buffer.from(hashCode(row.salt, code), 'hex');
  if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) {
    return { ok: true };
  }
  return { ok: false, reason: 'wrong', remaining: MAX_ATTEMPTS - row.attempts };
}

module.exports = {
  isEnabled,
  sendCode,
  checkCode,
  NEUTRAL_ANSWER,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_S,
  CODE_TTL_MS,
  // Pure, and exported for backend/test/passwordReset.test.js: the salting
  // and the zero-padding are the two details a rewrite silently loses, and
  // they are the only parts of this module a test can reach without a
  // database.
  hashCode,
  newCode,
};
