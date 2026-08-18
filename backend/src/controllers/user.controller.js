const fs = require('fs');
const pool = require('../config/db');
const { getUserBadges } = require('../utils/badges');
const { getUserRank } = require('./leaderboard.controller');

const MAX_FEATURED_BADGES = 3;

// Öne çıkan rozet seçimi kullanıcının seçtiği anahtarları saklıyor; rozetin
// kendisi türetilmiş veri olduğu için seçim yapıldıktan sonra kademe değişirse
// (örn. gümüşten altına çıkınca) gösterim otomatik güncel kalıyor.
function resolveFeatured(featuredKeys, badges) {
  const byKey = new Map(badges.map((b) => [b.key, b]));
  return (featuredKeys || [])
    .map((key) => byKey.get(key))
    .filter((badge) => badge && badge.tier);
}

async function getStats(userId) {
  const result = await pool.query(
    `SELECT
       (SELECT count(*) FROM care_actions WHERE user_id = $1 AND action_type = 'food')::int AS food_count,
       (SELECT count(*) FROM care_actions WHERE user_id = $1 AND action_type = 'water')::int AS water_count,
       (SELECT count(*) FROM animals WHERE created_by = $1)::int AS animal_count`,
    [userId]
  );
  const row = result.rows[0];
  return { foodCount: row.food_count, waterCount: row.water_count, animalCount: row.animal_count };
}

async function getMe(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, avatar_url, featured_badges, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    const [stats, badgeData, rank] = await Promise.all([
      getStats(req.user.userId),
      getUserBadges(req.user.userId),
      getUserRank(req.user.userId),
    ]);

    const user = result.rows[0];
    res.json({
      ...user,
      stats,
      badges: badgeData.badges,
      points: badgeData.points,
      featuredBadges: resolveFeatured(user.featured_badges, badgeData.badges),
      rank,
    });
  } catch (err) {
    next(err);
  }
}

async function setFeaturedBadges(req, res, next) {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys)) {
      return res.status(400).json({ error: 'keys bir dizi olmalıdır' });
    }
    if (keys.length > MAX_FEATURED_BADGES) {
      return res
        .status(400)
        .json({ error: `En fazla ${MAX_FEATURED_BADGES} rozet seçebilirsiniz` });
    }

    const badgeData = await getUserBadges(req.user.userId);
    const earnedKeys = new Set(badgeData.badges.filter((b) => b.tier).map((b) => b.key));
    const invalid = keys.filter((key) => !earnedKeys.has(key));
    if (invalid.length > 0) {
      return res.status(400).json({ error: 'Kazanılmamış rozet seçilemez', invalid });
    }

    await pool.query('UPDATE users SET featured_badges = $1::jsonb WHERE id = $2', [
      JSON.stringify(keys),
      req.user.userId,
    ]);

    res.json({ featuredBadges: resolveFeatured(keys, badgeData.badges) });
  } catch (err) {
    next(err);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fotoğraf zorunludur' });
    }
    const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    const result = await pool.query(
      `UPDATE users SET avatar_url = $1 WHERE id = $2
       RETURNING id, name, email, role, avatar_url, featured_badges, created_at`,
      [avatarUrl, req.user.userId]
    );

    // İstemci bu yanıtı doğrudan mevcut profilin yerine koyuyor; getMe ile aynı
    // şekli döndürmezsek profil ekranı eksik alanlarla render edilmeye çalışıp
    // çöküyor.
    const [stats, badgeData, rank] = await Promise.all([
      getStats(req.user.userId),
      getUserBadges(req.user.userId),
      getUserRank(req.user.userId),
    ]);
    const user = result.rows[0];
    res.json({
      ...user,
      stats,
      badges: badgeData.badges,
      points: badgeData.points,
      featuredBadges: resolveFeatured(user.featured_badges, badgeData.badges),
      rank,
    });
  } catch (err) {
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    next(err);
  }
}

async function getMyAnimals(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at,
              ST_AsGeoJSON(a.location)::json AS location
       FROM animals a
       JOIN user_animal_care c ON c.animal_id = a.id
       WHERE c.user_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function searchUsers(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json([]);
    }
    const result = await pool.query(
      `SELECT id, name, avatar_url FROM users
       WHERE id != $1 AND name ILIKE $2
       ORDER BY name
       LIMIT 20`,
      [req.user.userId, `%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getPublicProfile(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    const userResult = await pool.query(
      'SELECT id, name, avatar_url, featured_badges, created_at FROM users WHERE id = $1',
      [targetId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    const [stats, badgeData, animals, friendCount, rank] = await Promise.all([
      getStats(targetId),
      getUserBadges(targetId),
      pool.query(
        `SELECT a.id, a.species, a.name, a.breed, a.created_at,
                ST_AsGeoJSON(a.location)::json AS location,
                cover.url AS cover_photo_url
         FROM animals a
         JOIN user_animal_care uac ON uac.animal_id = a.id
         LEFT JOIN LATERAL (
           SELECT url FROM animal_photos WHERE animal_id = a.id ORDER BY created_at ASC LIMIT 1
         ) cover ON true
         WHERE uac.user_id = $1
         ORDER BY uac.created_at DESC
         LIMIT 50`,
        [targetId]
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM friendships
         WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
        [targetId]
      ),
      getUserRank(targetId),
    ]);

    let friendshipStatus = 'none';
    let friendshipId = null;
    if (req.user.userId === targetId) {
      friendshipStatus = 'self';
    } else {
      const fr = await pool.query(
        `SELECT id, requester_id, status FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
        [req.user.userId, targetId]
      );
      if (fr.rows.length > 0) {
        const row = fr.rows[0];
        friendshipId = row.id;
        if (row.status === 'accepted') {
          friendshipStatus = 'friends';
        } else {
          friendshipStatus = row.requester_id === req.user.userId ? 'pending_sent' : 'pending_received';
        }
      }
    }

    res.json({
      ...userResult.rows[0],
      stats,
      badges: badgeData.badges,
      points: badgeData.points,
      featuredBadges: resolveFeatured(userResult.rows[0].featured_badges, badgeData.badges),
      rank,
      animals: animals.rows,
      friendCount: friendCount.rows[0].count,
      friendshipStatus,
      friendshipId,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMe,
  uploadAvatar,
  setFeaturedBadges,
  getMyAnimals,
  searchUsers,
  getPublicProfile,
};
