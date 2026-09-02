/**
 * Forces a user's stored e-mail to an exact string — DEVELOPMENT ONLY, used
 * by checks.sh to recreate a row from before addresses were normalised.
 *
 * Registration lower-cases now, so the case the fix exists for (a row stored
 * `Ali@x.com` while the provider reports `ali@x.com`) can no longer be
 * produced through the API. Without this the assertion would pass even with
 * the fix reverted (review finding).
 *
 *   node set-email.js <user id> <exact e-mail>
 */
require('dotenv').config();

// backend/scripts ships in the production image, and this bypasses the very
// normalisation the rest of S7 depends on. Refuse there outright.
if (process.env.NODE_ENV === 'production') {
  console.error('set-email.js is a development-only test fixture');
  process.exit(1);
}

const pool = require('../../src/config/db');

const [id, email] = process.argv.slice(2);

pool
  .query('UPDATE users SET email = $1 WHERE id = $2 RETURNING email', [email, id])
  .then((r) => {
    if (r.rows.length === 0) throw new Error(`no user ${id}`);
    console.log(r.rows[0].email);
    return pool.end();
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
