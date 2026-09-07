const fs = require('fs');
const pool = require('../config/db');
const { UPLOADS_DIR } = require('../config/upload');
const { syncBadgeAwardsSafe } = require('../utils/badgeAwards');
const ai = require('../utils/ai');
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

const COVER_PHOTO_JOIN = `
  LEFT JOIN LATERAL (
    SELECT url FROM animal_photos WHERE animal_id = a.id ORDER BY created_at ASC LIMIT 1
  ) cover ON true
`;

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
    const { limit, offset } = pageParams(req.query);
    const speciesFilter = species ? 'AND a.species = $SPECIES' : '';

    if (lat && lng) {
      // With a radius (the map's viewport pull) the circle bounds the set;
      // without one (the animals list, owner decision 2026-09-07) the whole
      // table is walked nearest-first — `<->` on geography is a KNN index
      // scan on the GIST index, so page one costs the same in a city or a
      // village and the list never runs out before the animals do.
      const bounded = radiusMeters !== undefined && radiusMeters !== '';
      const params = bounded ? [lng, lat, radiusMeters, limit, offset] : [lng, lat, limit, offset];
      const point = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography';
      let sql = `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at,
                        ST_AsGeoJSON(a.location)::json AS location, cover.url AS cover_photo_url,
                        ST_Distance(a.location, ${point}) AS distance_meters
                 FROM animals a
                 ${COVER_PHOTO_JOIN}
                 WHERE ${bounded ? `ST_DWithin(a.location, ${point}, $3)` : 'true'}
                 ${speciesFilter}
                 ORDER BY a.location <-> ${point}, a.id
                 LIMIT $${bounded ? 4 : 3}::int OFFSET $${bounded ? 5 : 4}::int`;
      if (species) {
        params.push(species);
        sql = sql.replace('$SPECIES', `$${params.length}`);
      }
      const result = await pool.query(sql, params);
      return res.json(result.rows);
    }

    const params = [limit, offset];
    let sql = `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at,
                      ST_AsGeoJSON(a.location)::json AS location, cover.url AS cover_photo_url
               FROM animals a
               ${COVER_PHOTO_JOIN}
               WHERE true
               ${speciesFilter}
               ORDER BY a.created_at DESC, a.id DESC
               LIMIT $1::int OFFSET $2::int`;
    if (species) {
      params.push(species);
      sql = sql.replace('$SPECIES', `$${params.length}`);
    }
    const result = await pool.query(sql, params);
    res.json(result.rows);
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
 * GET carries the fields only; POST (multipart) adds the first photo, and
 * the photo is compared with the cover photos of the best field-ranked
 * candidates. The upload is a scratch file: it is deleted here whatever
 * happens, the animal's photos are added after the user decides.
 */
async function matchAnimals(req, res, next) {
  const photoPath = req.file?.path;
  try {
    const source = req.method === 'POST' ? req.body : req.query;
    const { lat, lng, species, breed, color } = source;
    if (!species || !['cat', 'dog'].includes(species)) {
      return res.status(400).json({ error: 'species cat veya dog olmalıdır' });
    }
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }

    const result = await pool.query(
      `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at,
              ST_AsGeoJSON(a.location)::json AS location, cover.url AS cover_photo_url,
              ST_Distance(a.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
       FROM animals a
       ${COVER_PHOTO_JOIN}
       WHERE ST_DWithin(a.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         AND a.species = $4
       ORDER BY distance_meters, a.id
       LIMIT 200`,
      [lng, lat, MATCH_RADIUS_METERS, species]
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
    const candidates = shown.map(({ _score, _reasons, ...rest }) => ({
      ...rest,
      similarity: tierFor(_score),
      similarity_reasons: _reasons,
    }));

    res.json({ candidates, radiusMeters: MATCH_RADIUS_METERS, photoChecked });
  } catch (err) {
    next(err);
  } finally {
    if (photoPath) fs.unlink(photoPath, () => {});
  }
}

