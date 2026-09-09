const fs = require('fs');
const ai = require('../utils/ai');
const { UPLOADS_DIR } = require('../config/upload');
const storage = require('../config/storage');
const pool = require('../config/db');
const { coverPhotoJoin } = require('../utils/coverPhoto');
const { writeAuditLog } = require('../utils/auditLog');
const { SLOTS } = require('./ad.controller');

const MAX_PAGE_SIZE = 100;

function pagination(req) {
  const limit = Math.min(Number(req.query.limit) || 25, MAX_PAGE_SIZE);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}

/**
 * Builds filter conditions with placeholders starting at $1. The same filter
 * serves both the paginated list and the total count; pagination parameters
 * (limit/offset) are appended *after* the filter, so both queries share the
 * same `where` text — no manual renumbering of placeholders.
 */
function filterBuilder() {
  const conditions = [];
  const params = [];
  return {
    add(sqlFor, value) {
      params.push(value);
      conditions.push(sqlFor(params.length));
    },
    get where() {
      return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    },
    get params() {
      return params;
    },
    // For the paginated query: filter parameters + limit/offset
    paged(limit, offset) {
      return {
        params: [...params, limit, offset],
        limitClause: `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      };
    },
  };
}

// -------------------------------------------------------------------------
// Dashboard
// -------------------------------------------------------------------------

async function getStats(req, res, next) {
  try {
    const [totals, daily, species, health, vaccines] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT count(*) FROM users)::int AS users,
           (SELECT count(*) FROM users WHERE suspended_at IS NOT NULL)::int AS suspended_users,
           (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::int AS new_users_7d,
           (SELECT count(*) FROM animals)::int AS animals,
           (SELECT count(*) FROM care_actions)::int AS care_actions,
           (SELECT count(*) FROM care_actions WHERE created_at > now() - interval '24 hours')::int AS care_actions_24h,
           (SELECT count(*) FROM animal_comments)::int AS comments,
           (SELECT count(*) FROM health_records)::int AS health_records,
           (SELECT count(*) FROM health_records WHERE recovered_at IS NOT NULL)::int AS recovered_records,
           (SELECT count(*) FROM vaccinations)::int AS vaccinations,
           (SELECT count(*) FROM vaccinations WHERE vet_verified)::int AS vet_verified_vaccinations`
      ),
      // Daily activity for the last 30 days. generate_series returns empty
      // days as 0 too; otherwise the chart looks like days were skipped.
      pool.query(
        `SELECT d::date AS day,
                COALESCE(ca.food, 0)::int AS food,
                COALESCE(ca.water, 0)::int AS water,
                COALESCE(an.count, 0)::int AS animals,
                COALESCE(co.count, 0)::int AS comments
         FROM generate_series(now()::date - interval '29 days', now()::date, interval '1 day') d
         LEFT JOIN (
           SELECT created_at::date AS day,
                  count(*) FILTER (WHERE action_type = 'food') AS food,
                  count(*) FILTER (WHERE action_type = 'water') AS water
           FROM care_actions GROUP BY 1
         ) ca ON ca.day = d::date
         LEFT JOIN (
           SELECT created_at::date AS day, count(*) AS count FROM animals GROUP BY 1
         ) an ON an.day = d::date
         LEFT JOIN (
           SELECT created_at::date AS day, count(*) AS count FROM animal_comments GROUP BY 1
         ) co ON co.day = d::date
         ORDER BY d`
      ),
      pool.query(
        `SELECT species, count(*)::int AS count FROM animals GROUP BY species ORDER BY count DESC`
      ),
      pool.query(
        `SELECT record_type, count(*)::int AS count FROM health_records
         GROUP BY record_type ORDER BY count DESC`
      ),
      pool.query(
        `SELECT vaccine_type, count(*)::int AS count FROM vaccinations
         GROUP BY vaccine_type ORDER BY count DESC`
      ),
    ]);

    res.json({
      totals: totals.rows[0],
      daily: daily.rows,
      species: species.rows,
      healthRecordTypes: health.rows,
      vaccineTypes: vaccines.rows,
    });
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------------------
// Users
// -------------------------------------------------------------------------

async function listUsers(req, res, next) {
  try {
    const { limit, offset } = pagination(req);
    const q = (req.query.q || '').trim();

    const filter = filterBuilder();
    if (q) filter.add((i) => `(u.name ILIKE $${i} OR u.email ILIKE $${i})`, `%${q}%`);
    const paged = filter.paged(limit, offset);

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.avatar_url, u.created_at,
                u.suspended_at, u.suspended_reason, u.last_points,
                (SELECT count(*) FROM care_actions c WHERE c.user_id = u.id)::int AS care_action_count,
                (SELECT count(*) FROM animals a WHERE a.created_by = u.id)::int AS animal_count,
                (SELECT count(*) FROM animal_comments ac WHERE ac.user_id = u.id)::int AS comment_count
         FROM users u
         ${filter.where}
         ORDER BY u.created_at DESC
         ${paged.limitClause}`,
        paged.params
      ),
      pool.query(`SELECT count(*)::int AS count FROM users u ${filter.where}`, filter.params),
    ]);

    res.json({ users: rows.rows, total: total.rows[0].count });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    const { role, suspended, suspendedReason } = req.body;

    if (role !== undefined && !['user', 'vet', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Geçersiz rol' });
    }
    // Demoting yourself or suspending yourself can lock the panel out
    // entirely, so both are blocked.
    if (targetId === req.user.userId && (role !== undefined || suspended !== undefined)) {
      return res.status(400).json({ error: 'Kendi rolünüzü veya durumunuzu değiştiremezsiniz' });
    }

    const existing = await pool.query('SELECT id, role, suspended_at FROM users WHERE id = $1', [
      targetId,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    const updates = [];
    const params = [];
    if (role !== undefined) {
      params.push(role);
      updates.push(`role = $${params.length}`);
    }
    if (suspended !== undefined) {
      if (suspended) {
        params.push(suspendedReason || null);
        updates.push(`suspended_at = now(), suspended_reason = $${params.length}`);
      } else {
        updates.push('suspended_at = NULL, suspended_reason = NULL');
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Değiştirilecek bir alan gönderilmedi' });
    }

    params.push(targetId);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, email, role, avatar_url, created_at, suspended_at, suspended_reason`,
      params
    );

    await writeAuditLog(req.user.userId, 'user.update', 'user', targetId, {
      role,
      suspended,
      suspendedReason,
      previousRole: existing.rows[0].role,
    });

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------------------
// Animals
// -------------------------------------------------------------------------

async function listAnimals(req, res, next) {
  try {
    const { limit, offset } = pagination(req);
    const q = (req.query.q || '').trim();
    const species = req.query.species;

    const filter = filterBuilder();
    if (q) filter.add((i) => `(a.name ILIKE $${i} OR a.breed ILIKE $${i})`, `%${q}%`);
    if (species === 'cat' || species === 'dog') filter.add((i) => `a.species = $${i}`, species);
    const paged = filter.paged(limit, offset);

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings,
                a.created_at, a.location_updated_at,
                ST_AsGeoJSON(a.location)::json AS location,
                u.id AS created_by_id, u.name AS created_by_name,
                cover.url AS cover_photo_url, cover.thumb_url AS cover_thumb_url,
                (SELECT count(*) FROM animal_photos p WHERE p.animal_id = a.id)::int AS photo_count,
                (SELECT count(*) FROM animal_comments c WHERE c.animal_id = a.id)::int AS comment_count,
                (SELECT count(*) FROM user_animal_care uac WHERE uac.animal_id = a.id)::int AS carer_count,
                (SELECT count(*) FROM vaccinations v WHERE v.animal_id = a.id)::int AS vaccination_count
         FROM animals a
         JOIN users u ON u.id = a.created_by
         ${coverPhotoJoin('a')}
         ${filter.where}
         ORDER BY a.created_at DESC
         ${paged.limitClause}`,
        paged.params
      ),
      pool.query(`SELECT count(*)::int AS count FROM animals a ${filter.where}`, filter.params),
    ]);

    res.json({ animals: rows.rows, total: total.rows[0].count });
  } catch (err) {
    next(err);
  }
}

async function updateAnimal(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    const { name, color, breed, markings, species } = req.body;

    if (species !== undefined && !['cat', 'dog'].includes(species)) {
      return res.status(400).json({ error: 'species cat veya dog olmalıdır' });
    }

    const result = await pool.query(
      `UPDATE animals SET
         name = COALESCE($1, name),
         color = COALESCE($2, color),
         breed = COALESCE($3, breed),
         markings = COALESCE($4, markings),
         species = COALESCE($5, species)
       WHERE id = $6
       RETURNING id, species, name, color, breed, markings, created_at`,
      [name ?? null, color ?? null, breed ?? null, markings ?? null, species ?? null, targetId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Hayvan bulunamadı' });
    }

    await writeAuditLog(req.user.userId, 'animal.update', 'animal', targetId, req.body);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteAnimal(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    // The photo rows cascade; their files (and the face cut-outs) would
    // stay on the volume forever — collect before, unlink after.
    const files = (
      await pool.query('SELECT url, thumb_url FROM animal_photos WHERE animal_id = $1', [targetId])
    ).rows.flatMap((p) => [p.url, p.thumb_url]);
    const result = await pool.query(
      'DELETE FROM animals WHERE id = $1 RETURNING id, species, name, breed',
      [targetId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Hayvan bulunamadı' });
    }
    for (const url of files) {
      const file = ai.uploadPathFromUrl(url, UPLOADS_DIR);
      if (file) fs.unlink(file, () => {});
      // Keyed off the URL, not the cached file: an object this machine
      // never pulled down still has to leave the bucket.
      const remote = /\/uploads\/([^/?#]+)/.exec(url ?? '');
      if (remote) storage.remove(remote[1]);
    }

    // The deleted record's content goes into the audit log: the row is gone,
    // but "what was deleted" must stay answerable.
    await writeAuditLog(req.user.userId, 'animal.delete', 'animal', targetId, result.rows[0]);
    res.json({ deleted: true, animal: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * Merges two animal records: the source record's photos, comments, health
 * records and carers move to the target, and the source is deleted.
 *
 * Duplicates are resolved by hand today (until AI matching lands), so this
 * will be the panel's most-used function. It runs in a single transaction:
 * a half-finished merge would leave two broken records.
 */
async function mergeAnimals(req, res, next) {
  const client = await pool.connect();
  try {
    const targetId = Number(req.params.id);
    const sourceId = Number(req.body.sourceId);

    if (!Number.isInteger(sourceId)) {
      return res.status(400).json({ error: 'sourceId zorunludur' });
    }
    if (sourceId === targetId) {
      return res.status(400).json({ error: 'Bir hayvan kendisiyle birleştirilemez' });
    }

    const check = await client.query('SELECT id FROM animals WHERE id = ANY($1::int[])', [
      [targetId, sourceId],
    ]);
    if (check.rows.length !== 2) {
      return res.status(404).json({ error: 'Hayvanlardan biri bulunamadı' });
    }

    await client.query('BEGIN');

    await client.query('UPDATE animal_photos SET animal_id = $1 WHERE animal_id = $2', [
      targetId,
      sourceId,
    ]);
    await client.query('UPDATE animal_comments SET animal_id = $1 WHERE animal_id = $2', [
      targetId,
      sourceId,
    ]);
    await client.query('UPDATE health_records SET animal_id = $1 WHERE animal_id = $2', [
      targetId,
      sourceId,
    ]);
    // user_animal_care has a composite primary key; ON CONFLICT is needed in
    // case the same person cares for both records.
    await client.query(
      `INSERT INTO user_animal_care (user_id, animal_id, created_at)
       SELECT user_id, $1, created_at FROM user_animal_care WHERE animal_id = $2
       ON CONFLICT DO NOTHING`,
      [targetId, sourceId]
    );
    await client.query('DELETE FROM user_animal_care WHERE animal_id = $1', [sourceId]);

    const removed = await client.query(
      'DELETE FROM animals WHERE id = $1 RETURNING id, species, name, breed',
      [sourceId]
    );

    await client.query('COMMIT');

    await writeAuditLog(req.user.userId, 'animal.merge', 'animal', targetId, {
      sourceId,
      removed: removed.rows[0],
    });

    const merged = await pool.query(
      `SELECT a.id, a.species, a.name, a.breed,
              (SELECT count(*) FROM animal_photos p WHERE p.animal_id = a.id)::int AS photo_count,
              (SELECT count(*) FROM animal_comments c WHERE c.animal_id = a.id)::int AS comment_count,
              (SELECT count(*) FROM user_animal_care uac WHERE uac.animal_id = a.id)::int AS carer_count
       FROM animals a WHERE a.id = $1`,
      [targetId]
    );

    res.json({ merged: true, animal: merged.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// -------------------------------------------------------------------------
// Care actions (photo moderation)
// -------------------------------------------------------------------------

async function listCareActions(req, res, next) {
  try {
    const { limit, offset } = pagination(req);
    const actionType = req.query.actionType;
    const userId = req.query.userId ? Number(req.query.userId) : null;

    const filter = filterBuilder();
    if (actionType === 'food' || actionType === 'water') {
      filter.add((i) => `c.action_type = $${i}`, actionType);
    }
    if (userId) filter.add((i) => `c.user_id = $${i}`, userId);
    const paged = filter.paged(limit, offset);

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT c.id, c.action_type, c.photo_url, c.created_at,
                ST_AsGeoJSON(c.location)::json AS location,
                u.id AS user_id, u.name AS user_name, u.suspended_at AS user_suspended_at
         FROM care_actions c
         JOIN users u ON u.id = c.user_id
         ${filter.where}
         ORDER BY c.created_at DESC
         ${paged.limitClause}`,
        paged.params
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM care_actions c ${filter.where}`,
        filter.params
      ),
    ]);

    res.json({ careActions: rows.rows, total: total.rows[0].count });
  } catch (err) {
    next(err);
  }
}

async function deleteCareAction(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    const { reason } = req.body || {};
    const result = await pool.query(
      'DELETE FROM care_actions WHERE id = $1 RETURNING id, user_id, action_type, photo_url, created_at',
      [targetId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bakım kaydı bulunamadı' });
    }

    await writeAuditLog(req.user.userId, 'careAction.delete', 'careAction', targetId, {
      ...result.rows[0],
      reason: reason || null,
    });
    res.json({ deleted: true, careAction: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------------------
// Comments
// -------------------------------------------------------------------------

/**
 * Vaccination record moderation. The note field is free text and can be
 * abused; an admin must be able to see and delete it. Deletions are written
 * to audit_log.
 */
async function listVaccinations(req, res, next) {
  try {
    const { limit, offset } = pagination(req);
    const q = (req.query.q || '').trim();
    const vetVerified = req.query.vetVerified;

    const filter = filterBuilder();
    if (q) {
      filter.add(
        (i) => `(v.vaccine_type ILIKE $${i} OR v.note ILIKE $${i} OR a.name ILIKE $${i})`,
        `%${q}%`
      );
    }
    if (vetVerified === 'true') filter.add((i) => `v.vet_verified = $${i}`, true);
    const paged = filter.paged(limit, offset);

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT v.id, v.vaccine_type, v.note, v.vet_verified, v.administered_at,
                v.next_due_at, v.recorded_at,
                a.id AS animal_id, a.name AS animal_name, a.species AS animal_species,
                a.breed AS animal_breed,
                u.id AS recorded_by_id, u.name AS recorded_by_name
         FROM vaccinations v
         JOIN animals a ON a.id = v.animal_id
         JOIN users u ON u.id = v.recorded_by
         ${filter.where}
         ORDER BY v.administered_at DESC
         ${paged.limitClause}`,
        paged.params
      ),
      pool.query(
        `SELECT count(*)::int AS count
         FROM vaccinations v
         JOIN animals a ON a.id = v.animal_id
         ${filter.where}`,
        filter.params
      ),
    ]);

    res.json({ vaccinations: rows.rows, total: total.rows[0].count });
  } catch (err) {
    next(err);
  }
}

