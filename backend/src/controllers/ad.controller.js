const pool = require('../config/db');
const { parseViewerLocation } = require('../utils/adTargeting');

const SLOTS = ['food_popup', 'water_popup', 'vet_health_record'];

// How recent a care drop must be to place a viewer who sent no location.
// Volunteers feed the same streets week after week, so a month-old drop is
// still where they are; past that it may be a trip, or a move.
const LAST_DROP_MAX_AGE_DAYS = 30;

// Live ads: marked active and inside the campaign date window.
const LIVE_FILTER = `
  active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at >= now())`;

/**
 * Returns the next ad for a slot.
 *
 * Rotation: "each open shows the next brand" was the requirement. Instead of
 * a cursor table, the position derives from how many impressions the user has
 * in that slot — impressions are recorded for billing anyway, so we get a
 * per-user, evenly distributed rotation with zero extra state. Every popup
 * open shows the user the next brand.
 *
 * If the ad list changes (brands added/removed) the order shifts; acceptable.
 *
 * Targeting (017): an ad with a target circle is in the list only when the
 * viewer is known to be inside it; an ad without one is nationwide. The
 * viewer's location is the lat/lng the request carries (the map's own fix,
 * or the animal's place under the health-record dialogs), else where they
 * last left food or water within LAST_DROP_MAX_AGE_DAYS — the one location
 * the server already has, which is what makes targeting work for clients
 * that predate it (the iOS build in the store). A viewer with neither is
 * unknown and sees only nationwide ads: a petshop paid for the people near
 * it, not for a guess. The location is used for this one query and never
 * stored.
 */
async function getNextAd(req, res, next) {
  try {
    const { slot } = req.query;
    if (!SLOTS.includes(slot)) {
      return res.status(400).json({ error: 'Geçersiz reklam yerleşimi' });
    }

    const viewer = parseViewerLocation(req.query);
    if (viewer.error) {
      return res.status(400).json({ error: viewer.error });
    }
    const sent = viewer.location;

    const ads = await pool.query(
      `WITH viewer AS (
         SELECT COALESCE(
           CASE WHEN $2::float8 IS NULL THEN NULL
                ELSE ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography END,
           (SELECT location FROM care_actions
             WHERE user_id = $4 AND created_at > now() - make_interval(days => $5)
             ORDER BY created_at DESC LIMIT 1)
         ) AS location
       )
       SELECT a.id, a.name, a.slot, a.headline, a.body, a.image_url, a.target_url
       FROM advertisers a CROSS JOIN viewer v
       WHERE a.slot = $1 AND ${LIVE_FILTER}
         AND (a.target_location IS NULL
              OR (v.location IS NOT NULL
                  AND ST_DWithin(a.target_location, v.location, a.target_radius_m)))
       ORDER BY a.sort_order, a.id`,
      [slot, sent?.lat ?? null, sent?.lng ?? null, req.user.userId, LAST_DROP_MAX_AGE_DAYS]
    );

    // With nothing live we return null; the client draws no banner at all.
    if (ads.rows.length === 0) {
      return res.json({ ad: null });
    }

    const seen = await pool.query(
      `SELECT count(*)::int AS count FROM ad_events
       WHERE user_id = $1 AND slot = $2 AND type = 'impression'`,
      [req.user.userId, slot]
    );

    const index = seen.rows[0].count % ads.rows.length;
    res.json({ ad: ads.rows[index] });
  } catch (err) {
    next(err);
  }
}

async function recordEvent(req, res, next, type) {
  try {
    const advertiserId = Number(req.params.id);
    if (!Number.isInteger(advertiserId)) {
      return res.status(400).json({ error: 'Geçersiz reklam' });
    }

    const ad = await pool.query('SELECT id, slot, target_url FROM advertisers WHERE id = $1', [
      advertiserId,
    ]);
    if (ad.rows.length === 0) {
      return res.status(404).json({ error: 'Reklam bulunamadı' });
    }

    await pool.query(
      'INSERT INTO ad_events (advertiser_id, slot, user_id, type) VALUES ($1, $2, $3, $4)',
      [advertiserId, ad.rows[0].slot, req.user.userId, type]
    );

    res.status(201).json({ recorded: type });
  } catch (err) {
    next(err);
  }
}

const recordImpression = (req, res, next) => recordEvent(req, res, next, 'impression');
const recordClick = (req, res, next) => recordEvent(req, res, next, 'click');

module.exports = { getNextAd, recordImpression, recordClick, SLOTS, LIVE_FILTER };
