const pool = require('../config/db');
const { getUserBadges, levelFor } = require('./badges');

/**
 * Compares the badges the user has earned against the database records and
 * writes newly earned ones to `user_badge_awards`. When there is a new badge,
 * it also computes the current rank and stores the "previous / new rank" info.
 *
 * Why we persist this: the badge itself is derived data (recomputable at any
 * time), but "when did you earn it, and what rank were you at that moment"
 * cannot be reconstructed after the fact — the rank also shifts as other
 * people earn points.
 *
 * Cost: with no new badge, only the badge computation + a single SELECT run;
 * the rank (the expensive part that scans all users) is computed only when a
 * badge is actually newly earned.
 *
 * @returns {Promise<Array>} newly earned award records (empty array if none)
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

  // Required here to avoid a circular dependency: the leaderboard controller
  // uses the badges util, and we use both.
  const { getCanonicalRank } = require('../controllers/leaderboard.controller');

  const snapshot = await pool.query('SELECT last_rank, last_points FROM users WHERE id = $1', [
    userId,
  ]);
  const previous = snapshot.rows[0] || { last_rank: null, last_points: 0 };

  // The canonical board: this number is frozen into the award row and read
  // back next to an older snapshot, so it may not depend on anyone's demo
  // preference (review finding).
  const rank = await getCanonicalRank(userId);
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
 * The rank is already computed whenever the profile is viewed; refresh the
 * snapshot here too so the popup's "previous rank" means "where you stood
 * when you last looked", not something months stale.
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
 * Called after any action that earns points. Badge computation is a side job:
 * if it fails we don't fail the main action (leaving food, commenting...) —
 * from the user's perspective a delayed badge beats a failed action.
 */
async function syncBadgeAwardsSafe(userId) {
  try {
    return await syncBadgeAwards(userId);
  } catch (err) {
    console.error('Badge sync failed:', err.message);
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
