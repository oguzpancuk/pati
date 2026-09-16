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
  const { computeLeaderboard } = require('../controllers/leaderboard.controller');

  const snapshot = await pool.query('SELECT last_rank, last_points FROM users WHERE id = $1', [
    userId,
  ]);
  const previous = snapshot.rows[0] || { last_rank: null, last_points: 0 };

  // One board pass for the whole batch: it already carries every other
  // user's points, which is all a rank is. A user who is not on the board at
  // all (showcase, suspended) has no rank, as the leaderboard says.
  const board = await computeLeaderboard();
  const onBoard = board.some((row) => row.id === userId);
  const rankForPoints = (points) =>
    onBoard ? 1 + board.filter((row) => row.id !== userId && row.points > points).length : null;

  const pointsAfter = badgeData.points.total;
  const pointsBefore = previous.last_points ?? 0;
  const steps = stagePoints(fresh, pointsBefore, pointsAfter);

  const inserted = [];
  // The rank walks the chain with the points: each popup opens where the
  // one before it closed.
  let rankBefore = previous.last_rank;
  for (const [index, badge] of fresh.entries()) {
    const step = steps[index];
    const rankAfter = rankForPoints(step.after);
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
        step.before,
        step.after,
        rankBefore,
        rankAfter,
        levelFor(step.before).level,
        levelFor(step.after).level,
      ]
    );
    if (result.rows.length > 0) inserted.push(result.rows[0]);
    rankBefore = rankAfter;
  }

  await pool.query('UPDATE users SET last_rank = $1, last_points = $2 WHERE id = $3', [
    rankForPoints(pointsAfter),
    pointsAfter,
    userId,
  ]);

  return inserted.map(toAward);
}

/**
 * Splits one batch of badges into a chain of point totals, one step per
 * badge. Two badges earned by the same action used to show the batch's whole
 * jump on both popups ("0 → 20" twice); they now read 0 → 10 and then
 * 10 → 20 (owner, 2026-09-16).
 *
 * The chain starts at the snapshot the user last saw and ends on the real
 * total, so the last popup always agrees with the profile behind it; each
 * step is carried by its own badge's points, and anything else that moved in
 * the meantime (comment points) lands on the last step with it.
 */
function stagePoints(badges, pointsBefore, pointsAfter) {
  let running = pointsBefore;
  return badges.map((badge, index) => {
    const last = index === badges.length - 1;
    // Never past the total: a stale-low snapshot must not make a middle
    // popup claim more than the profile shows.
    const after = last ? pointsAfter : Math.min(running + (badge.points ?? 0), pointsAfter);
    const step = { before: running, after };
    running = after;
    return step;
  });
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
  stagePoints,
  syncBadgeAwardsSafe,
  getUnseenAwards,
  markAwardsSeen,
  refreshRankSnapshot,
};
