const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { UPLOADS_DIR, PENDING_PREFIX, pendingToFinal } = require('../config/upload');
const storage = require('../config/storage');
const { syncBadgeAwardsSafe } = require('../utils/badgeAwards');
const {
  coordinate,
  finiteNumber,
  isPresent,
  radiusMeters: radiusParam,
} = require('../utils/numbers');
const { demoFilter } = require('../utils/settings');
const { syncAnimalBadgesSafe, getAnimalBadgesFor, animalBadgeLadder } = require('../utils/badges');
const { notifyAnimalEventSafe } = require('./notification.controller');
const ai = require('../utils/ai');
const { coverPhotoJoin, COVER_COLUMNS } = require('../utils/coverPhoto');
const { makeFaceThumb } = require('../utils/faceThumb');
const { HEALTH_RECORD_TYPES, isValidChoice } = require('../utils/taxonomy');

// Tracking state is not a column; it derives from existing data:
//   recovered    -> recovered_at is set
//   in_treatment -> at least one comment is linked to the record
//   not_started  -> no comments
// State and comments therefore can never disagree.
const HEALTH_RECORD_SELECT_SQL = `
  SELECT h.id, h.record_type, h.description, h.vet_verified, h.recorded_by, h.recorded_at,
         h.recovered_at, h.recovered_by,
         u.name AS recorded_by_name,
         ru.name AS recovered_by_name,
         (SELECT count(*) FROM animal_comments c WHERE c.health_record_id = h.id)::int AS comment_count,
         CASE
           WHEN h.recovered_at IS NOT NULL THEN 'recovered'
           WHEN EXISTS (SELECT 1 FROM animal_comments c WHERE c.health_record_id = h.id) THEN 'in_treatment'
           ELSE 'not_started'
         END AS status
  FROM health_records h
  JOIN users u ON u.id = h.recorded_by
  LEFT JOIN users ru ON ru.id = h.recovered_by
`;

// Vaccinations are separate from health records: no "recovered" state, a
// next-due date instead. Comment counting follows the same logic.
const VACCINATION_SELECT_SQL = `
  SELECT v.id, v.vaccine_type, v.note, v.vet_verified, v.administered_at, v.next_due_at,
         v.recorded_by, v.recorded_at,
         u.name AS recorded_by_name
  FROM vaccinations v
  JOIN users u ON u.id = v.recorded_by
`;

// The animal's picture: see utils/coverPhoto.js (best face cut-out first).
const COVER_PHOTO_JOIN = coverPhotoJoin('a');

// Every animal photo is screened for the claimed species before it is
// stored (ADR-0005, amendment 2026-09-08). The add-animal flow sends its
// photos to the match step, which screens them and hands back one signed
// photoToken per file; the create step redeems the tokens instead of
// uploading again — the same scheme as the care photos, same lifetime. A
// direct upload is screened inline, so skipping the match step gains
// nothing. The cap is the form's own maximum (both clients: MAX_PHOTOS).
// The files wait under PENDING_PREFIX until redeemed; the sweeper in
// config/upload.js removes the ones that never are (most match calls end
// in "that one is already registered", not in a create).
const PHOTO_TOKEN_TTL = '15m';
const PHOTO_TOKEN_KIND = 'animalPhoto';
const MAX_MATCH_PHOTOS = 6;

function speciesRejectionMessage(species) {
  return species === 'dog'
    ? 'Fotoğrafta köpek görünmüyor. Köpeğin göründüğü bir fotoğraf ekler misin?'
    : 'Fotoğrafta kedi görünmüyor. Kedinin göründüğü bir fotoğraf ekler misin?';
}

function photoRejection(res, check, species, extra = {}) {
  return res.status(422).json({
    error: check.reason || speciesRejectionMessage(species),
    code: 'photoRejected',
    verdict: 'rejected',
    reason: check.reason,
    ...extra,
  });
}

/**
 * Redeems a photoToken from matchAnimals: ours, this user's, issued for
 * this species, the file still on disk. The token names the file's final
 * name; the redeem renames the pending file into it (atomic on one
 * volume) so the sweeper leaves it alone, and a redeem that finds only the
 * final file is let through for addPhoto's single-use read to judge (409
 * when a row already has it). Single use is that read, not the rename:
 * two redeems racing on one token both pass it (documented trade-off in
 * addPhoto). Returns the filename or a refusal.
 */
async function redeemPhotoToken(token, userId, species) {
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { error: 'Fotoğraf kontrolünün süresi doldu. Fotoğrafı yeniden yükler misin?' };
  }
  if (
    claims.kind !== PHOTO_TOKEN_KIND ||
    claims.userId !== userId ||
    claims.species !== species ||
    typeof claims.file !== 'string' ||
    path.basename(claims.file) !== claims.file ||
    claims.file.startsWith(PENDING_PREFIX)
  ) {
    return { error: 'Fotoğraf bu kayıtla eşleşmiyor. Fotoğrafı yeniden yükler misin?' };
  }
  const finalPath = path.join(UPLOADS_DIR, claims.file);
  const pendingPath = path.join(UPLOADS_DIR, `${PENDING_PREFIX}${claims.file}`);
  try {
    await fs.promises.rename(pendingPath, finalPath);
  } catch (err) {
    // Already renamed by an earlier redeem (the 409 below decides), or
    // swept: only the second is a refusal.
    if (err?.code !== 'ENOENT' || !fs.existsSync(finalPath)) {
      return { error: 'Fotoğraf bulunamadı. Fotoğrafı yeniden yükler misin?' };
    }
  }
  return { file: claims.file };
}

// The earned animal badges ride on every list row and the profile: one
// query per page over animal_badges, never the six counts (utils/badges).
async function withAnimalBadges(rows) {
  const badges = await getAnimalBadgesFor(rows.map((r) => r.id));
  return rows.map((row) => ({ ...row, badges: badges.get(row.id) ?? [] }));
}

// Pagination: without `limit` the old behavior holds (the map pulls its
// whole surroundings in one request); list screens ask for small pages.
const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 500;

function pageParams(query, defaultLimit = DEFAULT_LIST_LIMIT, maxLimit = MAX_LIST_LIMIT) {
  const limit = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), maxLimit);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

