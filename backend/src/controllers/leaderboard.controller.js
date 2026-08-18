const pool = require('../config/db');
const { getBadgesForUsers } = require('../utils/badges');

// Sıralama tüm kullanıcılar üzerinden hesaplanıyor. Rozetler türetilmiş veri
// olduğu için önceden saklanmıyor; bunun yerine rozet hesabı toplu (set-based)
// sorgularla yapılıyor, yani kullanıcı sayısıyla birlikte sorgu sayısı artmıyor.
// Kullanıcı sayısı çok büyüdüğünde bu tabloyu periyodik olarak önbelleğe almak
// gerekir (şu anki ölçekte gerek yok).
async function computeLeaderboard() {
  const users = await pool.query('SELECT id, name, avatar_url FROM users');
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
      badgeCount: earned.length,
      topTier: earned.reduce((best, b) => {
        const order = ['bronze', 'silver', 'gold', 'diamond'];
        return order.indexOf(b.tier) > order.indexOf(best || '') ? b.tier : best;
      }, null),
    };
  });

  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'tr'));

  // Eşit puanlar aynı sırayı paylaşsın (1,2,2,4 gibi).
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

async function getUserRank(userId) {
  const rows = await computeLeaderboard();
  const entry = rows.find((r) => r.id === userId);
  return entry ? { rank: entry.rank, points: entry.points, totalUsers: rows.length } : null;
}

module.exports = { getLeaderboard, getUserRank, computeLeaderboard };
