const fs = require('fs');
const pool = require('../config/db');

const COVER_PHOTO_JOIN = `
  LEFT JOIN LATERAL (
    SELECT url FROM animal_photos WHERE animal_id = a.id ORDER BY created_at ASC LIMIT 1
  ) cover ON true
`;

async function listAnimals(req, res, next) {
  try {
    const { lat, lng, radiusMeters, species } = req.query;
    if (species && !['cat', 'dog'].includes(species)) {
      return res.status(400).json({ error: 'species cat veya dog olmalıdır' });
    }
    const speciesFilter = species ? 'AND a.species = $SPECIES' : '';

    if (lat && lng) {
      const params = [lng, lat, radiusMeters || 2000];
      let sql = `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at,
                        ST_AsGeoJSON(a.location)::json AS location, cover.url AS cover_photo_url,
                        ST_Distance(a.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
                 FROM animals a
                 ${COVER_PHOTO_JOIN}
                 WHERE ST_DWithin(a.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
                 ${speciesFilter}
                 ORDER BY distance_meters`;
      if (species) {
        params.push(species);
        sql = sql.replace('$SPECIES', `$${params.length}`);
      }
      const result = await pool.query(sql, params);
      return res.json(result.rows);
    }

    const params = [];
    let sql = `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at,
                      ST_AsGeoJSON(a.location)::json AS location, cover.url AS cover_photo_url
               FROM animals a
               ${COVER_PHOTO_JOIN}
               WHERE true
               ${speciesFilter}
               ORDER BY a.created_at DESC LIMIT 100`;
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

async function getAnimal(req, res, next) {
  try {
    const animalResult = await pool.query(
      `SELECT id, species, name, color, breed, markings, created_by, created_at,
              ST_AsGeoJSON(location)::json AS location
       FROM animals WHERE id = $1`,
      [req.params.id]
    );
    if (animalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Hayvan bulunamadı' });
    }

    const [photos, healthRecords] = await Promise.all([
      pool.query('SELECT id, url, uploaded_by, created_at FROM animal_photos WHERE animal_id = $1 ORDER BY created_at DESC', [req.params.id]),
      pool.query('SELECT id, record_type, description, vet_verified, recorded_by, recorded_at FROM health_records WHERE animal_id = $1 ORDER BY recorded_at DESC', [req.params.id]),
    ]);

    res.json({
      ...animalResult.rows[0],
      photos: photos.rows,
      healthRecords: healthRecords.rows,
    });
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

    const result = await pool.query(
      `INSERT INTO animals (species, name, color, breed, markings, location, created_by)
       VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8)
       RETURNING id, species, name, color, breed, markings, created_at`,
      [species, name || null, color || null, breed || null, markings || null, lng, lat, req.user.userId]
    );

    const animal = result.rows[0];
    await pool.query(
      'INSERT INTO user_animal_care (user_id, animal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, animal.id]
    );

    res.status(201).json(animal);
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

async function addHealthRecord(req, res, next) {
  try {
    const { recordType, description, vetVerified } = req.body;
    if (!['illness', 'injury', 'treatment', 'vaccination', 'medication'].includes(recordType)) {
      return res.status(400).json({ error: 'Geçersiz recordType' });
    }
    if (!description) {
      return res.status(400).json({ error: 'description zorunludur' });
    }

    const isVet = req.user.role === 'vet' || req.user.role === 'admin';
    const result = await pool.query(
      `INSERT INTO health_records (animal_id, record_type, description, vet_verified, recorded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, record_type, description, vet_verified, recorded_by, recorded_at`,
      [req.params.id, recordType, description, Boolean(vetVerified) && isVet, req.user.userId]
    );
    res.status(201).json(result.rows[0]);
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

module.exports = { listAnimals, getAnimal, createAnimal, addPhoto, addHealthRecord, followAnimal };
