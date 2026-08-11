// Periyodik olarak (örn. saatte bir cron ile) çalıştırılır. Son aksiyondan bu yana
// 24 saatten fazla geçmiş ve daha önce kırmızı olmayan bölgeleri tespit edip, o bölgede
// daha önce aksiyon almış kullanıcılara "acil yardım" bildirimi gönderir.
require('dotenv').config();
const pool = require('../src/config/db');

async function checkStaleRegions() {
  const client = await pool.connect();
  try {
    const stale = await client.query(`
      SELECT r.id, r.name, r.status AS previous_status
      FROM regions r
      LEFT JOIN LATERAL (
        SELECT max(created_at) AS last_action_at FROM feeding_actions WHERE region_id = r.id
      ) la ON true
      WHERE (la.last_action_at IS NULL OR la.last_action_at <= now() - interval '24 hours')
        AND r.status IS DISTINCT FROM 'red'
    `);

    for (const region of stale.rows) {
      await client.query('BEGIN');
      await client.query('UPDATE regions SET status = $1, status_updated_at = now() WHERE id = $2', [
        'red',
        region.id,
      ]);
      await client.query(
        `INSERT INTO notifications (user_id, region_id, message)
         SELECT DISTINCT user_id, $1::integer, $2::text
         FROM feeding_actions WHERE region_id = $1::integer`,
        [region.id, `${region.name} bölgesi acil yardıma ihtiyaç duyuyor (Kırmızı)`]
      );
      await client.query('COMMIT');
      console.log(`${region.name} (id=${region.id}) kırmızıya geçti, bildirimler gönderildi.`);
    }

    console.log(`Tamamlandı. ${stale.rows.length} bölge kırmızıya çevrildi.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

checkStaleRegions().catch((err) => {
  console.error('check-stale-regions başarısız:', err);
  process.exit(1);
});