async function getAnimal(req, res, next) {
  try {
    const animalResult = await pool.query(
      `SELECT id, species, name, color, breed, markings, created_by, created_at, location_updated_at,
              ST_AsGeoJSON(location)::json AS location
       FROM animals WHERE id = $1`,
      [req.params.id]
    );
    if (animalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Hayvan bulunamadı' });
    }

    const [photos, healthRecords, vaccinations, carers] = await Promise.all([
      pool.query(
        'SELECT id, url, uploaded_by, created_at FROM animal_photos WHERE animal_id = $1 ORDER BY created_at DESC',
        [req.params.id]
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
        `SELECT u.id, u.name, u.avatar_url FROM user_animal_care c
         JOIN users u ON u.id = c.user_id
         WHERE c.animal_id = $1
         ORDER BY c.created_at`,
        [req.params.id]
      ),
    ]);

    const isCarer = carers.rows.some((c) => c.id === req.user.userId);

    res.json({
      ...animalResult.rows[0],
      photos: photos.rows,
      healthRecords: healthRecords.rows,
      vaccinations: vaccinations.rows,
      carers: carers.rows,
      isCarer,
    });
  } catch (err) {
    next(err);
  }
}

// Reporting a sighting of a registered animal: moves the animal's current
// location to the reporter's position and adds the reporter as a carer. Also
// called when "it's already registered" is chosen while adding a new animal.
async function reportSighting(req, res, next) {
  try {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }

    const result = await pool.query(
      `UPDATE animals
       SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           location_updated_at = now()
       WHERE id = $3
       RETURNING id, species, name, color, breed, markings, created_at, location_updated_at,
                 ST_AsGeoJSON(location)::json AS location`,
      [lng, lat, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Hayvan bulunamadı' });
    }

    await pool.query(
      'INSERT INTO user_animal_care (user_id, animal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, req.params.id]
    );

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
        lng,
        lat,
        req.user.userId,
      ]
    );

    const animal = result.rows[0];
    await pool.query(
      'INSERT INTO user_animal_care (user_id, animal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, animal.id]
    );

    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    res.status(201).json({ ...animal, newBadges });
  } catch (err) {
    next(err);
  }
}

async function addPhoto(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fotoğraf zorunludur' });
    }

    const photoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    const result = await pool.query(
      'INSERT INTO animal_photos (animal_id, url, uploaded_by) VALUES ($1, $2, $3) RETURNING id, url, uploaded_by, created_at',
      [req.params.id, photoUrl, req.user.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    next(err);
  }
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
      return res.status(403).json({
        error: 'Sağlık kaydı ekleyebilmek için önce bu hayvana bakım veriyor olmalısınız',
      });
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
      return res.status(403).json({
        error: 'Durumu değiştirebilmek için bu hayvana bakım veriyor olmalısınız',
      });
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
      return res.status(403).json({
        error: 'Durumu değiştirebilmek için bu hayvana bakım veriyor olmalısınız',
      });
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
      return res.status(403).json({
        error: 'Aşı kaydı ekleyebilmek için önce bu hayvana bakım veriyor olmalısınız',
      });
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
    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    res.status(201).json({ ...result.rows[0], newBadges });
  } catch (err) {
    next(err);
  }
}

const COMMENT_SELECT_SQL = `
  SELECT c.id, c.body, c.created_at, c.health_record_id,
         u.id AS user_id, u.name AS user_name, u.avatar_url,
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

    // Commenting also adds the person to the animal's carer list: anyone
    // joining the chat is de facto involved with the animal.
    await pool.query(
      'INSERT INTO user_animal_care (user_id, animal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, req.params.id]
    );

    const inserted = await pool.query(
      `INSERT INTO animal_comments (animal_id, user_id, health_record_id, body)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.params.id, req.user.userId, healthRecordId || null, String(body).trim()]
    );

    const result = await pool.query(`${COMMENT_SELECT_SQL} WHERE c.id = $1`, [inserted.rows[0].id]);
    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    res.status(201).json({ ...result.rows[0], newBadges });
  } catch (err) {
    next(err);
  }
}

async function followAnimal(req, res, next) {
  try {
    await pool.query(
      'INSERT INTO user_animal_care (user_id, animal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, req.params.id]
    );

    const carers = await pool.query(
      `SELECT u.id, u.name FROM user_animal_care c
       JOIN users u ON u.id = c.user_id
       WHERE c.animal_id = $1 AND u.id != $2`,
      [req.params.id, req.user.userId]
    );
    res.status(201).json({ following: true, otherCarers: carers.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
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
};