async function deleteVaccination(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    const { reason } = req.body || {};
    const result = await pool.query(
      `DELETE FROM vaccinations WHERE id = $1
       RETURNING id, animal_id, vaccine_type, note, vet_verified, recorded_by, administered_at`,
      [targetId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aşı kaydı bulunamadı' });
    }

    await writeAuditLog(req.user.userId, 'vaccination.delete', 'vaccination', targetId, {
      ...result.rows[0],
      reason: reason || null,
    });
    res.json({ deleted: true, vaccination: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function listComments(req, res, next) {
  try {
    const { limit, offset } = pagination(req);
    const rows = await pool.query(
      `SELECT c.id, c.body, c.created_at, c.health_record_id,
              u.id AS user_id, u.name AS user_name,
              a.id AS animal_id, a.name AS animal_name, a.species AS animal_species
       FROM animal_comments c
       JOIN users u ON u.id = c.user_id
       JOIN animals a ON a.id = c.animal_id
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = await pool.query('SELECT count(*)::int AS count FROM animal_comments');
    res.json({ comments: rows.rows, total: total.rows[0].count });
  } catch (err) {
    next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    const { reason } = req.body || {};
    const result = await pool.query(
      'DELETE FROM animal_comments WHERE id = $1 RETURNING id, animal_id, user_id, body, created_at',
      [targetId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Yorum bulunamadı' });
    }

    await writeAuditLog(req.user.userId, 'comment.delete', 'comment', targetId, {
      ...result.rows[0],
      reason: reason || null,
    });
    res.json({ deleted: true, comment: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------------------
// Advertisers
// -------------------------------------------------------------------------

// The list returns impression/click counts too: telling a brand "this many
// impressions, this many clicks" is a precondition for selling the ad.
const ADVERTISER_SELECT_SQL = `
  SELECT a.id, a.name, a.slot, a.headline, a.body, a.image_url, a.target_url,
         a.active, a.starts_at, a.ends_at, a.sort_order, a.created_at,
         COALESCE(e.impressions, 0)::int AS impressions,
         COALESCE(e.clicks, 0)::int AS clicks
  FROM advertisers a
  LEFT JOIN (
    SELECT advertiser_id,
           count(*) FILTER (WHERE type = 'impression') AS impressions,
           count(*) FILTER (WHERE type = 'click') AS clicks
    FROM ad_events GROUP BY advertiser_id
  ) e ON e.advertiser_id = a.id`;

async function listAdvertisers(req, res, next) {
  try {
    const slot = req.query.slot;
    const filter = filterBuilder();
    if (SLOTS.includes(slot)) filter.add((i) => `a.slot = $${i}`, slot);

    const rows = await pool.query(
      `${ADVERTISER_SELECT_SQL} ${filter.where} ORDER BY a.slot, a.sort_order, a.id`,
      filter.params
    );
    res.json({ advertisers: rows.rows, slots: SLOTS });
  } catch (err) {
    next(err);
  }
}

function validateAdvertiser({ name, slot, targetUrl }) {
  if (!name || !String(name).trim()) return 'Marka adı zorunludur';
  if (!SLOTS.includes(slot)) return 'Geçersiz reklam yerleşimi';
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return 'Hedef adres http:// veya https:// ile başlamalıdır';
  }
  return null;
}

async function createAdvertiser(req, res, next) {
  try {
    const { name, slot, headline, body, targetUrl, imageUrl, startsAt, endsAt, sortOrder } =
      req.body;
    const error = validateAdvertiser({ name, slot, targetUrl });
    if (error) return res.status(400).json({ error });

    const inserted = await pool.query(
      `INSERT INTO advertisers
         (name, slot, headline, body, image_url, target_url, starts_at, ends_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        String(name).trim(),
        slot,
        headline || null,
        body || null,
        imageUrl || null,
        targetUrl,
        startsAt || null,
        endsAt || null,
        Number(sortOrder) || 0,
      ]
    );

    const id = inserted.rows[0].id;
    await writeAuditLog(req.user.userId, 'advertiser.create', 'advertiser', id, { name, slot });

    const result = await pool.query(`${ADVERTISER_SELECT_SQL} WHERE a.id = $1`, [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function updateAdvertiser(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { name, slot, headline, body, targetUrl, imageUrl, active, startsAt, endsAt, sortOrder } =
      req.body;

    if (slot !== undefined && !SLOTS.includes(slot)) {
      return res.status(400).json({ error: 'Geçersiz reklam yerleşimi' });
    }
    if (targetUrl !== undefined && !/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).json({ error: 'Hedef adres http:// veya https:// ile başlamalıdır' });
    }

    // Partial update via COALESCE: fields not sent stay unchanged. active and
    // the date fields are handled separately because they can be deliberately
    // set to NULL.
    const result = await pool.query(
      `UPDATE advertisers SET
         name = COALESCE($1, name),
         slot = COALESCE($2, slot),
         headline = COALESCE($3, headline),
         body = COALESCE($4, body),
         image_url = COALESCE($5, image_url),
         target_url = COALESCE($6, target_url),
         active = COALESCE($7, active),
         starts_at = CASE WHEN $8::boolean THEN $9::timestamptz ELSE starts_at END,
         ends_at = CASE WHEN $10::boolean THEN $11::timestamptz ELSE ends_at END,
         sort_order = COALESCE($12, sort_order)
       WHERE id = $13
       RETURNING id`,
      [
        name ?? null,
        slot ?? null,
        headline ?? null,
        body ?? null,
        imageUrl ?? null,
        targetUrl ?? null,
        active ?? null,
        startsAt !== undefined,
        startsAt || null,
        endsAt !== undefined,
        endsAt || null,
        sortOrder ?? null,
        id,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reklam bulunamadı' });
    }

    await writeAuditLog(req.user.userId, 'advertiser.update', 'advertiser', id, req.body);

    const updated = await pool.query(`${ADVERTISER_SELECT_SQL} WHERE a.id = $1`, [id]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function uploadAdvertiserImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Görsel zorunludur' });
    }
    const id = Number(req.params.id);
    await storage.publish(req.file.filename);
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const result = await pool.query(
      'UPDATE advertisers SET image_url = $1 WHERE id = $2 RETURNING id',
      [imageUrl, id]
    );
    if (result.rows.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Reklam bulunamadı' });
    }

    await writeAuditLog(req.user.userId, 'advertiser.image', 'advertiser', id, { imageUrl });

    const updated = await pool.query(`${ADVERTISER_SELECT_SQL} WHERE a.id = $1`, [id]);
    res.json(updated.rows[0]);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

async function deleteAdvertiser(req, res, next) {
  try {
    const id = Number(req.params.id);
    const result = await pool.query(
      'DELETE FROM advertisers WHERE id = $1 RETURNING id, name, slot',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reklam bulunamadı' });
    }

    // ad_events.advertiser_id is ON DELETE SET NULL: historical report totals
    // are kept; only the link to the brand is severed.
    await writeAuditLog(req.user.userId, 'advertiser.delete', 'advertiser', id, result.rows[0]);
    res.json({ deleted: true, advertiser: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------------------
// Content reports (moderation queue)
// -------------------------------------------------------------------------

// The queue joins a human-readable summary of the target so the admin can
// judge most reports without opening anything: the comment's text, the
// animal's name, the reported user's name. LEFT JOINs — a deleted target
// still shows the report (summary null = "content already gone").
const REPORT_LIST_SQL = `
  SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.status,
         r.created_at, r.resolved_at, r.resolution_note,
         reporter.id AS reporter_id, reporter.name AS reporter_name,
         resolver.name AS resolved_by_name,
         CASE r.target_type
           WHEN 'comment' THEN (SELECT left(c.body, 200) FROM animal_comments c WHERE c.id = r.target_id)
           WHEN 'animal' THEN (SELECT concat_ws(' · ', a.name, a.species, a.breed) FROM animals a WHERE a.id = r.target_id)
           WHEN 'user' THEN (SELECT u2.name FROM users u2 WHERE u2.id = r.target_id)
           WHEN 'care_action' THEN (SELECT concat(ca.action_type, ' · ', to_char(ca.created_at, 'DD Mon YYYY')) FROM care_actions ca WHERE ca.id = r.target_id)
           WHEN 'message' THEN (SELECT concat(left(msg.body, 200), CASE WHEN msg.deleted_at IS NOT NULL THEN ' · (silindi)' END) FROM messages msg WHERE msg.id = r.target_id)
         END AS target_summary
  FROM content_reports r
  JOIN users reporter ON reporter.id = r.reporter_id
  LEFT JOIN users resolver ON resolver.id = r.resolved_by`;

async function listReports(req, res, next) {
  try {
    const { limit, offset } = pagination(req);
    const status = ['open', 'resolved', 'dismissed'].includes(req.query.status)
      ? req.query.status
      : 'open';

    const [rows, total] = await Promise.all([
      pool.query(
        `${REPORT_LIST_SQL}
         WHERE r.status = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      ),
      pool.query('SELECT count(*)::int AS count FROM content_reports WHERE status = $1', [status]),
    ]);

    res.json({ reports: rows.rows, total: total.rows[0].count });
  } catch (err) {
    next(err);
  }
}

/**
 * Closes a report as resolved or dismissed. Deliberately does NOT delete the
 * reported content itself: deletion already has its own endpoints with their
 * own audit trail, and coupling the two would hide what the admin actually
 * did. The panel offers both actions side by side instead.
 */
async function resolveReport(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { status, note } = req.body;
    if (!['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'status resolved veya dismissed olmalıdır' });
    }

    const result = await pool.query(
      `UPDATE content_reports
       SET status = $1, resolved_by = $2, resolved_at = now(), resolution_note = $3
       WHERE id = $4 AND status = 'open'
       RETURNING id, target_type, target_id, reason, status`,
      [status, req.user.userId, note ? String(note).trim() : null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Açık şikayet bulunamadı' });
    }

    await writeAuditLog(req.user.userId, `report.${status}`, 'report', id, {
      ...result.rows[0],
      note: note || null,
    });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------------------
// Audit log
// -------------------------------------------------------------------------

async function listAuditLog(req, res, next) {
  try {
    const { limit, offset } = pagination(req);
    const rows = await pool.query(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.created_at,
              u.id AS actor_id, u.name AS actor_name
       FROM audit_log l
       LEFT JOIN users u ON u.id = l.actor_id
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = await pool.query('SELECT count(*)::int AS count FROM audit_log');
    res.json({ entries: rows.rows, total: total.rows[0].count });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  listUsers,
  updateUser,
  listAnimals,
  updateAnimal,
  deleteAnimal,
  mergeAnimals,
  listCareActions,
  deleteCareAction,
  listVaccinations,
  deleteVaccination,
  listComments,
  deleteComment,
  listAdvertisers,
  createAdvertiser,
  updateAdvertiser,
  uploadAdvertiserImage,
  deleteAdvertiser,
  listReports,
  resolveReport,
  listAuditLog,
};