async function listAnimals(req, res, next) {
  try {
    const { lat, lng, radiusMeters, species } = req.query;
    if (species && !['cat', 'dog'].includes(species)) {
      return res.status(400).json({ error: 'species cat veya dog olmalıdır' });
    }
    // Public route: a bad coordinate (or radius) is a 400, not a Postgres
    // 500 whose English message the error middleware would echo back.
    for (const [name, value] of [
      ['lat', lat],
      ['lng', lng],
    ]) {
      if (isPresent(value) && finiteNumber(value) === null) {
        return res.status(400).json({ error: `${name} sayı olmalıdır` });
      }
    }
    if (isPresent(radiusMeters) && radiusParam(radiusMeters) === null) {
      return res
        .status(400)
        .json({ error: 'radiusMeters 0 ile 200000 arasında bir sayı olmalıdır' });
    }
    const { limit, offset } = pageParams(req.query);
    const speciesFilter = species ? 'AND a.species = $SPECIES' : '';
    // Discovery only: a demo animal is not LISTED for someone who switched
    // the showcase off, but one they navigate to still opens (the rule is in
    // utils/settings.js).
    const hideDemo = await demoFilter(req, 'a');

    // The parsed numbers decide the branch, not the raw strings: a blank
    // "   " is truthy but not a coordinate (review finding). Half a centre
    // is a mistake, not "no centre".
    const centreLat = finiteNumber(lat);
    const centreLng = finiteNumber(lng);
    if ((centreLat === null) !== (centreLng === null)) {
      return res.status(400).json({ error: 'lat ve lng birlikte verilmelidir' });
    }
    // A pair has to be a real point on the globe as well as two numbers:
    // PostGIS coerces lat 999 into the southern ocean and answers 200 about
    // a place the caller never asked about (review finding).
    if (centreLat !== null && centreLng !== null && !coordinate(lat, lng)) {
      return res.status(400).json({ error: 'lat ve lng geçerli koordinat olmalıdır' });
    }
    if (centreLat !== null && centreLng !== null) {
      // With a radius (the map's viewport pull) the circle bounds the set;
      // without one (the animals list, owner decision 2026-09-07) the whole
      // table is walked nearest-first — `<->` on geography is a KNN index
      // scan on the GIST index, so page one costs the same in a city or a
      // village and the list never runs out before the animals do.
      const radius = radiusParam(radiusMeters);
      const bounded = radius !== null;
      const params = bounded
        ? [centreLng, centreLat, radius, limit, offset]
        : [centreLng, centreLat, limit, offset];
      const point = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography';
      // The page is cut INSIDE the subquery, ordered by `<->` alone: that is
      // the shape the planner turns into a KNN index scan (a tiebreaker or
      // the cover-photo join in the same ORDER BY made it sort the whole
      // table — review measured 621 ms against 13 ms). The cover photo is
      // joined to the page's rows only; the outer ORDER BY just fixes ties
      // within the page.
      let sql = `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at, a.is_demo,
                        ST_AsGeoJSON(a.location)::json AS location, ${COVER_COLUMNS},
                        a.distance_meters
                 FROM (
                   SELECT a.*, ST_Distance(a.location, ${point}) AS distance_meters
                   FROM animals a
                   WHERE ${bounded ? `ST_DWithin(a.location, ${point}, $3)` : 'true'}
                   ${speciesFilter}
                   ${hideDemo}
                   ORDER BY a.location <-> ${point}
                   LIMIT $${bounded ? 4 : 3}::int OFFSET $${bounded ? 5 : 4}::int
                 ) a
                 ${COVER_PHOTO_JOIN}
                 ORDER BY a.distance_meters, a.id`;
      if (species) {
        params.push(species);
        sql = sql.replace('$SPECIES', `$${params.length}`);
      }
      const result = await pool.query(sql, params);
      return res.json(await withAnimalBadges(result.rows));
    }

    const params = [limit, offset];
    let sql = `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at, a.is_demo,
                      ST_AsGeoJSON(a.location)::json AS location, cover.url AS cover_photo_url, cover.thumb_url AS cover_thumb_url
               FROM animals a
               ${COVER_PHOTO_JOIN}
               WHERE true
               ${speciesFilter}
               ${hideDemo}
               ORDER BY a.created_at DESC, a.id DESC
               LIMIT $1::int OFFSET $2::int`;
    if (species) {
      params.push(species);
      sql = sql.replace('$SPECIES', `$${params.length}`);
    }
    const result = await pool.query(sql, params);
    res.json(await withAnimalBadges(result.rows));
  } catch (err) {
    next(err);
  }
}

// "Is this animal already registered?" before opening a new record. The
// radius is deliberately tight (1 km): street animals rarely leave their
// area, and a wider search surfaced irrelevant candidates that buried the
// real match.
const MATCH_RADIUS_METERS = 1000;
// When the model did not answer, the field-only list is capped as it was
// before the photo comparison existed.
const FALLBACK_LIST_LIMIT = 20;

/**
 * Similarity is a tier (high/medium/low), not a probability. We show no
 * numeric percentage because a cosine or a model's confidence is not one;
 * "73% similar" would promise a precision that doesn't exist. Scoring:
 *   same pattern +2 (the most discriminating field)
 *   same color   +1
 *   within 200 m +1 (same street/block)
 * and, when the new photo could be compared with a candidate's cover photo
 * (ADR-0005):
 *   the model says the same individual  +4  → high whatever the fields say
 *   the model says it could be           +1
 *   the model says clearly another animal −3 → low
 * Only high and medium reach the client (owner decision, 2026-09-07): a low
 * tier is noise on the "is it this one?" list, and with the photo compared
 * it means "the model saw another animal". Species is already a filter —
 * a cat never matches a dog. The user still makes the final call; nothing
 * is merged automatically.
 */
const PHOTO_SCORE = { same: 4, similar: 1, different: -3, unsure: 0 };
const PHOTO_REASON = { same: 'photo_same', similar: 'photo_similar' };

function normalizeChoice(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('tr-TR') : '';
}

function similarityFor(candidate, input) {
  const reasons = [];
  let score = 0;
  if (input.breed && normalizeChoice(candidate.breed) === normalizeChoice(input.breed)) {
    score += 2;
    reasons.push('breed');
  }
  if (input.color && normalizeChoice(candidate.color) === normalizeChoice(input.color)) {
    score += 1;
    reasons.push('color');
  }
  if (Number(candidate.distance_meters) <= 200) {
    score += 1;
    reasons.push('distance');
  }
  return { score, reasons };
}

function tierFor(score) {
  return score >= 3 ? 'high' : score === 2 ? 'medium' : 'low';
}

function byScoreThenDistance(a, b) {
  return b._score - a._score || Number(a.distance_meters) - Number(b.distance_meters);
}

/**
 * GET carries the fields only; POST (multipart) adds the new animal's
 * photos — `photos`, all of them in the form's order, or the older single
 * `photo`. Every photo is screened for the claimed species first (a
 * refusal ends the request, naming every refused photo), then the first is compared
 * with the cover photos of the field-ranked candidates. Photos that pass
 * stay on disk behind a photoToken each for the create step; on any other
 * outcome the files are deleted here.
 */
