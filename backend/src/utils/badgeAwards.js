const pool = require('../config/db');
const { getUserBadges, levelFor } = require('./badges');

/**
 * Kullanıcının kazandığı rozetleri veritabanındaki kayıtla karşılaştırır ve yeni
 * kazanılanları `user_badge_awards`'a yazar. Yeni rozet varsa o anki sıralamayı
 * hesaplayıp "önceki / yeni sıralama" bilgisini de kaydeder.
 *
 * Neden saklıyoruz: rozetin kendisi türetilmiş veri (istediğimiz an yeniden
 * hesaplanabiliyor), ama "ne zaman kazandın, o an kaçıncı sıradaydın" bilgisi
 * geçmişe dönük hesaplanamaz — sıralama başkalarının puan kazanmasıyla da
 * değişiyor.
 *
 * Maliyet: yeni rozet yoksa yalnızca rozet hesabı + tek bir SELECT çalışır;
 * sıralama (tüm kullanıcıları tarayan pahalı kısım) sadece gerçekten yeni bir
 * rozet kazanıldığında hesaplanır.
 *
 * @returns {Promise<Array>} yeni kazanılan rozet kayıtları (yoksa boş dizi)
 */
async function syncBadgeAwards(userId) {
  const badgeData = await getUserBadges(userId);
  const earned = badgeData.badges.filter((b) => b.tier);
  if (earned.length === 0) return [];

  const existing = await pool.query(
    'SELECT badge_key, tier FROM user_badge_awards WHERE user_id = $1',
    [userId]
  );
  const seen = new Set(existing.rows.map((row) => `${row.badge_key}:${row.tier}`));
  const fresh = earned.filter((badge) => !seen.has(`${badge.key}:${badge.tier}`));

  if (fresh.length === 0) return [];

  // Döngüsel bağımlılığı önlemek için burada require ediyoruz: leaderboard
  // controller'ı badges util'ini kullanıyor, biz de ikisini birden kullanıyoruz.
  const { getUserRank } = require('../controllers/leaderboard.controller');

  const snapshot = await pool.query(
    'SELECT last_rank, last_points FROM users WHERE id = $1',
    [userId]
  );
  const previous = snapshot.rows[0] || { last_rank: null, last_points: 0 };

  const rank = await getUserRank(userId);
  const pointsAfter = badgeData.points.total;
  const pointsBefore = previous.last_points ?? 0;

  const inserted = [];
  for (const badge of fresh) {
    const result = await pool.query(
      `INSERT INTO user_badge_awards
         (user_id, badge_key, tier, label, points_awarded,
          points_before, points_after, rank_before, rank_after, level_before, level_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, badge_key, tier) DO NOTHING
       RETURNING *`,
      [
        userId,
        badge.key,
        badge.tier,
        badge.label,
        badge.points,
        pointsBefore,
        pointsAfter,
        previous.last_rank,
        rank ? rank.rank : null,
        levelFor(pointsBefore).level,
        levelFor(pointsAfter).level,
      ]
    );
    if (result.rows.length > 0) inserted.push(result.rows[0]);
  }

  await pool.query('UPDATE users SET last_rank = $1, last_points = $2 WHERE id = $3', [
    rank ? rank.rank : null,
    pointsAfter,
    userId,
  ]);

  return inserted.map(toAward);
}

/**
 * Profil görüntülenirken sıralama zaten hesaplanmış oluyor; anlık görüntüyü
 * burada da tazeliyoruz ki popup'taki "önceki sıralaman" değeri "en son
 * baktığında kaçıncıydın" anlamına gelsin, aylar öncesinden kalmasın.
 */
async function refreshRankSnapshot(userId, rank, points) {
  await pool.query('UPDATE users SET last_rank = $1, last_points = $2 WHERE id = $3', [
    rank ?? null,
    points ?? 0,
    userId,
  ]);
}

function toAward(row) {
  return {
    id: row.id,
    badgeKey: row.badge_key,
    tier: row.tier,
    label: row.label,
    pointsAwarded: row.points_awarded,
    pointsBefore: row.points_before,
    pointsAfter: row.points_after,
    rankBefore: row.rank_before,
    rankAfter: row.rank_after,
    levelBefore: row.level_before,
    levelAfter: row.level_after,
    createdAt: row.created_at,
  };
}

async function getUnseenAwards(userId) {
  const result = await pool.query(
    `SELECT * FROM user_badge_awards
     WHERE user_id = $1 AND seen_at IS NULL
     ORDER BY created_at ASC`,
    [userId]
  );
  return result.rows.map(toAward);
}

async function markAwardsSeen(userId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const result = await pool.query(
    `UPDATE user_badge_awards SET seen_at = now()
     WHERE user_id = $1 AND id = ANY($2::int[]) AND seen_at IS NULL`,
    [userId, ids]
  );
  return result.rowCount;
}

/**
 * Puan kazandıran bir işlemden sonra çağrılır. Rozet hesabı bir yan iş olduğu
 * için hata verirse asıl işlemi (mama bırakma, yorum yapma...) düşürmüyoruz —
 * kullanıcı açısından rozet gecikmesi, işlemin başarısız olmasından iyidir.
 */
async function syncBadgeAwardsSafe(userId) {
  try {
    return await syncBadgeAwards(userId);
  } catch (err) {
    console.error('Rozet senkronizasyonu başarısız:', err.message);
    return [];
  }
}

module.exports = {
  syncBadgeAwards,
  syncBadgeAwardsSafe,
  getUnseenAwards,
  markAwardsSeen,
  refreshRankSnapshot,
};
