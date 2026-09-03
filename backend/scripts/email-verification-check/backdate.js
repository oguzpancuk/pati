/**
 * Moves a timestamp into the past — DEVELOPMENT ONLY, used by checks.sh so
 * the time-based rules can be exercised without waiting for them:
 *
 *   node backdate.js <user id> sent      last_sent_at  -2 minutes  (resend cooldown)
 *   node backdate.js <user id> expiry    expires_at    -1 minute   (code expiry)
 *   node backdate.js <user id> created   created_at    -25 hours   (address hold)
 *   node backdate.js <user id> grandfather                          (pending → off, unproven)
 *   node backdate.js <user id> nocode                               (drops the code row)
 *
 * `grandfather` is not a timestamp: it turns a fresh registration into an
 * account from before verification existed — usable, never proven — which
 * the social-auth checks need and the API can no longer produce.
 *
 * Without these the assertions would either sleep for a day or, worse, pass
 * without the rule they claim to test being reachable at all.
 */
require('dotenv').config();

// backend/scripts ships in the production image; this rewrites security
// timestamps directly. Refuse there outright.
if (process.env.NODE_ENV === 'production') {
  console.error('backdate.js is a development-only test fixture');
  process.exit(1);
}

const pool = require('../../src/config/db');

const [id, what] = process.argv.slice(2);
const STATEMENTS = {
  sent: "UPDATE email_verifications SET last_sent_at = now() - interval '2 minutes' WHERE user_id = $1 RETURNING user_id",
  expiry:
    "UPDATE email_verifications SET expires_at = now() - interval '1 minute' WHERE user_id = $1 RETURNING user_id",
  created: "UPDATE users SET created_at = now() - interval '25 hours' WHERE id = $1 RETURNING id",
  grandfather:
    'UPDATE users SET email_verification_pending = false, email_verified = false WHERE id = $1 RETURNING id',
  // The state registration leaves behind when the mail fails after the row
  // is committed: pending, and nothing to type.
  nocode: 'DELETE FROM email_verifications WHERE user_id = $1 RETURNING user_id',
};

const sql = STATEMENTS[what];
if (!sql || !id) {
  console.error('usage: backdate.js <user id> sent|expiry|created|grandfather|nocode');
  process.exit(1);
}

pool
  .query(sql, [id])
  .then((r) => {
    if (r.rows.length === 0) throw new Error(`no row for user ${id}`);
    console.log(`${what} backdated for user ${id}`);
    return pool.end();
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