async function matchAnimals(req, res, next) {
  const files = [...(req.files?.photo ?? []), ...(req.files?.photos ?? [])];
  const photoPath = files[0]?.path;
  let keepFiles = false;
  try {
    const source = req.method === 'POST' ? req.body : req.query;
    const { lat, lng, species, breed, color } = source;
    if (!species || !['cat', 'dog'].includes(species)) {
      return res.status(400).json({ error: 'species cat veya dog olmalıdır' });
    }
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }
    // Parsed and range-checked here: PostGIS coerces an out-of-range
    // coordinate instead of refusing it, and an empty string reaches it as
    // an English 500 (review finding).
    const point = coordinate(lat, lng);
    if (!point) {
      return res.status(400).json({ error: 'lat ve lng geçerli bir konum olmalıdır' });
    }

    // Screened before the comparison: a photo of a person compared with
    // forty cats would only spend the model's time on a refusal. In
    // parallel — the user is waiting behind the matching screen.
    let photoChecks = [];
    if (files.length > 0) {
      photoChecks = await Promise.all(files.map((f) => ai.checkAnimalPhoto(f.path, species)));
      // Every refused photo is named, not just the first: the clients drop
      // them all in one go (a form with two wrong photos used to lose one
      // per attempt — owner report). The reason shown is the first one's.
      const photoIndexes = photoChecks.flatMap((c, i) => (c.verdict === 'rejected' ? [i] : []));
      if (photoIndexes.length > 0) {
        return photoRejection(res, photoChecks[photoIndexes[0]], species, {
          photoIndex: photoIndexes[0],
          photoIndexes,
        });
      }
    }

    const result = await pool.query(
      `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at, a.is_demo,
              ST_AsGeoJSON(a.location)::json AS location, cover.url AS cover_photo_url, cover.thumb_url AS cover_thumb_url,
              ST_Distance(a.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
       FROM animals a
       ${COVER_PHOTO_JOIN}
       WHERE ST_DWithin(a.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         AND a.species = $4
         ${await demoFilter(req, 'a')}
       ORDER BY distance_meters, a.id
       LIMIT 200`,
      [point.lng, point.lat, MATCH_RADIUS_METERS, species]
    );

    const input = { breed, color };
    const scored = result.rows
      .map((row) => {
        const { score, reasons } = similarityFor(row, input);
        return { ...row, _score: score, _reasons: reasons };
      })
      .sort(byScoreThenDistance);

    // The photo is compared with every animal in the circle that has a
    // cover photo, nearest-by-fields first, up to the cap in ai.js (owner
    // decision: the whole 1 km, not a short list).
    let photoChecked = false;
    if (photoPath && ai.isConfigured()) {
      const comparable = scored
        .map((row) => ({
          id: row.id,
          filePath: ai.uploadPathFromUrl(row.cover_photo_url, UPLOADS_DIR),
        }))
        .filter((c) => c.filePath);
      const verdicts = await ai.compareAnimalPhotos(photoPath, comparable, species);
      if (verdicts) {
        photoChecked = true;
        for (const row of scored) {
          const verdict = verdicts.get(row.id);
          if (!verdict) continue;
          row._score += PHOTO_SCORE[verdict];
          if (PHOTO_REASON[verdict]) row._reasons.unshift(PHOTO_REASON[verdict]);
        }
        scored.sort(byScoreThenDistance);
      }
    }

    // With the photo compared, everything that clears medium, on one page
    // — no cap: the tier filter is the cap, and "low" now means the model
    // saw another animal (or the fields alone could not lift it). Without
    // the model's answer a low tier means nothing of the kind, so the
    // fallback keeps the old field-ranked list — an empty list would send
    // both clients straight to "create", the duplicate this exists to
    // prevent (review finding).
    const shown = photoChecked
      ? scored.filter(({ _score }) => tierFor(_score) !== 'low')
      : scored.slice(0, FALLBACK_LIST_LIMIT);
    const shownCandidates = shown.map(({ _score, _reasons, ...rest }) => ({
      ...rest,
      similarity: tierFor(_score),
      similarity_reasons: _reasons,
    }));

    // One token per photo, in the order sent; the create step redeems them
    // (addPhoto). Issued with the model off too — the token is what lets
    // the photo travel once. It names the final file; the pending file on
    // disk carries the prefix until then. What the model said is not
    // kept: animal_photos has no ai_check column (ADR-0005 amendment).
    const photoTokens = files.map((file) =>
      jwt.sign(
        {
          kind: PHOTO_TOKEN_KIND,
          userId: req.user.userId,
          file: pendingToFinal(file.filename),
          species,
        },
        process.env.JWT_SECRET,
        { expiresIn: PHOTO_TOKEN_TTL, jwtid: crypto.randomUUID() }
      )
    );
    // A "match hit": the user's photo put this animal forward. A badge
    // source (ANIMAL_BADGES.matched) and, for fifteen minutes, the evidence
    // that lets this user confirm "that's the one" as a non-carer (see
    // reportSighting). Product rule (owner item 8, coordinator decision
    // 2026-09-08, recorded in NOTES/ADR-0005 at merge): this door is never
    // weaker than "bakım ver" — a hit needs the model's 'same' for that
    // candidate, or no model answer at all (key missing, an error, no
    // comparable cover: 'unchecked', the way submitCarePhotos accepts
    // unchecked). 'similar' and 'unsure' mint nothing and never count for
    // the badge; the field-only GET never logs. Awaited: the door reads
    // this row right after the client's confirm. `matchHit` on each
    // candidate tells the clients the server's decision — true only for
    // a logged hit — so the label, the hint and whether the confirm
    // reports a sighting all follow ONE rule, decided here.
    let hits = files.length === 0 ? [] : matchHitsOf(shownCandidates, photoChecked);
    try {
      await logMatchHits(req.user.userId, hits);
    } catch (err) {
      // A failed log must not turn into a failed match; the door then
      // stays shut for this attempt and the care-photo step remains.
      console.warn(`[match] could not log hits: ${err?.message ?? err}`);
      hits = [];
    }
    const hitIds = new Set(hits.map((h) => h.id));
    const candidates = shownCandidates.map((c) => ({ ...c, matchHit: hitIds.has(c.id) }));
    keepFiles = true;
    res.json({ candidates, radiusMeters: MATCH_RADIUS_METERS, photoChecked, photoTokens });
    // The badge counts catch up after the answer (up to twenty animals).
    for (const hit of hits) syncAnimalBadgesSafe(hit.id);
  } catch (err) {
    next(err);
  } finally {
    if (!keepFiles) for (const file of files) fs.unlink(file.path, () => {});
  }
}

// How long a registration match hit stands as "this user photographed this
// animal" — the photoToken's lifetime, the add-animal flow's own window.
// The rule, in full (parity with "bakım ver"): a hit is minted by a photo
// submission, lasts fifteen minutes, and is spent by ONE sighting — the
// confirm stamps used_at on ALL of the user's fresh hits, whichever
// submission minted them, the confirmed animal's included
// (consumeMatchHit): one confirm per window, never one per candidate.
// Spent, never deleted: the rows stay as the badge's evidence.
const MATCH_HIT_WINDOW = '15 minutes';

// The hits among the shown candidates (see above). `similarity` uses the
// model's own word ('same') or 'unchecked', the vocabulary of the 'care'
// rows; the column is VARCHAR(10), so a photo_* reason name never goes in.
function matchHitsOf(candidates, photoChecked) {
  if (!photoChecked) {
    return candidates
      .filter((c) => c.similarity !== 'low')
      .map((c) => ({ id: c.id, similarity: 'unchecked' }));
  }
  return candidates
    .filter((c) => c.similarity_reasons.includes('photo_same'))
    .map((c) => ({ id: c.id, similarity: 'same' }));
}

async function logMatchHits(userId, hits) {
  if (hits.length === 0) return;
  const values = [];
  const params = [userId];
  for (const hit of hits) {
    params.push(hit.id, hit.similarity);
    values.push(`($${params.length - 1}, $1, 'register', $${params.length})`);
  }
  await pool.query(
    `INSERT INTO animal_match_attempts (animal_id, user_id, kind, similarity) VALUES ${values.join(', ')}`,
    params
  );
}

/**
 * Spends the user's fresh hits (see MATCH_HIT_WINDOW). Within the
 * caller's transaction: every fresh 'register' row of the user is locked
 * in id order (one lock order for every confirm, so two racing confirms
 * queue instead of deadlocking); if none of them is an unspent hit on
 * THIS animal the answer is false and nothing changes; otherwise all of
 * them get used_at. The second of two confirms racing on the same animal
 * waits on the lock, then finds the hit spent → false → 403.
 */
