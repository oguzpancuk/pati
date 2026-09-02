require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // One checked-out client for the whole run. `SET` is per-connection, and a
  // pool gives no guarantee that the next query lands on the same backend —
  // so with pool.query the lock_timeout below would only cover the files that
  // happened to reuse that connection (review finding).
  const client = await pool.connect();
  try {
    // DDL takes heavy locks; queue behind a long-running query rather than
    // ahead of every new one. 001 creates indexes on every deploy and runs
    // first, so this has to be set before the loop, not inside a later file.
    await client.query("SET lock_timeout = '10s'");

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Applying ${file}...`);
      await client.query(sql);
    }
  } finally {
    client.release();
  }

  // Report the schema we actually end up with, not just the files we fed in:
  // this runs as the Fly release command, and its log is the only evidence a
  // deploy leaves behind that the database matches the code.
  const summary = await pool.query(`
    SELECT table_name, count(*)::int AS columns
      FROM information_schema.columns
     WHERE table_schema = 'public'
     GROUP BY table_name
     ORDER BY table_name
  `);
  // Tables and column counts only — enough to catch a migration that did not
  // run at all, not enough to prove a column's type or an index's presence.
  console.log(
    'Schema now:',
    summary.rows.map((r) => `${r.table_name}(${r.columns})`).join(' ')
  );

  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
