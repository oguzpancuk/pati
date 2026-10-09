const pool = require('../config/db');
const { parseViewerLocation } = require('../utils/adTargeting');
const { SLOTS, AD_SLOTS_SQL } = require('../utils/adSlots');

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
 * open shows the user the next brand. Per slot, not per ad: an ad can run in
 * several slots (owner, 2026-10-09), and a count over the ads would let a
 * shared ad's impressions in one slot move another's, so a user alternating
 * the food and water sheets could land on the same brand every time. That
 * makes the slot an event is filed under load-bearing; see recordEvent.
 *
 * If the ad list changes (brands added/removed) the order shifts; acceptable.
 *
 * Targeting (018): an ad with a target circle is in the list only when the
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
           -- ST_MakePoint is STRICT: no lat/lng sent makes this NULL.
           ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography,
           (SELECT location FROM care_actions
             WHERE user_id = $4 AND created_at > now() - make_interval(days => $5)
             ORDER BY created_at DESC LIMIT 1)
         ) AS location
       )
       -- The requested slot, not the ad's first: the client reports it back
       -- with the impression.
       SELECT a.id, a.name, $1::varchar AS slot, a.headline, a.body, a.image_url, a.target_url,
              cardinality(${AD_SLOTS_SQL}) > 1 AS shared
       FROM advertisers a CROSS JOIN viewer v
       WHERE $1 = ANY(${AD_SLOTS_SQL}) AND ${LIVE_FILTER}
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

    const ad = ads.rows[seen.rows[0].count % ads.rows.length];
    if (ad.shared) {
      await pool.query(
        `INSERT INTO ad_serves (user_id, advertiser_id, slot) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, advertiser_id)
         DO UPDATE SET slot = EXCLUDED.slot, served_at = now()`,
        [req.user.userId, ad.id, slot]
      );
    }
    delete ad.shared;
    res.json({ ad });
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

    const ad = await pool.query(
      `SELECT ${AD_SLOTS_SQL} AS slots,
              (SELECT slot FROM ad_serves WHERE user_id = $2 AND advertiser_id = $1) AS served_in
       FROM advertisers WHERE id = $1`,
      [advertiserId, req.user.userId]
    );
    if (ad.rows.length === 0) {
      return res.status(404).json({ error: 'Reklam bulunamadı' });
    }

    // ?slot= names where the ad was shown; it must be one of the ad's own.
    // Clients that predate multi-slot ads (the iOS build in the store) send
    // none: the event goes where getNextAd last served this ad to them, else
    // to its only — or first — slot. Rotation counts per slot, so filing a
    // shared ad's impression under the wrong one would stall a rotation.
    const { slots, served_in: servedIn } = ad.rows[0];
    const named = req.query.slot;
    if (named !== undefined && !slots.includes(named)) {
      return res.status(400).json({ error: 'Geçersiz reklam yerleşimi' });
    }
    const shownIn = named ?? (slots.includes(servedIn) ? servedIn : slots[0]);

    await pool.query(
      'INSERT INTO ad_events (advertiser_id, slot, user_id, type) VALUES ($1, $2, $3, $4)',
      [advertiserId, shownIn, req.user.userId, type]
    );

    res.status(201).json({ recorded: type });
  } catch (err) {
    next(err);
  }
}

const recordImpression = (req, res, next) => recordEvent(req, res, next, 'impression');
const recordClick = (req, res, next) => recordEvent(req, res, next, 'click');

module.exports = { getNextAd, recordImpression, recordClick, SLOTS, LIVE_FILTER };
