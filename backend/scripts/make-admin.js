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
