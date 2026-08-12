const pool = require('../config/db');

// Rozet kademeleri: bir kategoride (mama/su/hayvan kaydetme) en uzun ardışık gün
// serisine göre belirlenir ve kalıcıdır (bir kere kazanılan rozet düşürülmez).
const TIERS = [
  { minDays: 365, tier: 'diamond' },
  { minDays: 30, tier: 'gold' },
  { minDays: 7, tier: 'silver' },
  { minDays: 1, tier: 'bronze' },
];

function tierForStreak(days) {
  const match = TIERS.find((t) => days >= t.minDays);
  return match ? match.tier : null;
}

// Klasik "gaps and islands": bir tarih kümesindeki en uzun ardışık gün serisini bulur.
async function longestStreakDays(whereSql, params) {
  const result = await pool.query(
    `WITH days AS (
       SELECT DISTINCT DATE(created_at) AS d FROM (${whereSql}) src
     ),
     grouped AS (
       SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS grp FROM days
     )
     SELECT COALESCE(MAX(cnt), 0)::int AS longest
     FROM (SELECT grp, COUNT(*) AS cnt FROM grouped GROUP BY grp) s`,
    params
  );
  return result.rows[0].longest;
}

async function getUserBadges(userId) {
  const [foodDays, waterDays, animalDays] = await Promise.all([
    longestStreakDays('SELECT created_at FROM care_actions WHERE user_id = $1 AND action_type = $2', [
      userId,
      'food',
    ]),
    longestStreakDays('SELECT created_at FROM care_actions WHERE user_id = $1 AND action_type = $2', [
      userId,
      'water',
    ]),
    longestStreakDays('SELECT created_at FROM animals WHERE created_by = $1', [userId]),
  ]);

  return {
    feeder: { streakDays: foodDays, tier: tierForStreak(foodDays) },
    water: { streakDays: waterDays, tier: tierForStreak(waterDays) },
    registrar: { streakDays: animalDays, tier: tierForStreak(animalDays) },
  };
}

module.exports = { tierForStreak, getUserBadges };
