const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { coverPhotoJoin, COVER_COLUMNS } = require('../utils/coverPhoto');
const { demoFilter, rememberShowsDemo } = require('../utils/settings');
const { UPLOADS_DIR } = require('../config/upload');
const { writeAuditLog } = require('../utils/auditLog');
const { getUserBadges } = require('../utils/badges');
const { getUnseenAwards, markAwardsSeen, refreshRankSnapshot } = require('../utils/badgeAwards');
const { getUserRank } = require('./leaderboard.controller');
const { avatarValueFor } = require('../utils/avatars');
const {
  AuthTokenError,
  isEnabled,
  isProvider,
  verifyIdentityToken,
} = require('../utils/socialAuth');

const MAX_FEATURED_BADGES = 3;

// Featured-badge selection stores the keys the user picked; the badge itself
// is derived data, so if the tier changes after the pick (e.g. silver to gold)
// the display stays current automatically.
function resolveFeatured(featuredKeys, badges) {
  const byKey = new Map(badges.map((b) => [b.key, b]));
  return (featuredKeys || []).map((key) => byKey.get(key)).filter((badge) => badge && badge.tier);
}

/**
 * How this account can prove it is itself. The profile screen needs it to ask
 * for the right thing before deleting the account: a password account is asked
 * for its password, an Apple/Google account is asked to sign in again — and an
 * account that has both may use either.
 */