async function consumeMatchHit(client, userId, animalId) {
  const fresh = await client.query(
    `SELECT id, animal_id, used_at FROM animal_match_attempts
     WHERE user_id = $1 AND kind = 'register'
       AND created_at > now() - $2::interval
     ORDER BY id
     FOR UPDATE`,
    [userId, MATCH_HIT_WINDOW]
  );
  const unspent = fresh.rows.some((r) => r.animal_id === Number(animalId) && r.used_at === null);
  if (!unspent) return false;
  await client.query(
    `UPDATE animal_match_attempts SET used_at = now()
     WHERE user_id = $1 AND kind = 'register' AND used_at IS NULL
       AND created_at > now() - $2::interval`,
    [userId, MATCH_HIT_WINDOW]
  );
  return true;
}

async function getAnimal(req, res, next) {
  try {
    const animalResult = await pool.query(
      `SELECT id, species, name, color, breed, markings, created_by, created_at, location_updated_at,
              is_demo, ST_AsGeoJSON(location)::json AS location
       FROM animals WHERE id = $1`,
      [req.params.id]
    );
    if (animalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Hayvan bulunamadı' });
    }

    const [photos, healthRecords, vaccinations, carers, followers, badgeLadder] =
      await Promise.all([
      pool.query(
        `SELECT p.id, p.url, p.thumb_url, p.face_score, p.uploaded_by, p.created_at,
                u.name AS uploaded_by_name,
                (SELECT count(*) FROM animal_photo_likes l WHERE l.photo_id = p.id)::int AS like_count,
                EXISTS (SELECT 1 FROM animal_photo_likes l WHERE l.photo_id = p.id AND l.user_id = $2) AS liked_by_me
         FROM animal_photos p
         LEFT JOIN users u ON u.id = p.uploaded_by
         WHERE p.animal_id = $1
         ORDER BY p.created_at DESC`,
        [req.params.id, req.user.userId]
      ),
      pool.query(
        `${HEALTH_RECORD_SELECT_SQL}
         WHERE h.animal_id = $1
         ORDER BY h.recorded_at DESC`,
        [req.params.id]
      ),
      pool.query(
        `${VACCINATION_SELECT_SQL}
         WHERE v.animal_id = $1
         ORDER BY v.administered_at DESC`,
        [req.params.id]
      ),
      pool.query(
        // is_demo travels with the row: the carers list is a surface where a
        // showcase bot can be met (seed-showcase writes user_animal_care), and
        // both clients draw the same "demo" chip the comment authors below it
        // wear. Without the column they could not tell them apart.
        `SELECT u.id, u.name, u.avatar_url, u.is_demo FROM user_animal_care c
         JOIN users u ON u.id = c.user_id
         WHERE c.animal_id = $1
         ORDER BY c.created_at`,
        [req.params.id]
      ),
      pool.query(
        `SELECT count(*)::int AS count,
                bool_or(user_id = $2) AS mine
         FROM animal_followers WHERE animal_id = $1`,
        [req.params.id, req.user.userId]
      ),
      animalBadgeLadder(Number(req.params.id)),
    ]);

    const isCarer = carers.rows.some((c) => c.id === req.user.userId);

    // The picture on the profile header: the best-scored face cut-out, the
    // same rule as coverPhotoJoin so lists and the profile never disagree.
    const best = photos.rows
      .filter((p) => p.thumb_url)
      .sort(
        (a, b) =>
          (b.face_score ?? 0) - (a.face_score ?? 0) ||
          new Date(a.created_at) - new Date(b.created_at) ||
          a.id - b.id
      )[0];
    res.json({
      ...animalResult.rows[0],
      cover_thumb_url: best?.thumb_url ?? null,
      photos: photos.rows,
      healthRecords: healthRecords.rows,
      vaccinations: vaccinations.rows,
      carers: carers.rows,
      carerCount: carers.rows.length,
      isCarer,
      followerCount: followers.rows[0]?.count ?? 0,
      isFollowing: followers.rows[0]?.mine === true,
      // The earned badges, in the shape list rows carry (getAnimalBadgesFor),
      // read off the ladder so the profile runs one badge query, not two.
      badges: badgeLadder
        .filter((step) => step.tier !== null)
        .map(({ thresholds, value, ...badge }) => badge),
      // Every key, earned or not, with the live count: the tier ladder
      // behind the header's chips (P7 item 3). List rows carry `badges` only.
      badgeLadder,
    });
  } catch (err) {
    next(err);
  }
}

const CARERS_ONLY = 'carersOnly';

/**
 * Becoming a carer — through either door, or by registering the animal —
 * also makes the user a follower (owner finding, P7 item 2): the profile
 * shows both states, and the follower count reads as "everyone who hears
 * about this animal", which the recipients query already treated carers
 * as. Both inserts are idempotent. Returns true when the carer row is new:
 * the moment the `care` notification announces.
 */
async function addCarer(db, userId, animalId) {
  const inserted = await db.query(
    'INSERT INTO user_animal_care (user_id, animal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, animalId]
  );
  await db.query(
    'INSERT INTO animal_followers (animal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [animalId, userId]
  );
  return inserted.rowCount > 0;
}

function carersOnly(res, what) {
  return res.status(403).json({
    error: `${what} için bu hayvanın bakıcısı olmalısın. "Bakım ver" ile yeni bir fotoğraf çekerek katılabilirsin.`,
    code: CARERS_ONLY,
  });
}

