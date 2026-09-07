/**
 * Cuts face thumbnails for the animal photos that have none (ROADMAP P3) —
 * the photos uploaded before the cut-out existed. One model call per
 * photo; a photo the model finds no face in is marked with face_score 0
 * so it is not asked again, a photo the model did not answer for is left
 * NULL for the next run.
 *
 *   node scripts/backfill-face-thumbs.js            # dry run: counts only
 *   node scripts/backfill-face-thumbs.js --apply    # cut and store
 *   node scripts/backfill-face-thumbs.js --apply --limit 50
 *   node scripts/backfill-face-thumbs.js --apply --animals 12,34   # only these
 *
 * Needs GEMINI_API_KEY (else every photo is "no answer"). Rate: the
 * requests go one at a time.
 */
require('dotenv').config();
const path = require('path');
const pool = require('../src/config/db');
const { UPLOADS_DIR } = require('../src/config/upload');
const ai = require('../src/utils/ai');
const { makeFaceThumb } = require('../src/utils/faceThumb');

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 100;
if (!Number.isInteger(LIMIT) || LIMIT < 1) {
  console.error('--limit must be a positive integer');
  process.exit(2);
}
const animalsArg = process.argv.indexOf('--animals');
const ANIMALS =
  animalsArg > -1
    ? String(process.argv[animalsArg + 1] || '')
        .split(',')
        .map(Number)
        .filter(Number.isInteger)
    : null;
if (ANIMALS && ANIMALS.length === 0) {
  console.error('--animals needs a comma-separated list of animal ids');
  process.exit(2);
}

async function main() {
  const pending = await pool.query(
    `SELECT p.id, p.url, a.species FROM animal_photos p JOIN animals a ON a.id = p.animal_id
     WHERE p.thumb_url IS NULL AND p.face_score IS NULL
       AND ($2::int[] IS NULL OR p.animal_id = ANY($2::int[]))
     ORDER BY p.id LIMIT $1`,
    [LIMIT, ANIMALS]
  );
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'}: ${
      pending.rowCount
    } photos without a face cut-out (limit ${LIMIT})`
  );
  if (!APPLY) return;
  if (!ai.isConfigured()) {
    console.error('GEMINI_API_KEY is not set — nothing would be cut');
    process.exit(1);
  }

  let cut = 0;
  let none = 0;
  let unanswered = 0;
  for (const row of pending.rows) {
    const filePath = ai.uploadPathFromUrl(row.url, UPLOADS_DIR);
    if (!filePath) {
      console.log(`  ${row.id}: file missing, skipped`);
      continue;
    }
    const face = await ai.locateAnimalFace(filePath, row.species);
    if (!face) {
      unanswered += 1;
      continue;
    }
    if (!face.found) {
      await pool.query('UPDATE animal_photos SET face_score = 0 WHERE id = $1', [row.id]);
      none += 1;
      continue;
    }
    try {
      const thumb = await makeFaceThumb(path.basename(filePath), face.box);
      const base = row.url.slice(0, row.url.lastIndexOf('/') + 1);
      await pool.query(
        'UPDATE animal_photos SET thumb_url = $1, face_score = $2, face_box = $3 WHERE id = $4',
        [`${base}${thumb}`, face.score, JSON.stringify(face.box), row.id]
      );
      cut += 1;
    } catch (err) {
      console.log(`  ${row.id}: could not cut — ${err?.message ?? err}`);
    }
  }
  console.log(`cut ${cut}, no face ${none}, no answer ${unanswered}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
