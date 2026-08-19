const pool = require('../config/db');

const SLOTS = ['food_popup', 'water_popup', 'vet_health_record'];

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
 */
async function getNextAd(req, res, next) {
  try {
    const { slot } = req.query;
    if (!SLOTS.includes(slot)) {
      return res.status(400).json({ error: 'Geçersiz reklam yerleşimi' });
    }

    const ads = await pool.query(
      `SELECT id, name, slot, headline, body, image_url, target_url
       FROM advertisers
       WHERE slot = $1 AND ${LIVE_FILTER}
       ORDER BY sort_order, id`,
      [slot]
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
