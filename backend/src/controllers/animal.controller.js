const pool = require('../config/db');

async function listAnimals(req, res, next) {
  try {
    const { lat, lng, radiusMeters } = req.query;

    if (lat && lng) {
      const result = await pool.query(
        `SELECT id, species, name, color, size, markings, region_id, created_at,
                ST_AsGeoJSON(location)::json AS location,
                ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
         FROM animals
         WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         ORDER BY distance_meters`,
        [lng, lat, radiusMeters || 2000]
      );
      return res.json(result.rows);
    }

    const result = await pool.query(
      `SELECT id, species, name, color, size, markings, region_id, created_at,
              ST_AsGeoJSON(location)::json AS location
       FROM animals ORDER BY created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getAnimal(req, res, next) {
  try {
    const animalResult = await pool.query(
      `SELECT id, species, name, color, size, markings, region_id, created_by, created_at,
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
    const { species, name, color, size, markings, lat, lng, regionId } = req.body;
    if (!species || !['cat', 'dog'].includes(species)) {
      return res.status(400).json({ error: 'species cat veya dog olmalıdır' });
    }
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat ve lng zorunludur' });
    }

    const result = await pool.query(
      `INSERT INTO animals (species, name, color, size, markings, location, region_id, created_by)
       VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8, $9)
       RETURNING id, species, name, color, size, markings, region_id, created_at`,
      [species, name || null, color || null, size || null, markings || null, lng, lat, regionId || null, req.user.userId]
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
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'url zorunludur' });
    }
    const result = await pool.query(
      'INSERT INTO animal_photos (animal_id, url, uploaded_by) VALUES ($1, $2, $3) RETURNING id, url, uploaded_by, created_at',
      [req.params.id, url, req.user.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
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
