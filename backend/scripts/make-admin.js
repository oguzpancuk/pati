/**
 * Promotes a user to admin.
 *
 * The first admin has to come from somewhere, and it can't be done through
 * the API (admin endpoints already require admin rights — chicken and egg).
 * So this script is run by hand by someone with access to the server.
 *
 * Usage:
 *   npm run make-admin -- someone@example.com
 *   npm run make-admin -- someone@example.com --revoke   (take admin away)
 */
require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const revoke = args.includes('--revoke');

  if (!email) {
    console.error('Usage: npm run make-admin -- someone@example.com [--revoke]');
    process.exit(1);
  }

  const role = revoke ? 'user' : 'admin';

  // Case-insensitive matching can hit more than one row if two case variants
  // of an address were registered before addresses were normalised. Granting
  // admin to a row nobody asked about is exactly the mistake worth refusing:
  // name them and let a human choose.
  const candidates = await pool.query(
    'SELECT id, name, email FROM users WHERE lower(email) = lower($1) ORDER BY id',
    [email]
  );
  if (candidates.rows.length > 1) {
    console.error(`"${email}" matches ${candidates.rows.length} accounts:`);
    for (const row of candidates.rows) console.error(`  #${row.id}  ${row.email}  ${row.name}`);
    console.error('Refusing to change all of them. Fix the duplicate first.');
    process.exit(1);
  }

  const result = await pool.query(
    'UPDATE users SET role = $1 WHERE lower(email) = lower($2) RETURNING id, name, email, role',
    [role, email]
  );

  if (result.rows.length === 0) {
    console.error(`No user registered with "${email}".`);
    console.error('Register through the app first, then run this script.');
    process.exit(1);
  }

  const user = result.rows[0];
  console.log(
    revoke
      ? `${user.name} <${user.email}> is no longer an admin (role: ${user.role}).`
      : `${user.name} <${user.email}> is now an admin (role: ${user.role}).`
  );
  console.log('\nYou can sign in to the admin panel with this account.');
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Failed:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
