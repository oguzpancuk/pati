const fs = require('fs');
const pool = require('../config/db');
const { getUserBadges } = require('../utils/badges');
const { getUnseenAwards, markAwardsSeen, refreshRankSnapshot } = require('../utils/badgeAwards');
const { getUserRank } = require('./leaderboard.controller');
const { avatarValueFor } = require('../utils/avatars');

const MAX_FEATURED_BADGES = 3;

// Featured-badge selection stores the keys the user picked; the badge itself
// is derived data, so if the tier changes after the pick (e.g. silver to gold)
// the display stays current automatically.
function resolveFeatured(featuredKeys, badges) {
  const byKey = new Map(badges.map((b) => [b.key, b]));
  return (featuredKeys || []).map((key) => byKey.get(key)).filter((badge) => badge && badge.tier);
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

    const [stats, badgeData, rank, recentComments, commentCount] = await Promise.all([
      getStats(req.user.userId),
      getUserBadges(req.user.userId),
      getUserRank(req.user.userId),
      fetchRecentComments(req.user.userId),
      countComments(req.user.userId),
    ]);

    // The rank was already computed here; refresh the snapshot so the badge
    // popup's "previous rank" means "where you stood when you last looked".
    await refreshRankSnapshot(req.user.userId, rank ? rank.rank : null, badgeData.points.total);

    const user = result.rows[0];
    res.json({
      ...user,
      stats,
      badges: badgeData.badges,
      points: badgeData.points,
      level: badgeData.level,
      featuredBadges: resolveFeatured(user.featured_badges, badgeData.badges),
      rank,
      recentComments,
      commentCount,
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

/**
 * Changes the profile image and responds in **exactly** the same shape as
 * getMe. The client swaps this response in for the current profile; if we
 * return missing fields, the profile screen tries to render half data and
 * crashes.
 */
async function setAvatarAndRespond(userId, avatarValue, res) {
  const result = await pool.query(
    `UPDATE users SET avatar_url = $1 WHERE id = $2
     RETURNING id, name, email, role, avatar_url, featured_badges, created_at`,
    [avatarValue, userId]
  );

  const [stats, badgeData, rank] = await Promise.all([
    getStats(userId),
    getUserBadges(userId),
    getUserRank(userId),
  ]);
  const user = result.rows[0];
  res.json({
    ...user,
    stats,
    badges: badgeData.badges,
    points: badgeData.points,
    level: badgeData.level,
    featuredBadges: resolveFeatured(user.featured_badges, badgeData.badges),
    rank,
  });
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fotoğraf zorunludur' });
    }
    const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    // Uploading a photo replaces the selected built-in avatar: both live in
    // the same column because only one can be active at a time.
    await setAvatarAndRespond(req.user.userId, avatarUrl, res);
  } catch (err) {
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    next(err);
  }
}

/**
 * Picks one of the built-in avatars. Instead of assigning a random face to
 * everyone without a photo, we let the user choose: they can pick something
 * that represents them, and the path to uploading a photo later stays open.
 */
async function setAvatarKey(req, res, next) {
  try {
    const avatarValue = avatarValueFor(req.body?.avatarKey);
    if (!avatarValue) {
      return res.status(400).json({ error: 'Geçersiz avatar seçimi' });
    }
    await setAvatarAndRespond(req.user.userId, avatarValue, res);
  } catch (err) {
    next(err);
  }
}

/** Removes the image entirely; the UI falls back to the initial letter. */
async function clearAvatar(req, res, next) {
  try {
    await setAvatarAndRespond(req.user.userId, null, res);
  } catch (err) {
    next(err);
  }
}

// Cared-for animals are listed the same way (with a cover photo) on your own
// profile and on other people's; keep the query in one place.
const CARED_ANIMALS_SQL = `
  SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at,
         ST_AsGeoJSON(a.location)::json AS location,
         cover.url AS cover_photo_url
  FROM animals a
  JOIN user_animal_care uac ON uac.animal_id = a.id
  LEFT JOIN LATERAL (
    SELECT url FROM animal_photos WHERE animal_id = a.id ORDER BY created_at ASC LIMIT 1
  ) cover ON true
  WHERE uac.user_id = $1
  ORDER BY uac.created_at DESC
  LIMIT $2::int OFFSET $3::int`;

// The profile screen shows a preview (first 3 animals + total; same count as
// comments — a profile is a summary); the full list arrives page by page via
// "show more" using the same query. A volunteer caring for 40 animals doesn't
// get a mile-long profile.
const PROFILE_ANIMAL_PREVIEW = 3;
const MAX_ANIMAL_PAGE = 50;

async function fetchCaredAnimals(userId, limit = PROFILE_ANIMAL_PREVIEW, offset = 0) {
  const result = await pool.query(CARED_ANIMALS_SQL, [userId, limit, offset]);
  return result.rows;
}

async function countCaredAnimals(userId) {
  const result = await pool.query(
    'SELECT count(*)::int AS count FROM user_animal_care WHERE user_id = $1',
    [userId]
  );
  return result.rows[0].count;
}

// The "recent comments" list shown on the profile. The animal each comment
// belongs to is returned too, so the list can link straight to its profile.
const USER_COMMENTS_SQL = `
  SELECT c.id, c.body, c.created_at, c.health_record_id,
         a.id AS animal_id, a.species AS animal_species,
         a.name AS animal_name, a.breed AS animal_breed,
         cover.url AS animal_photo_url
  FROM animal_comments c
  JOIN animals a ON a.id = c.animal_id
  LEFT JOIN LATERAL (
    SELECT url FROM animal_photos WHERE animal_id = a.id ORDER BY created_at ASC LIMIT 1
  ) cover ON true
  WHERE c.user_id = $1
  ORDER BY c.created_at DESC
  LIMIT $2::int OFFSET $3::int`;

const PROFILE_COMMENT_PREVIEW = 3;

async function fetchRecentComments(userId, limit = PROFILE_COMMENT_PREVIEW, offset = 0) {
  const result = await pool.query(USER_COMMENTS_SQL, [userId, limit, offset]);
  return result.rows;
}

async function countComments(userId) {
  const result = await pool.query(
    'SELECT count(*)::int AS count FROM animal_comments WHERE user_id = $1',
    [userId]
  );
  return result.rows[0].count;
}

// Both /me/animals and /:id/animals go through here; the response shape is
// the same ({ animals, total }) for your own profile and anyone else's.
async function getUserAnimals(req, res, next) {
  try {
    const targetId = req.params.id ? Number(req.params.id) : req.user.userId;
    if (!Number.isInteger(targetId)) {
      return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    }
    const limit = Math.min(Number(req.query.limit) || PROFILE_ANIMAL_PREVIEW, MAX_ANIMAL_PAGE);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [animals, total] = await Promise.all([
      fetchCaredAnimals(targetId, limit, offset),
      countCaredAnimals(targetId),
    ]);
    res.json({ animals, total });
  } catch (err) {
    next(err);
  }
}

async function getUserComments(req, res, next) {
  try {
    const targetId = req.params.id ? Number(req.params.id) : req.user.userId;
    if (!Number.isInteger(targetId)) {
      return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const [user, comments, total] = await Promise.all([
      pool.query('SELECT id, name, avatar_url FROM users WHERE id = $1', [targetId]),
      fetchRecentComments(targetId, limit, offset),
      countComments(targetId),
    ]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    res.json({ user: user.rows[0], comments, total });
  } catch (err) {
    next(err);
  }
}

async function getMyBadgeAwards(req, res, next) {
  try {
    res.json(await getUnseenAwards(req.user.userId));
  } catch (err) {
    next(err);
  }
}

async function markMyBadgeAwardsSeen(req, res, next) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids bir dizi olmalıdır' });
    }
    const updated = await markAwardsSeen(req.user.userId, ids.map(Number).filter(Number.isInteger));
    res.json({ updated });
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

    const [
      stats,
      badgeData,
      animals,
      animalCount,
      friendCount,
      rank,
      recentComments,
      commentCount,
    ] =
      await Promise.all([
        getStats(targetId),
        getUserBadges(targetId),
        fetchCaredAnimals(targetId),
        countCaredAnimals(targetId),
        pool.query(
          `SELECT count(*)::int AS count FROM friendships
           WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
          [targetId]
        ),
        getUserRank(targetId),
        fetchRecentComments(targetId),
        countComments(targetId),
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
          friendshipStatus =
            row.requester_id === req.user.userId ? 'pending_sent' : 'pending_received';
        }
      }
    }

    res.json({
      ...userResult.rows[0],
      stats,
      badges: badgeData.badges,
      points: badgeData.points,
      level: badgeData.level,
      featuredBadges: resolveFeatured(userResult.rows[0].featured_badges, badgeData.badges),
      rank,
      animals,
      animalCount,
      friendCount: friendCount.rows[0].count,
      recentComments,
      commentCount,
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
  setAvatarKey,
  clearAvatar,
  setFeaturedBadges,
  getUserAnimals,
  getUserComments,
  getMyBadgeAwards,
  markMyBadgeAwardsSeen,
  searchUsers,
  getPublicProfile,
};