// Reporting a sighting of a registered animal: moves the animal's current
// location to the reporter's position. Carers only (owner decision,
// 2026-09-08) — with one door: the add-animal flow calls this when "that's
// the one" is confirmed, and that user just came through the match step
// with a photo the model judged the SAME animal as this one (or that no
// model judged at all — see matchHitsOf; a field-only match, a 'similar'
// or an 'unsure' opens nothing, and the clients then open the profile
// without a sighting — unless the viewer already is a carer, who reports
// through the carer door below with or without a hit). That logged hit,
// fresh, stands as the care-photo
// step would and makes the reporter a carer. The flow's photos are not
// part of this request: after a 200 the clients redeem their match tokens
// through addPhoto, as the create path does (B1, 2026-09-14).
async function reportSighting(req, res, next) {
  try {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }
    // Parsed and range-checked here: PostGIS coerces an out-of-range
    // coordinate instead of refusing it, and an empty string reaches it as
    // an English 500 (review finding).
    const point = coordinate(lat, lng);
    if (!point) {
      return res.status(400).json({ error: 'lat ve lng geçerli bir konum olmalıdır' });
    }

    // One transaction: the carer read, the spend of the hit, the moved
    // location and the carer row happen together — a second confirm
    // racing this one queues on the row locks and then finds the hit
    // spent (see consumeMatchHit) and is refused.
    const client = await pool.connect();
    let result;
    let carer;
    let becameCarer = false;
    try {
      await client.query('BEGIN');
      carer =
        (
          await client.query(
            'SELECT 1 FROM user_animal_care WHERE user_id = $1 AND animal_id = $2',
            [req.user.userId, req.params.id]
          )
        ).rowCount > 0;
      if (!carer && !(await consumeMatchHit(client, req.user.userId, req.params.id))) {
        await client.query('ROLLBACK');
        return carersOnly(res, 'Görülme bildirebilmek');
      }
      result = await client.query(
        `UPDATE animals
         SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             location_updated_at = now()
         WHERE id = $3
         RETURNING id, species, name, color, breed, markings, created_at, location_updated_at,
                   ST_AsGeoJSON(location)::json AS location`,
        [point.lng, point.lat, req.params.id]
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Hayvan bulunamadı' });
      }
      if (!carer) becameCarer = await addCarer(client, req.user.userId, req.params.id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    // The door opened: the carers and followers hear about the new carer
    // first, then about the sighting the confirm reported.
    if (becameCarer) {
      await notifyAnimalEventSafe({
        animalId: Number(req.params.id),
        kind: 'care',
        actorId: req.user.userId,
      });
    }
    await notifyAnimalEventSafe({
      animalId: Number(req.params.id),
      kind: 'sighting',
      actorId: req.user.userId,
    });
    await syncAnimalBadgesSafe(Number(req.params.id));

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createAnimal(req, res, next) {
  try {
    const { species, name, color, breed, markings, lat, lng } = req.body;
    if (!species || !['cat', 'dog'].includes(species)) {
      return res.status(400).json({ error: 'species cat veya dog olmalıdır' });
    }
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }
    // Parsed and range-checked here: PostGIS coerces an out-of-range
    // coordinate instead of refusing it, and an empty string reaches it as
    // an English 500 (review finding).
    const point = coordinate(lat, lng);
    if (!point) {
      return res.status(400).json({ error: 'lat ve lng geçerli bir konum olmalıdır' });
    }
    // Pattern and color come from a list, but "Diğer" lets users type free
    // text. The length cap matches the column (VARCHAR(120)); otherwise the
    // user sees a meaningless database error.
    if (breed && !isValidChoice(breed, null, { maxLength: 120 })) {
      return res.status(400).json({ error: 'Tür/desen en fazla 120 karakter olabilir' });
    }
    if (color && !isValidChoice(color, null, { maxLength: 120 })) {
      return res.status(400).json({ error: 'Renk en fazla 120 karakter olabilir' });
    }

    const result = await pool.query(
      `INSERT INTO animals (species, name, color, breed, markings, location, created_by)
       VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8)
       RETURNING id, species, name, color, breed, markings, created_at`,
      [
        species,
        name || null,
        color || null,
        breed || null,
        markings || null,
        point.lng,
        point.lat,
        req.user.userId,
      ]
    );

    const animal = result.rows[0];
    // The registrant is the first carer, and so the first follower.
    await addCarer(pool, req.user.userId, animal.id);

    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    // The registrant stays a carer automatically; that first carer is
    // already a count the animal badges read.
    await syncAnimalBadgesSafe(animal.id);
    res.status(201).json({ ...animal, newBadges });
  } catch (err) {
    next(err);
  }
}

/**
 * Two ways in: a photoToken from the match step (both apps' add-animal
 * flow), or a direct upload, which is screened here so that no client can
 * put an unscreened photo in a gallery. Carers only (owner decision,
 * 2026-09-08), and no door of its own: the add-animal flow calls it for a
 * NEW animal after the create, and for an EXISTING one after "Bu o —
 * eşleştir" once the sighting has made the user a carer (both clients
 * since 2026-09-14, owner batch B1 — the client half of the flow the
 * match-hit door here was first built for). Everyone else goes through
 * the care-photo step.
 */
async function addPhoto(req, res, next) {
  const photoToken = req.body?.photoToken;
  const discardUpload = () => req.file && fs.unlink(req.file.path, () => {});
  if (!req.file && !photoToken) {
    return res.status(400).json({ error: 'Fotoğraf zorunludur' });
  }
  let file;
  try {
    const species = (await pool.query('SELECT species FROM animals WHERE id = $1', [req.params.id]))
      .rows[0]?.species;
    if (!species) {
      discardUpload();
      return res.status(404).json({ error: 'Hayvan bulunamadı' });
    }
    if (!(await isCarer(req.user.userId, req.params.id))) {
      discardUpload();
      return carersOnly(res, 'Fotoğraf ekleyebilmek');
    }
    if (req.file) {
      const check = await ai.checkAnimalPhoto(req.file.path, species);
      if (check.verdict === 'rejected') {
        discardUpload();
        return photoRejection(res, check, species);
      }
      file = req.file.filename;
    } else {
      const redeemed = await redeemPhotoToken(String(photoToken), req.user.userId, species);
      if (redeemed.error) {
        return res.status(400).json({ error: redeemed.error, code: 'photoTokenInvalid' });
      }
      // Single use: a file already in a gallery is not added again (a
      // double tap, a retried request). Compared on the file name, so the
      // Host the URL was built under does not matter. A read, not an
      // index: a duplicate slipping through a race costs a second row on
      // the same file, not a second drop on the map.
      const used = await pool.query(
        `SELECT 1 FROM animal_photos WHERE substring(url from '[^/]+$') = $1 LIMIT 1`,
        [redeemed.file]
      );
      if (used.rowCount > 0) {
        return res
          .status(409)
          .json({ error: 'Bu fotoğraf zaten eklendi.', code: 'photoAlreadyUsed' });
      }
      file = redeemed.file;
    }
  } catch (err) {
    discardUpload();
    return next(err);
  }
  const filePath = path.join(UPLOADS_DIR, file);
  const base = `${req.protocol}://${req.get('host')}/uploads/`;
  const photoUrl = `${base}${file}`;
  let row;
  try {
    // Before the row: a bucket that refuses the object must fail the
    // upload, not leave a gallery pointing at bytes nobody kept.
    await storage.publish(file);
    const result = await pool.query(
      'INSERT INTO animal_photos (animal_id, url, uploaded_by) VALUES ($1, $2, $3) RETURNING id, url, thumb_url, face_score, uploaded_by, created_at',
      [req.params.id, photoUrl, req.user.userId]
    );
    row = result.rows[0];
  } catch (err) {
    // Nothing references the file yet, so it goes with the failed insert.
    // Past this point the row owns the file: a failure below must not
    // delete it from under the gallery (review finding). A token's file
    // goes back under the pending prefix when the animal is gone (the FK
    // refused the row): no row can own it, and left under its final name
    // it would be a plain file nothing ever reclaims (review finding).
    // Only then — after any other failure a concurrent redeem of the same
    // token may already own the file, and renaming it would hand the
    // sweeper a file a gallery references; a rare leak is the lesser evil.
    if (req.file) discardUpload();
    else if (err.code === '23503') {
      fs.rename(filePath, path.join(UPLOADS_DIR, `${PENDING_PREFIX}${file}`), () => {});
      // The object went up before the row was attempted; this is the one
      // branch that has decided nobody can own the file, so it leaves the
      // bucket too — otherwise the /uploads fallback would keep serving a
      // photo the code deliberately disowned (review finding).
      storage.remove(file);
    }
    return next(err);
  }
  try {
    const species = (await pool.query('SELECT species FROM animals WHERE id = $1', [req.params.id]))
      .rows[0]?.species;
    await attachFaceThumb(row, file, species, base);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
}

/**
 * The profile picture is cut around the face the model finds (P3). Fail
 * open: no face, no answer, or a photo sharp cannot cut leaves the row
 * without a thumbnail and the SVG avatar stands in. Mutates `row`.
 */
async function attachFaceThumb(row, file, species, base) {
  const face = await ai.locateAnimalFace(path.join(UPLOADS_DIR, file), species);
  if (!face?.found) return;
  try {
    const thumb = await makeFaceThumb(file, face.box);
    await storage.publish(thumb);
    const updated = await pool.query(
      'UPDATE animal_photos SET thumb_url = $1, face_score = $2, face_box = $3 WHERE id = $4 RETURNING thumb_url, face_score',
      [`${base}${thumb}`, face.score, JSON.stringify(face.box), row.id]
    );
    Object.assign(row, updated.rows[0]);
  } catch (err) {
    console.warn(`[face] could not cut photo ${row.id}: ${err?.message ?? err}`);
  }
}

/**
 * "Bakım ver": one or two fresh photos of the animal, screened for the
 * species and compared by the model with THIS animal's own gallery (the
 * same comparison the add-animal match runs, restricted to one animal). A
 * "same" verdict on any photo makes the user a carer and puts every sent
 * photo in the gallery; the model saying otherwise is a miss, in
 * Turkish. Without a key, or without an answer, the match is accepted
 * (ADR-0005: the AI fails open) — as is an animal with no photo to
 * compare against, whose first carer photos then become that gallery.
 *
 * An existing carer's photos are screened and stored too, with no
 * comparison, no second carer row, no match attempt and no announcement:
 * that is the clients' "fotoğraf ekle". Until 2026-09-14 (owner batch, B1)
 * a carer got 200 with no photos and the uploads were deleted, so a
 * registrant or a confirmed matcher had no way left to add one.
 */
// Both clients send ONE camera photo since 2026-09-14 (owner batch, C1);
// the server still takes two because app builds already in users' hands
// send two, and multer would refuse them outright under a cap of one.
// "Taken with the camera, now" is a client rule: the resize middleware
// strips EXIF before this runs, iOS camera captures carry no capture date,
// and EXIF is forgeable anyway (ADR-0005 amendment, 2026-09-14).
const MIN_CARE_PHOTOS = 1;
const MAX_CARE_PHOTOS = 2;

async function submitCarePhotos(req, res, next) {
  const files = req.files?.photos ?? [];
  let keepFiles = false;
  try {
    const animalId = Number(req.params.id);
    const animal = (await pool.query('SELECT id, species FROM animals WHERE id = $1', [animalId]))
      .rows[0];
    if (!animal) return res.status(404).json({ error: 'Hayvan bulunamadı' });
    // The upper bound is multer's (maxCount on the route); this is the
    // floor, plus a guard should the two ever drift apart.
    if (files.length < MIN_CARE_PHOTOS || files.length > MAX_CARE_PHOTOS) {
      return res
        .status(400)
        .json({ error: 'Hayvanın yeni bir fotoğrafı gerekli.', code: 'carePhotosRequired' });
    }
    const alreadyCarer = await isCarer(req.user.userId, animalId);

    // Every sender's photos are screened, a carer's included: a carer's
    // direct upload (addPhoto) is screened the same way.
    const checks = await Promise.all(files.map((f) => ai.checkAnimalPhoto(f.path, animal.species)));
    const photoIndexes = checks.flatMap((c, i) => (c.verdict === 'rejected' ? [i] : []));
    if (photoIndexes.length > 0) {
      return photoRejection(res, checks[photoIndexes[0]], animal.species, {
        photoIndex: photoIndexes[0],
        photoIndexes,
      });
    }

    let photoChecked = false;
    let becameCarer = false;
    // The comparison is what grants carer rights; a carer already holds
    // them, so their photos skip it (and cost no comparison calls).
    if (!alreadyCarer) {
      // Every gallery photo is a candidate (best face first, so the cap in
      // ai.js keeps the clearest ones); a candidate's id is the photo's.
      const gallery = await pool.query(
        `SELECT id, url FROM animal_photos WHERE animal_id = $1
         ORDER BY face_score DESC NULLS LAST, created_at DESC`,
        [animalId]
      );
      const candidates = gallery.rows
        .map((p) => ({ id: p.id, filePath: ai.uploadPathFromUrl(p.url, UPLOADS_DIR) }))
        .filter((c) => c.filePath);

      let same = false;
      if (gallery.rows.length > 0 && candidates.length === 0) {
        // Rows without a file: a volume swap, a sweep, a seeded database. The
        // match then passes unchecked, which is worth a line in the log.
        console.warn(
          `[care] animal ${animalId}: none of ${gallery.rows.length} gallery photo(s) is on disk; accepting unchecked`
        );
      }
      if (ai.isConfigured() && candidates.length > 0) {
        for (const file of files) {
          const verdicts = await ai.compareAnimalPhotos(file.path, candidates, animal.species);
          if (!verdicts) continue;
          photoChecked = true;
          if ([...verdicts.values()].includes('same')) {
            same = true;
            break;
          }
        }
      }
      if (photoChecked && !same) {
        return res.status(422).json({
          error:
            'Fotoğraf bu hayvana benzemiyor. Hayvanın net göründüğü yeni bir fotoğraf çekip tekrar dener misin?',
          code: 'carePhotoMismatch',
          photoChecked: true,
        });
      }

      // Two submissions racing past the isCarer read above both land here;
      // the second finds the row in place and announces nothing.
      becameCarer = await addCarer(pool, req.user.userId, animalId);
      await pool.query(
        `INSERT INTO animal_match_attempts (animal_id, user_id, kind, similarity)
         VALUES ($1, $2, 'care', $3)`,
        [animalId, req.user.userId, photoChecked ? 'same' : null]
      );
    }

    // The photos join the gallery: for a new carer they are the evidence of
    // the match and, for an animal without one, its first pictures.
    const base = `${req.protocol}://${req.get('host')}/uploads/`;
    const photos = await storeCarePhotos(files, animal, req.user.userId, base);
    keepFiles = true;

    // Announced once the photos are in the gallery, so the profile a
    // recipient opens from the inbox already shows the evidence.
    if (becameCarer) {
      await notifyAnimalEventSafe({ animalId, kind: 'care', actorId: req.user.userId });
    }
    const animalBadges = await syncAnimalBadgesSafe(animalId);
    const counts = (
      await pool.query(
        `SELECT (SELECT count(*) FROM user_animal_care WHERE animal_id = $1)::int AS carers,
                EXISTS (SELECT 1 FROM animal_followers WHERE animal_id = $1 AND user_id = $2) AS following`,
        [animalId, req.user.userId]
      )
    ).rows[0];
    res.status(201).json({
      matched: true,
      alreadyCarer,
      photoChecked,
      photos,
      carerCount: counts.carers,
      // A new carer follows (addCarer); an existing one may have unfollowed.
      following: counts.following,
      followerCount: await followerCount(animalId),
      animalBadges,
    });
  } catch (err) {
    next(err);
  } finally {
    // Renamed files are gone from their pending path; unlink on a missing
    // path is a no-op, so the loop is safe after a partial success too.
    if (!keepFiles) for (const file of files) fs.unlink(file.path, () => {});
  }
}

/**
 * Moves the care-photo uploads (still under the pending prefix) into the
 * animal's gallery and returns the new rows. Pending files become plain
 * ones the moment a row is about to own them (see redeemPhotoToken). On a
 * failure it has already put back under the pending prefix — and out of
 * the bucket — every file no row owns, then throws; the caller's `finally`
 * unlinks those. Shared by a new carer's and an existing carer's photos.
 */
async function storeCarePhotos(files, animal, userId, base) {
  const photos = [];
  // Every file is renamed and published BEFORE the first row is written.
  // Doing it inside the insert loop meant a bucket that refused the
  // SECOND photo of two left the user a carer looking at an error, with photo
  // one already in the gallery and its file stranded under a final name
  // the pending sweeper never looks at — and the obvious client retry
  // then added photo one twice (review finding).
  const finalNames = files.map((f) => pendingToFinal(f.filename));
  try {
    for (let i = 0; i < files.length; i += 1) {
      await fs.promises.rename(files[i].path, path.join(UPLOADS_DIR, finalNames[i]));
      await storage.publish(finalNames[i]);
    }
  } catch (err) {
    // Back under the pending prefix — which is exactly where `finally`
    // expects them, so they are unlinked on the way out — and out of the
    // bucket, since nothing will ever reference them.
    for (const name of finalNames) {
      await fs.promises
        .rename(path.join(UPLOADS_DIR, name), path.join(UPLOADS_DIR, `${PENDING_PREFIX}${name}`))
        .catch(() => {});
      storage.remove(name);
    }
    throw err;
  }
  // `owned` grows as rows take ownership: a failure below must clean up
  // the files NOBODY owns yet and leave the rest alone. Without it a
  // database blip after the publish loop left the files under their
  // final names — which the pending sweeper never looks at — plus their
  // objects in the bucket, forever, per attempt (second review round).
  let owned = 0;
  try {
    for (const finalName of finalNames) {
      const inserted = await pool.query(
        'INSERT INTO animal_photos (animal_id, url, uploaded_by) VALUES ($1, $2, $3) RETURNING id, url, thumb_url, face_score, uploaded_by, created_at',
        [animal.id, `${base}${finalName}`, userId]
      );
      owned += 1;
      const row = inserted.rows[0];
      await attachFaceThumb(row, finalName, animal.species, base);
      photos.push({ ...row, like_count: 0, liked_by_me: false });
    }
  } catch (err) {
    for (const name of finalNames.slice(owned)) {
      await fs.promises
        .rename(path.join(UPLOADS_DIR, name), path.join(UPLOADS_DIR, `${PENDING_PREFIX}${name}`))
        .catch(() => {});
      storage.remove(name);
    }
    throw err;
  }
  return photos;
}

async function isCarer(userId, animalId) {
  const result = await pool.query(
    'SELECT 1 FROM user_animal_care WHERE user_id = $1 AND animal_id = $2',
    [userId, animalId]
  );
  return result.rows.length > 0;
}

async function addHealthRecord(req, res, next) {
  try {
    const { recordType, description, vetVerified } = req.body;
    // Treatment/vaccine/medication record types were removed: vaccines live
    // in their own table, and treatment/medication are tracked through
    // record-linked comments anyway.
    if (!HEALTH_RECORD_TYPES.includes(recordType)) {
      return res.status(400).json({ error: 'recordType yalnızca illness veya injury olabilir' });
    }
    // description is either a listed title or free text entered via "Diğer";
    // both share one column, so we only check for empty/overlong here.
    if (!isValidChoice(description, null, { maxLength: 200 })) {
      return res.status(400).json({ error: 'description zorunludur (en fazla 200 karakter)' });
    }

    // Only the animal's carers may add health records.
    if (!(await isCarer(req.user.userId, req.params.id))) {
      return carersOnly(res, 'Sağlık kaydı ekleyebilmek');
    }

    const isVet = req.user.role === 'vet' || req.user.role === 'admin';
    const inserted = await pool.query(
      `INSERT INTO health_records (animal_id, record_type, description, vet_verified, recorded_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.params.id, recordType, description, Boolean(vetVerified) && isVet, req.user.userId]
    );
    const result = await pool.query(`${HEALTH_RECORD_SELECT_SQL} WHERE h.id = $1`, [
      inserted.rows[0].id,
    ]);
    await notifyAnimalEventSafe({
      animalId: Number(req.params.id),
      kind: 'health_record',
      actorId: req.user.userId,
      text: description,
    });
    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    res.status(201).json({ ...result.rows[0], newBadges });
  } catch (err) {
    next(err);
  }
}

// Marks a health record as recovered. Recovered records close: no further
// comments (see addComment), so the historical trail stays fixed.
async function markRecovered(req, res, next) {
  try {
    if (!(await isCarer(req.user.userId, req.params.id))) {
      return carersOnly(res, 'Durumu değiştirebilmek');
    }

    // Conditional UPDATE instead of check-then-update: two concurrent
    // requests must not both pass the state check. Zero rows then means
    // "missing or already in that state" — one SELECT tells which.
    const updated = await pool.query(
      `UPDATE health_records SET recovered_at = now(), recovered_by = $1
       WHERE id = $2 AND animal_id = $3 AND recovered_at IS NULL RETURNING id`,
      [req.user.userId, req.params.recordId, req.params.id]
    );
    if (updated.rows.length === 0) {
      const existing = await pool.query(
        'SELECT id FROM health_records WHERE id = $1 AND animal_id = $2',
        [req.params.recordId, req.params.id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Sağlık kaydı bulunamadı' });
      }
      return res.status(409).json({ error: 'Bu kayıt zaten iyileşti olarak işaretlenmiş' });
    }
    const result = await pool.query(`${HEALTH_RECORD_SELECT_SQL} WHERE h.id = $1`, [
      req.params.recordId,
    ]);
    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    // A recovery is one of the animal's own badge counts (ANIMAL_BADGES.recovered).
    await syncAnimalBadgesSafe(Number(req.params.id));
    res.json({ ...result.rows[0], newBadges });
  } catch (err) {
    next(err);
  }
}

// Undoes markRecovered: a mis-tap or a premature call may be noticed much
// later (the animal turns out to still be sick), so any carer can reopen at
// any time — status is derived, so clearing the timestamp reopens comments
// with nothing else to sync. Earned badges stay by design (badges never
// demote), so no badge sync runs here.
async function reopenRecord(req, res, next) {
  try {
    if (!(await isCarer(req.user.userId, req.params.id))) {
      return carersOnly(res, 'Durumu değiştirebilmek');
    }

    // Same conditional-UPDATE shape as markRecovered, for the same race.
    const updated = await pool.query(
      `UPDATE health_records SET recovered_at = NULL, recovered_by = NULL
       WHERE id = $1 AND animal_id = $2 AND recovered_at IS NOT NULL RETURNING id`,
      [req.params.recordId, req.params.id]
    );
    if (updated.rows.length === 0) {
      const existing = await pool.query(
        'SELECT id FROM health_records WHERE id = $1 AND animal_id = $2',
        [req.params.recordId, req.params.id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Sağlık kaydı bulunamadı' });
      }
      return res.status(409).json({ error: 'Bu kayıt zaten açık' });
    }
    const result = await pool.query(`${HEALTH_RECORD_SELECT_SQL} WHERE h.id = $1`, [
      req.params.recordId,
    ]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// Vaccination record. Two differences from a health record: no "recovered",
// a next-due date instead. Who may add is the same — carers only.
async function addVaccination(req, res, next) {
  try {
    const { vaccineType, note, administeredAt, nextDueAt, vetVerified } = req.body;
    if (!isValidChoice(vaccineType, null, { maxLength: 120 })) {
      return res.status(400).json({ error: 'vaccineType zorunludur (en fazla 120 karakter)' });
    }

    if (!(await isCarer(req.user.userId, req.params.id))) {
      return carersOnly(res, 'Aşı kaydı ekleyebilmek');
    }

    // Only the vet/admin role can grant vet verification; a user's claim
    // must not carry the same weight as an official record.
    const isVet = req.user.role === 'vet' || req.user.role === 'admin';

    const inserted = await pool.query(
      `INSERT INTO vaccinations
         (animal_id, vaccine_type, note, vet_verified, administered_at, next_due_at, recorded_by)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6, $7)
       RETURNING id`,
      [
        req.params.id,
        String(vaccineType).trim(),
        note ? String(note).trim() : null,
        Boolean(vetVerified) && isVet,
        administeredAt || null,
        nextDueAt || null,
        req.user.userId,
      ]
    );

    const result = await pool.query(`${VACCINATION_SELECT_SQL} WHERE v.id = $1`, [
      inserted.rows[0].id,
    ]);
    await notifyAnimalEventSafe({
      animalId: Number(req.params.id),
      kind: 'vaccination',
      actorId: req.user.userId,
      text: String(vaccineType).trim(),
    });
    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    res.status(201).json({ ...result.rows[0], newBadges });
  } catch (err) {
    next(err);
  }
}

const COMMENT_SELECT_SQL = `
  SELECT c.id, c.body, c.created_at, c.health_record_id,
         u.id AS user_id, u.name AS user_name, u.avatar_url, u.is_demo AS user_is_demo,
         h.record_type AS health_record_type, h.description AS health_record_description
  FROM animal_comments c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN health_records h ON h.id = c.health_record_id
`;

// The chat paginates newest-backwards: the client takes the last N comments
// first, and offset grows as it loads older ones. Pages return in
// chronological (old → new) order so the screen can append them directly.
const DEFAULT_COMMENT_LIMIT = 20;
const MAX_COMMENT_LIMIT = 100;

async function listComments(req, res, next) {
  try {
    const { healthRecordId } = req.query;
    const { limit, offset } = pageParams(req.query, DEFAULT_COMMENT_LIMIT, MAX_COMMENT_LIMIT);
    const params = [req.params.id];
    let filter = '';
    if (healthRecordId) {
      params.push(healthRecordId);
      filter = `AND c.health_record_id = $${params.length}`;
    }
    const countParams = [...params];
    params.push(limit, offset);

    const [page, count] = await Promise.all([
      pool.query(
        `${COMMENT_SELECT_SQL}
         WHERE c.animal_id = $1 ${filter}
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT $${params.length - 1}::int OFFSET $${params.length}::int`,
        params
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM animal_comments c WHERE c.animal_id = $1 ${filter}`,
        countParams
      ),
    ]);
    res.json({ comments: page.rows.reverse(), total: count.rows[0].count });
  } catch (err) {
    next(err);
  }
}

