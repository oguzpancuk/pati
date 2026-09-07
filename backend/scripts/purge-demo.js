/**
 * Empties the content of a database while keeping the real accounts —
 * the pre-pilot reset (ROADMAP P1, owner decisions 2026-09-07):
 *
 *   - demo users go: the seed's `@stray.test` accounts and the guide bots'
 *     `@pati.demo` accounts, with everything that cascades from them
 *     (identities, comments, care links, friendships, badges, reports);
 *   - every animal goes (photos, health records, vaccinations, comments,
 *     care links cascade), whoever registered it;
 *   - every food/water drop goes, real users' included;
 *   - every badge award goes (points derive from content, which is gone);
 *   - the demo advertisers and their event counters go;
 *   - content reports go (they point at content that is gone);
 *   - the audit log stays (history is not content).
 *
 * Real users keep their account: name, e-mail, password, provider links,
 * avatar, verification state, friendships among themselves.
 *
 *   node scripts/purge-demo.js            # dry run: prints what WOULD go
 *   node scripts/purge-demo.js --apply    # one transaction, then unlinks
 *                                         # the orphaned upload files
 *
 * Without --apply nothing is written. The seed scripts stay in the repo;
 * this is the inverse of seed-demo.js for a database that also holds
 * real accounts (TRUNCATE would take those too).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { UPLOADS_DIR } = require('../src/config/upload');

const DEMO_EMAIL_PATTERNS = ['%@stray.test', '%@pati.demo'];
const APPLY = process.argv.includes('--apply');

/** Upload files referenced by rows that are about to go. */
function uploadFile(url) {
  if (typeof url !== 'string') return null;
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith('/uploads/')) return null;
  const file = path.basename(pathname);
  return file && !file.startsWith('.') ? path.join(UPLOADS_DIR, file) : null;
}

async function main() {
  const client = await pool.connect();
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL).host;
    } catch {
      return '(DATABASE_URL unreadable)';
    }
  })();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} against ${host}`);

  try {
    await client.query('BEGIN');
    const demoWhere = DEMO_EMAIL_PATTERNS.map((_, i) => `email ILIKE $${i + 1}`).join(' OR ');

    const count = async (label, sql, params = []) => {
      const r = await client.query(sql, params);
      const n = Number(r.rows[0].n);
      console.log(`  ${label.padEnd(34)} ${n}`);
      return n;
    };
    console.log('Will delete:');
    const demoUsers = await count(
      'demo users',
      `SELECT count(*) n FROM users WHERE ${demoWhere}`,
      DEMO_EMAIL_PATTERNS
    );
    await count('animals (all)', 'SELECT count(*) n FROM animals');
    await count('animal photos (all)', 'SELECT count(*) n FROM animal_photos');
    await count('health records (all)', 'SELECT count(*) n FROM health_records');
    await count('vaccinations (all)', 'SELECT count(*) n FROM vaccinations');
    await count('comments (all)', 'SELECT count(*) n FROM animal_comments');
    await count('care actions (all)', 'SELECT count(*) n FROM care_actions');
    await count('badge awards (all)', 'SELECT count(*) n FROM user_badge_awards');
    await count('advertisers (all)', 'SELECT count(*) n FROM advertisers');
    await count('ad events (all)', 'SELECT count(*) n FROM ad_events');
    await count('content reports (all)', 'SELECT count(*) n FROM content_reports');
    console.log('Will keep:');
    const realUsers = await count(
      'real users',
      `SELECT count(*) n FROM users WHERE NOT (${demoWhere})`,
      DEMO_EMAIL_PATTERNS
    );
    await count(
      'friendships among real users',
      `SELECT count(*) n FROM friendships f
       JOIN users a ON a.id = f.requester_id JOIN users b ON b.id = f.addressee_id
       WHERE NOT (a.email ILIKE $1 OR a.email ILIKE $2) AND NOT (b.email ILIKE $1 OR b.email ILIKE $2)`,
      DEMO_EMAIL_PATTERNS
    );
    // The accounts that stay, for the owner to eyeball before --apply. On a
    // developer database the harnesses leave hundreds of throwaway
    // accounts behind, so the list is capped; production has a handful.
    const kept = (
      await client.query(
        `SELECT email FROM users WHERE NOT (${demoWhere}) ORDER BY id`,
        DEMO_EMAIL_PATTERNS
      )
    ).rows.map((r) => r.email);
    const tombstones = kept.filter((e) => e.endsWith('@deleted.pati-app.com')).length;
    const shown = kept.filter((e) => !e.endsWith('@deleted.pati-app.com')).slice(0, 60);
    console.log(`  real accounts (${kept.length}, ${tombstones} of them deletion tombstones):`);
    for (const email of shown) console.log(`    ${email}`);
    if (kept.length - tombstones > shown.length)
      console.log(`    … and ${kept.length - tombstones - shown.length} more`);

    // Files to unlink after the commit: only what the deleted rows point
    // at, only under UPLOADS_DIR. Built-in avatar keys are not files.
    const files = new Set();
    for (const r of (await client.query('SELECT url FROM animal_photos')).rows)
      files.add(uploadFile(r.url));
    for (const r of (await client.query('SELECT photo_url FROM care_actions')).rows)
      files.add(uploadFile(r.photo_url));
    for (const r of (await client.query('SELECT image_url FROM advertisers')).rows)
      files.add(uploadFile(r.image_url));
    for (const r of (
      await client.query(`SELECT avatar_url FROM users WHERE ${demoWhere}`, DEMO_EMAIL_PATTERNS)
    ).rows)
      files.add(uploadFile(r.avatar_url));
    files.delete(null);
    console.log(`  upload files to remove: ${files.size}`);

    if (!APPLY) {
      await client.query('ROLLBACK');
      console.log('Dry run — nothing changed. Re-run with --apply to delete.');
      return;
    }
    if (realUsers === 0 && demoUsers === 0) {
      await client.query('ROLLBACK');
      console.log('Nothing to do.');
      return;
    }

    // Order matters where nothing cascades: drops and animals reference
    // users without ON DELETE, so they go before the demo users do.
    await client.query('DELETE FROM ad_events');
    await client.query('DELETE FROM advertisers');
    await client.query('DELETE FROM content_reports');
    await client.query('DELETE FROM care_actions');
    await client.query('DELETE FROM animals');
    await client.query('DELETE FROM user_badge_awards');
    const gone = await client.query(`DELETE FROM users WHERE ${demoWhere}`, DEMO_EMAIL_PATTERNS);
    await client.query('COMMIT');
    console.log(`Committed: ${gone.rowCount} demo users deleted, content emptied.`);

    let removed = 0;
    for (const file of files) {
      try {
        fs.unlinkSync(file);
        removed += 1;
      } catch {
        // Already gone or never on this volume; nothing to recover.
      }
    }
    console.log(`Upload files removed: ${removed}/${files.size}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('purge failed:', err.message);
  process.exit(1);
});
