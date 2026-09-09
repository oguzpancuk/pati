const pool = require('../config/db');
const { getBadgesForUsers } = require('../utils/badges');
const { showsDemo } = require('../utils/settings');

// The ranking is computed over all users. Badges are derived data and are
// not stored; the badge computation runs as set-based queries, so the query
// count doesn't grow with the user count. At much larger scale this table
// will need periodic caching (unnecessary at the current size).
/**
 * `viewerId` decides WHOSE board this is: the showcase world competes on
 * the board of everyone who keeps it on, and leaves the board of anyone who
 * switches it off in their profile (owner, 2026-09-09). Pass
 * `{ canonical: true }` for the one board that is the same for everyone —
 * see getUserRank.
 *
 * Suspended and self-deleted (anonymized) accounts are excluded either way:
 * a "Silinmiş Üye" holding a rank pushes living volunteers down the board.
 */
async function computeLeaderboard(viewerId, { canonical = false } = {}) {
  const hideDemo = !canonical && !(await showsDemo(viewerId));
  // A demo account that has the showcase world switched off would otherwise
  // filter itself off its own board and lose its "your rank" row — those are
  // exactly the accounts used for demos and screenshots (review finding).
  const params = hideDemo && viewerId ? [viewerId] : [];
  const filter = hideDemo
    ? ` AND (NOT users.is_demo${params.length ? ' OR users.id = $1' : ''})`
    : '';
  const users = await pool.query(
    `SELECT id, name, avatar_url, is_demo FROM users WHERE suspended_at IS NULL${filter}`,
    params
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
      // Showcase accounts wear a "demo" chip wherever they appear, so a
      // newcomer can tell the tour from the neighbourhood (owner).
      is_demo: user.is_demo,
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
    const rows = await computeLeaderboard(req.user.userId);
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

function entryFor(rows, userId) {
  const entry = rows.find((r) => r.id === userId);
  return entry ? { rank: entry.rank, points: entry.points, totalUsers: rows.length } : null;
}

/**
 * A rank to SHOW, always on the viewer's own board — the same one the
 * leaderboard screen just displayed, so a profile and the board never
 * disagree by two thirds of the field (review finding). The viewer defaults
 * to the subject, which is the "my own profile" case; null when the subject
 * is not on that board at all.
 */
async function getUserRank(userId, viewerId = userId) {
  return entryFor(await computeLeaderboard(viewerId), userId);
}

/**
 * The one board that is the same for everyone. Only for numbers that are
 * STORED or compared across time — `users.last_rank` and a badge award's
 * rank_before/rank_after — which must not move because somebody flipped a
 * switch: a viewer-relative rank froze "you dropped 4289 places" into an
 * award row (review finding).
 */
async function getCanonicalRank(userId) {
  return entryFor(await computeLeaderboard(userId, { canonical: true }), userId);
}

module.exports = { getLeaderboard, getUserRank, getCanonicalRank, computeLeaderboard };
