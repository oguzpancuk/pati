/**
 * Prints the last value the users id sequence handed out — DEVELOPMENT ONLY.
 * checks.sh reads it before and after a link to prove the link did not go
 * through a doomed INSERT (a proven row treated as pending burned one id per
 * successful link — review finding).
 */
require('dotenv').config();
if (process.env.NODE_ENV === 'production') {
  console.error('last-user-id.js is a development-only test fixture');
  process.exit(1);
}
const pool = require('../../src/config/db');
pool
  .query('SELECT last_value FROM users_id_seq')
  .then((r) => { console.log(r.rows[0].last_value); return pool.end(); })
  .catch((err) => { console.error(err.message); process.exit(1); });
