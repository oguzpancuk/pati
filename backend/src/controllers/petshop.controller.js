const pool = require('../config/db');
const { coordinate, isPresent } = require('../utils/numbers');
const { parsePetshopInput, LISTED_NOW_SQL } = require('../utils/petshops');
const { writeAuditLog } = require('../utils/auditLog');

// The public card shows these and nothing else: the window and the hidden
// flag are the admin's business.
const PUBLIC_COLUMNS = `id, name, address, phone, opening_hours, website_url,
  ST_AsGeoJSON(location)::json AS location`;

// A viewport holds a handful of shops; the cap only stops a world-wide view
// from walking the whole table once there are many.
const VIEWPORT_LIMIT = 500;

/**
 * The listings inside the map's viewport that are on the map right now.
 * Open to signed-out visitors, like the care markers: a shop wants to be
 * seen by anyone who opens the map.
 */
async function listPetshops(req, res, next) {
  try {
    const { minLat, maxLat, minLng, maxLng } = req.query;
    const corners = [minLat, maxLat, minLng, maxLng];
    const min = corners.every(isPresent) ? coordinate(minLat, minLng) : null;
    const max = corners.every(isPresent) ? coordinate(maxLat, maxLng) : null;
    if (!min || !max) {
      return res.status(400).json({ error: 'Harita sınırları geçerli koordinat olmalıdır' });
    }
    // Planar comparison, as for care markers (010_care_bbox_geometry.sql).
    const result = await pool.query(
      `SELECT ${PUBLIC_COLUMNS}
         FROM petshops
        WHERE location::geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
          AND ${LISTED_NOW_SQL}
        ORDER BY id
        LIMIT ${VIEWPORT_LIMIT}`,
      [min.lng, min.lat, max.lng, max.lat]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------------------
// Admin
// -------------------------------------------------------------------------

const ADMIN_SELECT_SQL = `
  SELECT id, name, address, phone, opening_hours, website_url,
         ST_AsGeoJSON(location)::json AS location,
         hidden, starts_at, ends_at, created_at, updated_at,
         ${LISTED_NOW_SQL} AS listed
    FROM petshops`;

async function adminListPetshops(req, res, next) {
  try {
    const result = await pool.query(`${ADMIN_SELECT_SQL} ORDER BY created_at DESC, id DESC`);
    res.json({ petshops: result.rows });
  } catch (err) {
    next(err);
  }
}

function paramId(req) {
  const id = Number(req.params.id);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

async function createPetshop(req, res, next) {
  try {
    const { value, error } = parsePetshopInput(req.body ?? {});
    if (error) return res.status(400).json({ error });

    const inserted = await pool.query(
      `INSERT INTO petshops
         (name, address, phone, opening_hours, website_url, location, hidden, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5,
               ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8, $9, $10)
       RETURNING id`,
      [
        value.name,
        value.address,
        value.phone,
        value.openingHours,
        value.websiteUrl,
        value.lng,
        value.lat,
        value.hidden,
        value.startsAt,
        value.endsAt,
      ]
    );
    const id = inserted.rows[0].id;
    await writeAuditLog(req.user.userId, 'petshop.create', 'petshop', id, { name: value.name });

    const result = await pool.query(`${ADMIN_SELECT_SQL} WHERE id = $1`, [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * A partial update: the fields sent are laid over the stored row and the
 * result is validated as a whole, so an edit cannot leave a listing that a
 * create would have refused (an end before the start, say). An explicit
 * null clears an optional field.
 */
async function updatePetshop(req, res, next) {
  try {
    const id = paramId(req);
    if (!id) return res.status(404).json({ error: 'Petshop bulunamadı' });
    const current = await pool.query(
      `SELECT name, address, phone, opening_hours, website_url, hidden, starts_at, ends_at,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM petshops WHERE id = $1`,
      [id]
    );
    if (current.rows.length === 0) return res.status(404).json({ error: 'Petshop bulunamadı' });
    const row = current.rows[0];
    const body = req.body ?? {};
    const pick = (key, stored) => (body[key] !== undefined ? body[key] : stored);

    const { value, error } = parsePetshopInput({
      name: pick('name', row.name),
      address: pick('address', row.address),
      phone: pick('phone', row.phone),
      openingHours: pick('openingHours', row.opening_hours),
      websiteUrl: pick('websiteUrl', row.website_url),
      lat: pick('lat', row.lat),
      lng: pick('lng', row.lng),
      startsAt: pick('startsAt', row.starts_at),
      endsAt: pick('endsAt', row.ends_at),
      hidden: pick('hidden', row.hidden),
    });
    if (error) return res.status(400).json({ error });

    await pool.query(
      `UPDATE petshops SET
         name = $1, address = $2, phone = $3, opening_hours = $4, website_url = $5,
         location = ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
         hidden = $8, starts_at = $9, ends_at = $10, updated_at = now()
       WHERE id = $11`,
      [
        value.name,
        value.address,
        value.phone,
        value.openingHours,
        value.websiteUrl,
        value.lng,
        value.lat,
        value.hidden,
        value.startsAt,
        value.endsAt,
        id,
      ]
    );
    await writeAuditLog(req.user.userId, 'petshop.update', 'petshop', id, body);

    const result = await pool.query(`${ADMIN_SELECT_SQL} WHERE id = $1`, [id]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deletePetshop(req, res, next) {
  try {
    const id = paramId(req);
    if (!id) return res.status(404).json({ error: 'Petshop bulunamadı' });
    const result = await pool.query('DELETE FROM petshops WHERE id = $1 RETURNING id, name', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Petshop bulunamadı' });
    await writeAuditLog(req.user.userId, 'petshop.delete', 'petshop', id, result.rows[0]);
    res.json({ deleted: true, petshop: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPetshops,
  adminListPetshops,
  createPetshop,
  updatePetshop,
  deletePetshop,
};
