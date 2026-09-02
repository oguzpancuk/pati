/**
 * Schema migration for S7 (Apple + Google sign-in), 2026-09-02.
 *
 * The project keeps a single schema file (migrations/001_init.sql) and resets
 * the database locally, but production cannot be reset — and
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists,
 * so the two changes 001_init.sql now carries have to be applied by hand
 * there:
 *
 *   1. users.password_hash becomes nullable (social accounts have none),
 *   2. the user_identities table + its index.
 *
 * Idempotent — safe to run more than once. Run locally after pulling, and
 * against production as part of the deploy:
 *   fly ssh console --app pati-app -C "node scripts/migrate-social-auth-20260902.js"
 */
require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_identities (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(10) NOT NULL CHECK (provider IN ('apple', 'google')),
        subject VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (provider, subject)
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id)'
    );

    await client.query('COMMIT');

    // Report the state we actually observe, not the state we intended.
    const { rows } = await client.query(`
      SELECT (SELECT is_nullable FROM information_schema.columns
               WHERE table_name = 'users' AND column_name = 'password_hash') AS password_nullable,
             (SELECT count(*) FROM user_identities)::int AS identity_count
    `);
    console.log(
      `users.password_hash nullable: ${rows[0].password_nullable}, ` +
        `user_identities rows: ${rows[0].identity_count}`
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
