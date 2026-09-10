/**
 * Copies the photos already on the volume up into the bucket.
 *
 * `config/storage.js` makes the bucket own everything uploaded AFTER it is
 * configured; it deliberately does not touch what was already there. That
 * leaves the backlog as the one thing a volume loss would still take with
 * it — which is the whole reason for configuring a bucket. This script
 * closes that gap, after the `S3_*` secrets are set AND an image containing
 * this file is deployed:
 *
 *   fly ssh console -a pati-app -C "node scripts/publish-backlog.js --dry-run"
 *   fly ssh console -a pati-app -C "node scripts/publish-backlog.js"
 *
 * It copies only files a ROW references. The volume also holds photos
 * nobody owns — a care photo that passed the AI check at
 * `POST /care-actions/check` and was never confirmed keeps a plain name and
 * no sweeper reclaims it, and a delete whose best-effort `fs.unlink` failed
 * leaves the file behind. Publishing those would make content the database
 * has forgotten — including content a user deleted — permanently fetchable
 * at its old `/uploads/<name>` URL, because the fallback serves any object
 * the bucket holds (review finding). They are listed, not copied.
 *
 * Safe to re-run: it asks the bucket what it already holds and skips those,
 * so a second run costs a HEAD per file and uploads nothing. `--dry-run`
 * lists what it would copy without writing.
 *
 * Two ways this script could lie about its own success, both closed
 * deliberately, because the failure it exists to prevent is silent and its
 * own must not be: it refuses when no bucket is configured, and it refuses
 * when it finds no files at all — `config/upload.js` CREATES `UPLOADS_DIR`
 * on import, so a wrong or unmounted path would otherwise be reported as
 * "nothing to copy, all safe".
 *
 * Anything else that writes into `UPLOADS_DIR` directly recreates a
 * backlog, so this is re-run after those too: `seed-guides.js` (which
 * docs/DEPLOYMENT.md tells you to run on production) and
 * `backfill-face-thumbs.js` both write files without publishing them.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const storage = require('../src/config/storage');
const { UPLOADS_DIR, PENDING_PREFIX } = require('../src/config/upload');

/** The files that could be a photo at all: not pending, not a temporary. */
function candidateFiles(names) {
  return names.filter((name) => !name.startsWith(PENDING_PREFIX) && !name.startsWith('.'));
}

/**
 * Every upload filename the database currently points at. These five
 * columns are the only ones that hold an uploads URL (`001_init.sql`
 * through 012; `advertisers.target_url` is an external link, not an
 * upload); a built-in
 * avatar key like `pati-avatar:f3` has no `/uploads/` in it and drops out
 * of the regex on its own.
 */
async function referencedFiles() {
  const { rows } = await pool.query(`
    SELECT avatar_url AS url FROM users WHERE avatar_url IS NOT NULL
    UNION ALL SELECT url FROM animal_photos
    UNION ALL SELECT thumb_url FROM animal_photos WHERE thumb_url IS NOT NULL
    UNION ALL SELECT photo_url FROM care_actions
    UNION ALL SELECT image_url FROM advertisers WHERE image_url IS NOT NULL
  `);
  const names = new Set();
  for (const { url } of rows) {
    const match = /\/uploads\/([^/?#]+)$/.exec(url ?? '');
    if (match) names.add(path.basename(match[1]));
  }
  return names;
}

async function publishBacklog({ dryRun = false, log = console.log } = {}) {
  if (!storage.isRemote()) {
    throw new Error(
      'No bucket is configured (S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY). ' +
        'Set them first — without a bucket this script has nowhere to copy to.'
    );
  }

  const entries = await fs.promises.readdir(UPLOADS_DIR, { withFileTypes: true });
  const candidates = candidateFiles(entries.filter((e) => e.isFile()).map((e) => e.name)).sort();
  if (candidates.length === 0) {
    throw new Error(
      `No files under ${UPLOADS_DIR}. That directory is created on import, so an empty one ` +
        'usually means UPLOADS_DIR is wrong or the volume is not mounted — not that there is ' +
        'nothing to copy. Check before treating the backlog as safe.'
    );
  }

  const referenced = await referencedFiles();
  const files = candidates.filter((name) => referenced.has(name));
  const unreferenced = candidates.filter((name) => !referenced.has(name));
  if (files.length === 0) {
    // The same silent failure as the empty directory, one step down: a
    // DATABASE_URL pointing at an empty or unmigrated database makes every
    // file look unreferenced, and the run would print DONE having copied
    // nothing (third review round). On a real database every file that
    // matters is referenced, so this is never a legitimate state.
    throw new Error(
      `${candidates.length} file(s) on the volume and not one is referenced by a row. ` +
        'That usually means DATABASE_URL points somewhere other than the database these ' +
        'photos belong to. Nothing was copied.'
    );
  }
  log(`${candidates.length} file(s) on the volume, ${files.length} referenced by a row`);
  log(storage.describe());
  if (unreferenced.length > 0) {
    // Not copied: see the header. Listed because an operator should know
    // the volume is carrying them.
    log(`${unreferenced.length} unreferenced file(s), left alone: ${unreferenced.join(', ')}`);
  }

  const result = { total: files.length, published: [], skipped: [], failed: [], unreferenced };
  for (const [i, name] of files.entries()) {
    const at = `[${i + 1}/${files.length}]`;
    if (await storage.exists(name)) {
      result.skipped.push(name);
      continue;
    }
    if (dryRun) {
      log(`${at} would copy ${name}`);
      result.published.push(name);
      continue;
    }
    try {
      await storage.publish(name);
      result.published.push(name);
      log(`${at} copied ${name}`);
    } catch (err) {
      // One unreadable file must not abandon the other seventy: the run
      // reports what failed and exits non-zero so nobody reads a partial
      // copy as a finished one.
      result.failed.push(name);
      log(`${at} FAILED ${name}: ${err?.message ?? err}`);
    }
  }

  log(
    `${dryRun ? 'would copy' : 'copied'} ${result.published.length}, ` +
      `already there ${result.skipped.length}, failed ${result.failed.length}`
  );
  // A terminal line whose ABSENCE is the signal. `fly ssh console -C` gives
  // the remote process a pipe rather than a pty, and Node's writes to a
  // pipe are asynchronous — so an exit code alone can be lost and a
  // truncated tail of progress lines can read as a finished run (review
  // finding). If you do not see one of these two lines, the run did not
  // finish, whatever else it printed.
  log(result.failed.length > 0 ? `INCOMPLETE — ${result.failed.length} failed` : 'DONE');
  return result;
}

if (require.main === module) {
  const flags = process.argv.slice(2);
  const unknown = flags.filter((f) => f !== '--dry-run');
  if (unknown.length > 0) {
    // A mistyped `--dryrun` silently performing the real run is not a
    // mistake to make on a script that touches production once.
    console.error(`Unknown argument(s): ${unknown.join(' ')}. Only --dry-run is accepted.`);
    process.exitCode = 1;
  } else {
    publishBacklog({ dryRun: flags.includes('--dry-run') })
      // exitCode rather than exit(): process.exit() drops stdout writes
      // that have not flushed, which over a pty-less ssh channel is exactly
      // the summary above.
      .then((r) => {
        process.exitCode = r.failed.length > 0 ? 1 : 0;
      })
      .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
      })
      .finally(() => pool.end());
  }
}

module.exports = { publishBacklog, candidateFiles, referencedFiles };