async function addComment(req, res, next) {
  try {
    const { body, healthRecordId } = req.body;
    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: 'body zorunludur' });
    }

    const animalCheck = await pool.query('SELECT id FROM animals WHERE id = $1', [req.params.id]);
    if (animalCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Hayvan bulunamadı' });
    }

    if (healthRecordId) {
      const recordCheck = await pool.query(
        'SELECT id, recovered_at FROM health_records WHERE id = $1 AND animal_id = $2',
        [healthRecordId, req.params.id]
      );
      if (recordCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Sağlık kaydı bu hayvana ait değil' });
      }
      if (recordCheck.rows[0].recovered_at) {
        return res.status(409).json({ error: 'İyileşmiş bir kayda yorum eklenemez' });
      }
    }

    // Carers only (owner decision, 2026-09-08): commenting used to make
    // the writer a carer; now carer rights come from the care-photo step
    // and the chat is the carers' room. Followers read it and get told.
    if (!(await isCarer(req.user.userId, req.params.id))) {
      return carersOnly(res, 'Yorum yazabilmek');
    }

    const inserted = await pool.query(
      `INSERT INTO animal_comments (animal_id, user_id, health_record_id, body)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.params.id, req.user.userId, healthRecordId || null, String(body).trim()]
    );

    const result = await pool.query(`${COMMENT_SELECT_SQL} WHERE c.id = $1`, [inserted.rows[0].id]);
    await notifyAnimalEventSafe({
      animalId: Number(req.params.id),
      kind: 'comment',
      actorId: req.user.userId,
      text: String(body).trim().slice(0, 140),
    });
    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    await syncAnimalBadgesSafe(Number(req.params.id));
    res.status(201).json({ ...result.rows[0], newBadges });
  } catch (err) {
    next(err);
  }
}

async function followerCount(animalId) {
  const result = await pool.query(
    'SELECT count(*)::int AS count FROM animal_followers WHERE animal_id = $1',
    [animalId]
  );
  return result.rows[0].count;
}

// "Takip et": no condition, toggles. A follower likes photos and hears
// about the animal's events; carer rights are the care-photo step's.
async function followAnimal(req, res, next) {
  try {
    const inserted = await pool.query(
      'INSERT INTO animal_followers (animal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.userId]
    );
    if (inserted.rowCount > 0) await syncAnimalBadgesSafe(Number(req.params.id));
    res.status(201).json({ following: true, followerCount: await followerCount(req.params.id) });
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Hayvan bulunamadı' });
    next(err);
  }
}

async function unfollowAnimal(req, res, next) {
  try {
    await pool.query('DELETE FROM animal_followers WHERE animal_id = $1 AND user_id = $2', [
      req.params.id,
      req.user.userId,
    ]);
    res.json({ following: false, followerCount: await followerCount(req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function photoLikeState(photoId, userId) {
  const result = await pool.query(
    `SELECT count(*)::int AS like_count,
            bool_or(user_id = $2) AS liked_by_me
     FROM animal_photo_likes WHERE photo_id = $1`,
    [photoId, userId]
  );
  return { likeCount: result.rows[0].like_count, liked: result.rows[0].liked_by_me === true };
}

// One like per user per photo, open to everyone signed in (the one thing
// a non-carer may do besides following). The photo must belong to the
// animal in the URL, or a like could be parked on any photo by id.
async function likePhoto(req, res, next) {
  try {
    const photo = await pool.query(
      'SELECT id FROM animal_photos WHERE id = $1 AND animal_id = $2',
      [req.params.photoId, req.params.id]
    );
    if (photo.rows.length === 0) return res.status(404).json({ error: 'Fotoğraf bulunamadı' });
    const inserted = await pool.query(
      'INSERT INTO animal_photo_likes (photo_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.photoId, req.user.userId]
    );
    if (inserted.rowCount > 0) await syncAnimalBadgesSafe(Number(req.params.id));
    res.status(201).json(await photoLikeState(req.params.photoId, req.user.userId));
  } catch (err) {
    next(err);
  }
}

async function unlikePhoto(req, res, next) {
  try {
    const photo = await pool.query(
      'SELECT id FROM animal_photos WHERE id = $1 AND animal_id = $2',
      [req.params.photoId, req.params.id]
    );
    if (photo.rows.length === 0) return res.status(404).json({ error: 'Fotoğraf bulunamadı' });
    await pool.query('DELETE FROM animal_photo_likes WHERE photo_id = $1 AND user_id = $2', [
      req.params.photoId,
      req.user.userId,
    ]);
    res.json(await photoLikeState(req.params.photoId, req.user.userId));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  MAX_MATCH_PHOTOS,
  listAnimals,
  matchAnimals,
  getAnimal,
  createAnimal,
  reportSighting,
  addPhoto,
  addHealthRecord,
  addVaccination,
  markRecovered,
  reopenRecord,
  listComments,
  addComment,
  followAnimal,
  unfollowAnimal,
  likePhoto,
  unlikePhoto,
  submitCarePhotos,
  MAX_CARE_PHOTOS,
};