async function getAuthMethods(userId) {
  const result = await pool.query(
    `SELECT u.password_hash IS NOT NULL AS has_password,
            coalesce(array_agg(DISTINCT i.provider)
                     FILTER (WHERE i.provider IS NOT NULL), '{}') AS providers
       FROM users u
       LEFT JOIN user_identities i ON i.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id`,
    [userId]
  );
  const row = result.rows[0] || {};
  return { hasPassword: !!row.has_password, authProviders: row.providers || [] };
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

/** Every column the profile response carries; one list, one meaning. */
const ME_COLUMNS = `id, name, email, role, avatar_url, featured_badges, created_at,
                    email_verification_pending, show_demo, is_demo`;

/**
 * THE profile response. Both getMe and the avatar endpoints answer with it,
 * because the clients swap the whole object in for the current profile: a
 * field present in one and missing from the other disappears from the screen
 * until a reload. Building it in two places lost `show_demo`, then
 * `recentComments`/`commentCount`/`email_verification_pending`, in two
 * consecutive review rounds — so there is only one builder now.
 */
async function buildMeResponse(user) {
  const [stats, badgeData, rank, recentComments, commentCount, authMethods] = await Promise.all([
    getStats(user.id),
    getUserBadges(user.id),
    getUserRank(user.id),
    fetchRecentComments(user.id),
    countComments(user.id),
    getAuthMethods(user.id),
  ]);

  // The rank was already computed here; refresh the snapshot so the badge
  // popup's "previous rank" means "where you stood when you last looked".
  // There is only one board, so nobody's preference can make this number mean
  // something different from the one an award row is compared with.
  await refreshRankSnapshot(user.id, rank ? rank.rank : null, badgeData.points.total);

  return {
    ...user,
    stats,
    badges: badgeData.badges,
    points: badgeData.points,
    level: badgeData.level,
    featuredBadges: resolveFeatured(user.featured_badges, badgeData.badges),
    rank,
    recentComments,
    commentCount,
    ...authMethods,
  };
}

async function getMe(req, res, next) {
  try {
    const result = await pool.query(`SELECT ${ME_COLUMNS} FROM users WHERE id = $1`, [
      req.user.userId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }
    res.json(await buildMeResponse(result.rows[0]));
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

/** Changes the profile image and answers with the whole profile. */
async function setAvatarAndRespond(userId, avatarValue, res) {
  const result = await pool.query(
    `UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING ${ME_COLUMNS}`,
    [avatarValue, userId]
  );
  res.json(await buildMeResponse(result.rows[0]));
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
// NOT demo-filtered, on purpose. What a volunteer did is theirs: their care
// records and comments feed the badges and points shown on the same screen,
// and filtering the lists while the badge engine counts everything put "0
// yorum" next to a gold comment badge (review finding). See
// utils/settings.js for where the filter does belong.
const CARED_ANIMALS_SQL = `
  SELECT a.id, a.species, a.name, a.color, a.breed, a.markings, a.created_at, a.is_demo,
         ST_AsGeoJSON(a.location)::json AS location,
         ${COVER_COLUMNS}
  FROM animals a
  JOIN user_animal_care uac ON uac.animal_id = a.id
  ${coverPhotoJoin('a')}
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
         cover.url AS animal_photo_url, cover.thumb_url AS animal_thumb_url
  FROM animal_comments c
  JOIN animals a ON a.id = c.animal_id
  ${coverPhotoJoin('a')}
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

/**
 * Whether this person sees the showcase (demo) world. Their own switch,
 * on their own profile (owner, 2026-09-09).
 */
async function setShowDemo(req, res, next) {
  try {
    const { showDemo } = req.body ?? {};
    if (typeof showDemo !== 'boolean') {
      return res.status(400).json({ error: 'showDemo true veya false olmalıdır' });
    }
    await pool.query('UPDATE users SET show_demo = $1 WHERE id = $2', [
      showDemo,
      req.user.userId,
    ]);
    rememberShowsDemo(req.user.userId, showDemo);
    res.json({ showDemo });
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
       ${await demoFilter(req, 'users')}
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
      'SELECT id, name, avatar_url, featured_badges, created_at, is_demo FROM users WHERE id = $1',
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
    ] = await Promise.all([
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

/**
 * Self-service account deletion (KVKK promise on /gizlilik + App Store
 * guideline 5.1.1(v), which requires in-app account deletion).
 *
 * The user row is anonymized in place, not deleted: animals, care actions,
 * comments and health records reference it with NOT NULL foreign keys, and
 * the privacy notice says exactly this — identity data is deleted, community
 * content survives anonymized (comments now render as "Silinmiş Üye").
 * Personal-only data (friendships, follow list, badge history, featured
 * badges, avatar file) is deleted outright. The freed e-mail can register
 * again; the randomized password hash plus suspension block the old session.
 */
async function deleteMyAccount(req, res, next) {
  let client;
  try {
    const { password, provider, identityToken } = req.body || {};

    const result = await pool.query('SELECT password_hash, avatar_url FROM users WHERE id = $1', [
      req.user.userId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }
    const passwordHash = result.rows[0].password_hash;

    // Deletion always re-authenticates — a stolen phone must not be able to
    // erase the account — but an Apple/Google account has no password to ask
    // for, so it proves itself by signing in with the provider again. 403
    // rather than 401 throughout: both clients read a 401 as "session
    // expired" and log the user out globally, which a mistyped password or a
    // cancelled provider sheet must not do.
    if (passwordHash && typeof password === 'string' && password.length > 0) {
      if (!(await bcrypt.compare(password, passwordHash))) {
        return res.status(403).json({ error: 'Şifre hatalı' });
      }
    } else if (typeof identityToken === 'string' && identityToken.length > 0) {
      // Validated here rather than inside the verifier: an unknown provider is
      // a bad request, and letting it reach socialAuth turns our own
      // configuration errors into 500s whose body names the missing env var.
      if (!isProvider(provider)) {
        return res.status(400).json({ error: 'Geçersiz doğrulama sağlayıcısı' });
      }
      if (!isEnabled(provider)) {
        return res
          .status(503)
          .json({ error: 'Doğrulama şu anda kullanılamıyor, sonra tekrar dene' });
      }
      let identity;
      try {
        identity = await verifyIdentityToken(provider, identityToken);
      } catch (err) {
        if (err instanceof AuthTokenError) {
          return res.status(403).json({ error: 'Doğrulama başarısız, tekrar deneyin' });
        }
        throw err;
      }
      // The token must belong to THIS account: a valid token for somebody
      // else's identity is exactly the confused-deputy case to refuse.
      const linked = await pool.query(
        'SELECT 1 FROM user_identities WHERE user_id = $1 AND provider = $2 AND subject = $3',
        [req.user.userId, identity.provider, identity.subject]
      );
      if (linked.rows.length === 0) {
        return res.status(403).json({ error: 'Doğrulama başarısız, tekrar deneyin' });
      }
    } else {
      return res
        .status(400)
        .json({ error: passwordHash ? 'Şifre zorunludur' : 'Hesabınızı doğrulamanız gerekiyor' });
    }

    // A locally uploaded avatar is a personal photo; remove the file itself,
    // not just the reference.
    const avatarUrl = result.rows[0].avatar_url || '';
    const uploadsMatch = avatarUrl.match(/\/uploads\/([\w.-]+)$/);

    const anonymizedHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    // Checked out only now: the validation and bcrypt work above must not
    // hold a pool connection hostage.
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET
         name = 'Silinmiş Üye',
         email = 'silinmis-' || id || '@deleted.pati-app.com',
         password_hash = $2,
         avatar_url = NULL,
         -- The anonymized address is a placeholder nobody proved; leaving
         -- this true would let a tombstone look like a linkable account.
         email_verified = false,
         -- A tombstone is not waiting for a code either; the code row itself
         -- is dropped below.
         email_verification_pending = false,
         featured_badges = '[]'::jsonb,
         last_rank = NULL,
         last_points = 0,
         suspended_at = now(),
         suspended_reason = 'Hesap silindi'
       WHERE id = $1`,
      [req.user.userId, anonymizedHash]
    );
    await client.query('DELETE FROM friendships WHERE requester_id = $1 OR addressee_id = $1', [
      req.user.userId,
    ]);
    await client.query('DELETE FROM user_animal_care WHERE user_id = $1', [req.user.userId]);
    await client.query('DELETE FROM user_badge_awards WHERE user_id = $1', [req.user.userId]);
    await client.query('DELETE FROM email_verifications WHERE user_id = $1', [req.user.userId]);
    // Without this the deleted account keeps its Apple/Google links, and the
    // next "Apple ile giriş" would walk straight back into the anonymized,
    // suspended row instead of creating a fresh account.
    await client.query('DELETE FROM user_identities WHERE user_id = $1', [req.user.userId]);
    await client.query('COMMIT');

    if (uploadsMatch) {
      fs.unlink(path.join(UPLOADS_DIR, uploadsMatch[1]), () => {});
    }

    // No PII in the details on purpose — the audit trail must not undo the
    // deletion it records.
    await writeAuditLog(req.user.userId, 'user.delete_self', 'user', req.user.userId, {});

    res.json({ deleted: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
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
  setShowDemo,
  getPublicProfile,
  deleteMyAccount,
};
