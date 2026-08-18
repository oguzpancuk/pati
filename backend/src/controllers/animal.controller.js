const fs = require('fs');
const pool = require('../config/db');
const { syncBadgeAwardsSafe } = require('../utils/badgeAwards');
const { HEALTH_RECORD_TYPES, isValidChoice } = require('../utils/taxonomy');

// Takip durumu ayrı bir kolon değil, mevcut veriden türetiliyor:
//   iyileşti      -> recovered_at dolu
//   tedavi başladı -> kayda bağlı en az bir yorum var
//   başlanmadı     -> hiç yorum yok
// Böylece durum ile yorumlar arasında tutarsızlık oluşamıyor.
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

// Aşı kayıtları sağlık kayıtlarından ayrı: "iyileşti" durumu yok, yerine bir
// sonraki doz tarihi var. Yorum sayısı sağlık kaydındakiyle aynı mantıkta.
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

// Sayfalama: `limit` verilmezse eski davranış korunuyor (harita tek seferde
// çevredeki her şeyi çekiyor); liste ekranları ise küçük sayfalar istiyor.
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
      const params = [lng, lat, radiusMeters || 2000, limit, offset];
      let sql = `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at,
                        ST_AsGeoJSON(a.location)::json AS location, cover.url AS cover_photo_url,
                        ST_Distance(a.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
                 FROM animals a
                 ${COVER_PHOTO_JOIN}
                 WHERE ST_DWithin(a.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
                 ${speciesFilter}
                 ORDER BY distance_meters, a.id
                 LIMIT $4::int OFFSET $5::int`;
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

// Yeni kayıt açılmadan önce "bu hayvan zaten kayıtlı mı?" sorusu. Yarıçap
// bilerek dar (1 km): sokak hayvanı kendi bölgesinden pek çıkmaz, daha geniş
// arama alakasız adayları öne çıkarıp gerçek eşleşmeyi gömüyordu.
const MATCH_RADIUS_METERS = 1000;
const MATCH_LIMIT = 20;

/**
 * Benzerlik bir olasılık değil, seviye (yüksek/orta/düşük). Sayısal yüzde
 * göstermiyoruz çünkü elimizdeki sinyal yalnızca kullanıcının girdiği birkaç
 * alan; "%73 benzer" demek olmayan bir kesinlik vaat eder. Puanlama:
 *   desen aynı  +2 (en ayırt edici alan)
 *   renk aynı   +1
 *   200 m içinde +1 (aynı sokak/site)
 * Tür zaten filtre — kediyle köpek eşleşmez. Fotoğraf eşleştirme (yapay zekâ)
 * geldiğinde bu puana eklenecek; arayüz seviyeleri o zaman da aynı kalır.
 */
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
  const level = score >= 3 ? 'high' : score === 2 ? 'medium' : 'low';
  return { level, score, reasons };
}

async function matchAnimals(req, res, next) {
  try {
    const { lat, lng, species, breed, color } = req.query;
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
    const candidates = result.rows
      .map((row) => {
        const { level, score, reasons } = similarityFor(row, input);
        return { ...row, similarity: level, similarity_reasons: reasons, _score: score };
      })
      .sort(
        (a, b) => b._score - a._score || Number(a.distance_meters) - Number(b.distance_meters)
      )
      .slice(0, MATCH_LIMIT)
      .map(({ _score, ...rest }) => rest);

    res.json({ candidates, radiusMeters: MATCH_RADIUS_METERS });
  } catch (err) {
    next(err);
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

// Kayıtlı bir hayvanı yeniden gördüğünü bildirmek: hayvanın güncel konumunu
// bildiren kişinin konumuna taşır ve bildireni bakım listesine ekler. Yeni bir
// hayvan eklemeye çalışırken "bu zaten kayıtlı" denildiğinde de bu çağrılır.
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
    // Desen ve renk listeden seçiliyor ama "Diğer" serbest metin yazdırıyor.
    // Uzunluk kolonun sınırıyla (VARCHAR(120)) aynı; aksi halde kullanıcı
    // anlamsız bir veritabanı hatası görüyor.
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
    // Tedavi/aşı/ilaç kayıt tipi kaldırıldı: aşı ayrı tabloda, tedavi ve ilaç
    // ise zaten kayda bağlı yorumlarla takip ediliyor.
    if (!HEALTH_RECORD_TYPES.includes(recordType)) {
      return res.status(400).json({ error: 'recordType yalnızca illness veya injury olabilir' });
    }
    // description ya listeden gelen bir başlık ya da "Diğer" seçilince yazılan
    // serbest metin; ikisini de aynı kolonda tuttuğumuz için burada yalnızca
    // boş/aşırı uzun olup olmadığına bakıyoruz.
    if (!isValidChoice(description, null, { maxLength: 200 })) {
      return res.status(400).json({ error: 'description zorunludur (en fazla 200 karakter)' });
    }

    // Sağlık kaydını yalnızca o hayvana bakım verenler ekleyebilir.
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

// Bir sağlık kaydını "iyileşti" olarak işaretler. İyileşen kayıtlar kapanır:
// artık yorum eklenemez (bkz. addComment), böylece geçmiş takip kaydı sabit kalır.
async function markRecovered(req, res, next) {
  try {
    if (!(await isCarer(req.user.userId, req.params.id))) {
      return res.status(403).json({
        error: 'Durumu değiştirebilmek için bu hayvana bakım veriyor olmalısınız',
      });
    }

    const existing = await pool.query(
      'SELECT id, recovered_at FROM health_records WHERE id = $1 AND animal_id = $2',
      [req.params.recordId, req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Sağlık kaydı bulunamadı' });
    }
    if (existing.rows[0].recovered_at) {
      return res.status(409).json({ error: 'Bu kayıt zaten iyileşti olarak işaretlenmiş' });
    }

    await pool.query(
      'UPDATE health_records SET recovered_at = now(), recovered_by = $1 WHERE id = $2',
      [req.user.userId, req.params.recordId]
    );
    const result = await pool.query(`${HEALTH_RECORD_SELECT_SQL} WHERE h.id = $1`, [
      req.params.recordId,
    ]);
    const newBadges = await syncBadgeAwardsSafe(req.user.userId);
    res.json({ ...result.rows[0], newBadges });
  } catch (err) {
    next(err);
  }
}

// Aşı kaydı. Sağlık kaydından iki farkı var: "iyileşti" yok, bir sonraki doz
// tarihi var. Kim ekleyebilir sorusu aynı — yalnızca bakım verenler.
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

    // Veteriner onayını yalnızca veteriner/yönetici rolü verebilir; kullanıcı
    // beyanı ile resmî kayıt aynı ağırlıkta görünmemeli.
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

// Sohbet en yeniden geriye sayfalanıyor: istemci önce son N yorumu alır,
// "öncekileri yükle" dedikçe offset büyür. Sayfa istemciye kronolojik (eski →
// yeni) sırayla dönüyor ki ekranda doğrudan alt alta dizilebilsin.
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

    // Yorum yapmak, kişiyi bu hayvanın bakım listesine de ekler: sohbete katılan
    // herkes fiilen o hayvanla ilgileniyor demektir.
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
  listComments,
  addComment,
  followAnimal,
};
