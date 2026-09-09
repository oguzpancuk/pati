const pool = require('../config/db');
const { getBadgesForUsers } = require('../utils/badges');


// The ranking is computed over all users. Badges are derived data and are
// not stored; the badge computation runs as set-based queries, so the query
// count doesn't grow with the user count. At much larger scale this table
// will need periodic caching (unnecessary at the current size).
/**
 * ONE board, the same for everyone: showcase (demo) accounts never compete
 * on it (owner, 2026-09-09 — "botlar sıralamada gözükmesin"). That is also
 * what keeps every rank honest: a rank is stored in `users.last_rank` and
 * frozen into badge awards, so it must not move because a bot arrived or
 * because somebody flipped their showcase switch. A demo account has no
 * rank at all; the profiles say "demo hesabı" where the number would be.
 *
 * Suspended and self-deleted (anonymized) accounts are excluded too: a
 * "Silinmiş Üye" holding a rank pushes living volunteers down the board.
 */
async function computeLeaderboard() {
  const users = await pool.query(
    'SELECT id, name, avatar_url FROM users WHERE suspended_at IS NULL AND NOT is_demo'
  );
  const userIds = users.rows.map((u) => u.id);
  const badgeMap = await getBadgesForUsers(userIds);

  const rows = users.rows.map((user) => {
    const data = badgeMap.get(user.id);
    const earned = data.badges.filter((b) => b.tier);
    return {
      id: user.id,
      name: user.name,
      avatar_url: user.avatar_url,
      points: data.points.total,
      badgePoints: data.points.badges,
      commentPoints: data.points.comments,
      level: data.level,
      badgeCount: earned.length,
      topTier: earned.reduce((best, b) => {
        const order = ['bronze', 'silver', 'gold', 'diamond'];
        return order.indexOf(b.tier) > order.indexOf(best || '') ? b.tier : best;
      }, null),
    };
  });

  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'tr'));

  // Equal points share a rank (1, 2, 2, 4).
  let lastPoints = null;
  let lastRank = 0;
  rows.forEach((row, index) => {
    if (row.points !== lastPoints) {
      lastRank = index + 1;
      lastPoints = row.points;
    }
    row.rank = lastRank;
  });

  return rows;
}

async function getLeaderboard(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await computeLeaderboard();
    const me = rows.find((r) => r.id === req.user.userId) || null;

    res.json({
      entries: rows.slice(0, limit),
      totalUsers: rows.length,
      me,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * The rank shown on a profile, snapshotted into `users.last_rank` and frozen
 * into badge awards — one number from one board. Null for a showcase
 * account, which is not on the board at all.
 */
async function getUserRank(userId) {
  const rows = await computeLeaderboard();
  const entry = rows.find((r) => r.id === userId);
  return entry ? { rank: entry.rank, points: entry.points, totalUsers: rows.length } : null;
}

module.exports = { getLeaderboard, getUserRank, computeLeaderboard };
