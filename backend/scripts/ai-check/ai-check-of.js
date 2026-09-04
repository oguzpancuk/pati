/**
 * Prints the stored verdict of a care action's photo check — DEVELOPMENT
 * ONLY, used by checks.sh, which cannot see the column through the API.
 *
 *   node ai-check-of.js <care action id>   → approved | rejected | null
 */
require('dotenv').config();
const pool = require('../../src/config/db');

pool
  .query('SELECT ai_check FROM care_actions WHERE id = $1', [Number(process.argv[2])])
  .then((r) => {
    const check = r.rows[0]?.ai_check;
    console.log(check ? check.verdict : 'null');
    return pool.end();
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
