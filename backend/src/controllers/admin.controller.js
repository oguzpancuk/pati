const pool = require('../config/db');
const { writeAuditLog } = require('../utils/auditLog');

const MAX_PAGE_SIZE = 100;

function pagination(req) {
  const limit = Math.min(Number(req.query.limit) || 25, MAX_PAGE_SIZE);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}

/**
 * Filtre koşullarını $1'den başlayan yer tutucularla kurar. Aynı filtre hem
 * sayfalanmış listede hem toplam sayıda kullanılıyor; sayfalama parametreleri
 * (limit/offset) filtrenin *sonuna* eklendiği için iki sorgu aynı `where`
 * metnini paylaşabiliyor — böylece yer tutucuları elle yeniden numaralandırmak
 * gerekmiyor.
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
    // Sayfalanmış sorgu için: filtre parametreleri + limit/offset
    paged(limit, offset) {
      return {
        params: [...params, limit, offset],
        limitClause: `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      };
    },
  };
}

// -------------------------------------------------------------------------
// Gösterge paneli
// -------------------------------------------------------------------------

async function getStats(req, res, next) {
  try {
    const [totals, daily, species, health] = await Promise.all([
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
           (SELECT count(*) FROM health_records WHERE recovered_at IS NOT NULL)::int AS recovered_records`
      ),
      // Son 30 günün günlük aktivitesi. generate_series ile boş günler de 0 olarak
      // dönüyor; aksi halde grafikte günler atlanmış gibi görünüyor.
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
    ]);

    res.json({
      totals: totals.rows[0],
      daily: daily.rows,
      species: species.rows,
      healthRecordTypes: health.rows,
    });
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------------------
// Kullanıcılar
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
    // Kendi yetkisini düşürmek veya kendini askıya almak, paneli kilitlenmiş
    // duruma sokabildiği için engelleniyor.
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
// Hayvanlar
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
                cover.url AS cover_photo_url,
                (SELECT count(*) FROM animal_photos p WHERE p.animal_id = a.id)::int AS photo_count,
                (SELECT count(*) FROM animal_comments c WHERE c.animal_id = a.id)::int AS comment_count,
                (SELECT count(*) FROM user_animal_care uac WHERE uac.animal_id = a.id)::int AS carer_count
         FROM animals a
         JOIN users u ON u.id = a.created_by
         LEFT JOIN LATERAL (
           SELECT url FROM animal_photos WHERE animal_id = a.id ORDER BY created_at ASC LIMIT 1
         ) cover ON true
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
    const result = await pool.query(
      'DELETE FROM animals WHERE id = $1 RETURNING id, species, name, breed',
      [targetId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Hayvan bulunamadı' });
    }

    // Silinen kaydın içeriğini denetim kaydına yazıyoruz: satır artık yok, ama
    // "ne silindi" sorusu cevaplanabilir kalmalı.
    await writeAuditLog(req.user.userId, 'animal.delete', 'animal', targetId, result.rows[0]);
    res.json({ deleted: true, animal: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * İki hayvan kaydını birleştirir: kaynak kaydın fotoğrafları, yorumları, sağlık
 * kayıtları ve bakım verenleri hedefe taşınır, kaynak silinir.
 *
 * Mükerrer kayıt bugün elle çözülüyor (yapay zekâ eşleştirme gelene kadar), bu
 * yüzden panelin en çok kullanılacak işlevi burası olacak. Tek transaction'da
 * çalışıyor: yarım kalmış bir birleştirme iki bozuk kayıt bırakırdı.
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
    // user_animal_care birleşik birincil anahtar kullanıyor; aynı kişi iki kayda
    // da bakıyorsa çakışma olmasın diye ON CONFLICT gerekiyor.
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
// Bakım kayıtları (fotoğraf moderasyonu)
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
      pool.query(`SELECT count(*)::int AS count FROM care_actions c ${filter.where}`, filter.params),
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
// Yorumlar
// -------------------------------------------------------------------------

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
// Denetim kaydı
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
  listComments,
  deleteComment,
  listAuditLog,
};
