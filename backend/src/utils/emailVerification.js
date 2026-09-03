const crypto = require('crypto');
const pool = require('../config/db');
const { isConfigured, sendMail } = require('./mailer');

/**
 * E-mail verification by 6-digit code (ADR-0004).
 *
 * A code, not a link: the code has to be typed into the session that
 * registered, so proving an address needs the mailbox AND the password. A
 * link in the mail would verify whoever clicks it, and someone who registers
 * on another person's address could get that person to click it (people click
 * "confirm your e-mail" mails they did not ask for) — which would hand them a
 * PROVEN account on that address, exactly what social sign-in links into.
 *
 * Six digits are only safe with the attempt cap below: a code is retired after
 * MAX_ATTEMPTS wrong guesses, and a fresh one needs the resend cooldown plus
 * the per-user limiter, so guessing stays at a few dozen tries an hour against
 * a million possibilities.
 */

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_S = 60;
/** How long an unverified registration holds its address (see register). */
const PENDING_HOLD = '24 hours';

/** Verification is on wherever a mail transport exists. */
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
 * Creates (or replaces) the account's outstanding code. Replacing also resets
 * the attempt counter — a new code is a new set of guesses, not a way around
 * the cap, because it costs a send and the cooldown.
 */
async function issueCode(userId) {
  const code = newCode();
  const salt = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `INSERT INTO email_verifications (user_id, code_hash, salt, expires_at, attempts, last_sent_at)
     VALUES ($1, $2, $3, $4, 0, now())
     ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash,
           salt = EXCLUDED.salt,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           last_sent_at = now()`,
    [userId, hashCode(salt, code), salt, new Date(Date.now() + CODE_TTL_MS)]
  );
  return code;
}

function message(name, code) {
  const subject = `Pati doğrulama kodun: ${code}`;
  const text = [
    `Merhaba ${name},`,
    '',
    'Pati hesabını doğrulamak için bu kodu uygulamaya gir:',
    '',
    code,
    '',
    'Kod 15 dakika geçerli. Bu kaydı sen yapmadıysan bu e-postayı yok sayabilirsin; kodu kimseyle paylaşma.',
    '',
    'Pati',
  ].join('\n');
  const html = `<p>Merhaba ${escapeHtml(name)},</p>
<p>Pati hesabını doğrulamak için bu kodu uygulamaya gir:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
<p>Kod 15 dakika geçerli. Bu kaydı sen yapmadıysan bu e-postayı yok sayabilirsin; kodu kimseyle paylaşma.</p>
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

/** Issues a fresh code and mails it. Throws when the mail cannot be sent. */
async function sendCode(user) {
  const code = await issueCode(user.id);
  await sendMail({ to: user.email, ...message(user.name, code) });
}

/** Seconds until the account may ask for another code; 0 when it may now. */
async function cooldownRemaining(userId) {
  const result = await pool.query(
    `SELECT GREATEST(0, CEIL($2 - EXTRACT(EPOCH FROM (now() - last_sent_at))))::int AS wait
       FROM email_verifications WHERE user_id = $1`,
    [userId, RESEND_COOLDOWN_S]
  );
  return result.rows[0]?.wait ?? 0;
}

/**
 * Checks a guess. The attempt is counted BEFORE the comparison, in the same
 * statement that reads the row, so concurrent guesses cannot share one
 * attempt. Returns { ok: true } or { ok: false, reason } with reason one of
 * 'none' (no outstanding code), 'expired', 'attempts', 'wrong'.
 */
async function checkCode(userId, code) {
  const result = await pool.query(
    `UPDATE email_verifications SET attempts = attempts + 1
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

/**
 * The address is proven: the account leaves the pending state and becomes
 * linkable for provider sign-in (email_verified is what ADR-0003 reads).
 */
async function markVerified(userId, returning) {
  const result = await pool.query(
    `UPDATE users SET email_verified = true, email_verification_pending = false
      WHERE id = $1 RETURNING ${returning}`,
    [userId]
  );
  await pool.query('DELETE FROM email_verifications WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

module.exports = {
  isEnabled,
  sendCode,
  checkCode,
  markVerified,
  cooldownRemaining,
  MAX_ATTEMPTS,
  PENDING_HOLD,
};
