const pool = require('../config/db');

const SLOTS = ['food_popup', 'water_popup', 'vet_health_record'];

// Yayında olan reklamlar: aktif işaretli ve kampanya tarih aralığı içinde.
const LIVE_FILTER = `
  active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at >= now())`;

/**
 * Bir yerleşim için sıradaki reklamı döndürür.
 *
 * Rotasyon: "her tıkta sıra bir sonraki markaya geçsin" isteniyordu. Sırayı ayrı
 * bir imleç tablosunda tutmak yerine, kullanıcının o yerleşimde kaç kez reklam
 * gördüğünden türetiyoruz — gösterimleri zaten faturalama için kaydediyoruz,
 * yani ekstra durum tutmadan hem kullanıcı bazında hem eşit dağılımlı bir sıra
 * elde ediyoruz. Kullanıcı pop-up'ı her açtığında bir sonraki markayı görür.
 *
 * Reklam listesi değişirse (marka eklenir/çıkar) sıra kayar; bu kabul edilebilir.
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

    // Yayında reklam yoksa null dönüyoruz; istemci bandı hiç çizmiyor.
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
