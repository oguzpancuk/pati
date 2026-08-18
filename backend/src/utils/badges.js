const pool = require('../config/db');

// Rozet kademeleri ve puanları. Bir kere kazanılan rozet kalıcıdır (seri bozulsa
// bile düşmez); leaderboard puanı yalnızca ulaşılan en yüksek kademeden gelir.
const TIER_POINTS = { bronze: 10, silver: 25, gold: 60, diamond: 150 };
const TIER_ORDER = ['bronze', 'silver', 'gold', 'diamond'];

// Üst üste gün serisine dayalı rozetler (mama/su/hayvan kaydetme).
const STREAK_THRESHOLDS = { bronze: 1, silver: 7, gold: 30, diamond: 365 };
// Adet bazlı rozetler (cins avcılığı, yorum, sağlık takibi).
const COUNT_THRESHOLDS = { bronze: 1, silver: 5, gold: 20, diamond: 100 };
const COMMENT_THRESHOLDS = { bronze: 1, silver: 10, gold: 50, diamond: 200 };

function tierFor(value, thresholds) {
  let result = null;
  for (const tier of TIER_ORDER) {
    if (value >= thresholds[tier]) result = tier;
  }
  return result;
}

function nextThresholdFor(tier, thresholds) {
  if (tier === 'diamond') return null;
  const nextIndex = tier ? TIER_ORDER.indexOf(tier) + 1 : 0;
  return thresholds[TIER_ORDER[nextIndex]];
}

const STREAK_CATEGORIES = {
  feeder: { label: 'Besleyici', unit: 'gün' },
  water: { label: 'Sucu', unit: 'gün' },
  registrar: { label: 'Kaydedici', unit: 'gün' },
};

const COUNT_CATEGORIES = {
  commenter: { label: 'Yorumcu', unit: 'yorum', thresholds: COMMENT_THRESHOLDS },
  healer: { label: 'Sağlık Takipçisi', unit: 'kayıt', thresholds: COUNT_THRESHOLDS },
};

// Tek bir kullanıcı için, tüm kullanıcılar için hesaplama yapan sorgulardan
// yararlanabilmek adına toplu (set-based) sorgular yazıyoruz: leaderboard 100+
// kullanıcıyı kullanıcı başına sorgu atmadan hesaplayabilsin.
async function fetchStreakDays(userIds) {
  const result = await pool.query(
    `WITH events AS (
       SELECT user_id, action_type AS category, DATE(created_at) AS d
       FROM care_actions WHERE user_id = ANY($1)
       UNION
       SELECT created_by AS user_id, 'registrar' AS category, DATE(created_at) AS d
       FROM animals WHERE created_by = ANY($1)
     ),
     grouped AS (
       SELECT user_id, category, d,
              d - (ROW_NUMBER() OVER (PARTITION BY user_id, category ORDER BY d))::int AS grp
       FROM (SELECT DISTINCT user_id, category, d FROM events) x
     ),
     runs AS (
       SELECT user_id, category, grp, count(*)::int AS len
       FROM grouped GROUP BY user_id, category, grp
     )
     SELECT user_id, category, max(len)::int AS longest
     FROM runs GROUP BY user_id, category`,
    [userIds]
  );

  const map = new Map();
  for (const row of result.rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, {});
    // care_actions'ta tür 'food'/'water', rozet anahtarları 'feeder'/'water'.
    const key =
      row.category === 'food' ? 'feeder' : row.category === 'water' ? 'water' : 'registrar';
    map.get(row.user_id)[key] = row.longest;
  }
  return map;
}

async function fetchBreedCounts(userIds) {
  const result = await pool.query(
    `SELECT created_by AS user_id, breed, count(*)::int AS count
     FROM animals
     WHERE created_by = ANY($1) AND breed IS NOT NULL
     GROUP BY created_by, breed`,
    [userIds]
  );
  const map = new Map();
  for (const row of result.rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, {});
    map.get(row.user_id)[row.breed] = row.count;
  }
  return map;
}

async function fetchCommentStats(userIds) {
  const result = await pool.query(
    `SELECT user_id,
            count(*)::int AS total,
            count(DISTINCT animal_id)::int AS distinct_animals,
            -- Aynı hayvana yığılan yorumların puana katkısı sınırlı olsun diye
            -- hayvan başına en fazla 5 yorum sayılıyor (spam'i puana çevirmeyi zorlaştırır).
            SUM(LEAST(per_animal, 5))::int AS capped
     FROM (
       SELECT user_id, animal_id, count(*)::int AS per_animal
       FROM animal_comments WHERE user_id = ANY($1)
       GROUP BY user_id, animal_id
     ) s
     GROUP BY user_id`,
    [userIds]
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(row.user_id, {
      total: row.total,
      distinctAnimals: row.distinct_animals,
      capped: row.capped,
    });
  }
  return map;
}

async function fetchHealthCounts(userIds) {
  const result = await pool.query(
    `SELECT user_id, count(*)::int AS count FROM (
       SELECT recorded_by AS user_id FROM health_records WHERE recorded_by = ANY($1)
       UNION ALL
       SELECT recovered_by AS user_id FROM health_records WHERE recovered_by = ANY($1)
     ) s GROUP BY user_id`,
    [userIds]
  );
  const map = new Map();
  for (const row of result.rows) map.set(row.user_id, row.count);
  return map;
}

const BREED_LABELS = {
  Tekir: 'Tekir Avcısı',
  Sarman: 'Sarman Avcısı',
  Siyah: 'Siyah Kedi Avcısı',
  Beyaz: 'Beyaz Kedi Avcısı',
  'Van Kedisi': 'Van Kedisi Avcısı',
  'Ankara Kedisi': 'Ankara Kedisi Avcısı',
  'Halı (Calico)': 'Calico Avcısı',
  Kangal: 'Kangal Avcısı',
  Akbaş: 'Akbaş Avcısı',
  'Çoban Köpeği': 'Çoban Köpeği Avcısı',
  'Terrier Tipi': 'Terrier Avcısı',
  'Av Köpeği Tipi': 'Av Köpeği Avcısı',
  'Golden/Labrador Tipi': 'Golden/Labrador Avcısı',
  'Sokak Melezi': 'Sokak Melezi Avcısı',
  Diğer: 'Nadir Cins Avcısı',
};

function badgeEntry(key, label, unit, value, tier, thresholds) {
  return {
    key,
    label,
    unit,
    value,
    tier,
    points: tier ? TIER_POINTS[tier] : 0,
    nextThreshold: nextThresholdFor(tier, thresholds),
  };
}

// Ağırlıklı yorum puanı: her yorum 1 puan (hayvan başına en fazla 5 sayılır),
// ayrıca yorum yapılan her ayrı hayvan için 3 puan. Böylece tek bir hayvana
// yüzlerce yorum atmak yerine çok sayıda hayvanla ilgilenmek ödüllendirilir.
function commentPoints(stats) {
  if (!stats) return 0;
  return stats.capped * 1 + stats.distinctAnimals * 3;
}

function buildBadgesFor(userId, streaks, breeds, comments, health) {
  const streakData = streaks.get(userId) || {};
  const breedData = breeds.get(userId) || {};
  const commentData = comments.get(userId);
  const healthCount = health.get(userId) || 0;

  const badges = [];

  for (const [key, meta] of Object.entries(STREAK_CATEGORIES)) {
    const value = streakData[key] || 0;
    badges.push(
      badgeEntry(
        `streak:${key}`,
        meta.label,
        meta.unit,
        value,
        tierFor(value, STREAK_THRESHOLDS),
        STREAK_THRESHOLDS
      )
    );
  }

  for (const [breed, count] of Object.entries(breedData)) {
    badges.push(
      badgeEntry(
        `breed:${breed}`,
        BREED_LABELS[breed] || `${breed} Avcısı`,
        'hayvan',
        count,
        tierFor(count, COUNT_THRESHOLDS),
        COUNT_THRESHOLDS
      )
    );
  }

  const totalComments = commentData?.total || 0;
  badges.push(
    badgeEntry(
      'count:commenter',
      COUNT_CATEGORIES.commenter.label,
      COUNT_CATEGORIES.commenter.unit,
      totalComments,
      tierFor(totalComments, COMMENT_THRESHOLDS),
      COMMENT_THRESHOLDS
    )
  );

  badges.push(
    badgeEntry(
      'count:healer',
      COUNT_CATEGORIES.healer.label,
      COUNT_CATEGORIES.healer.unit,
      healthCount,
      tierFor(healthCount, COUNT_THRESHOLDS),
      COUNT_THRESHOLDS
    )
  );

  const badgePoints = badges.reduce((sum, b) => sum + b.points, 0);
  const engagementPoints = commentPoints(commentData);

  return {
    badges,
    points: {
      badges: badgePoints,
      comments: engagementPoints,
      total: badgePoints + engagementPoints,
    },
  };
}

async function getBadgesForUsers(userIds) {
  if (userIds.length === 0) return new Map();
  const [streaks, breeds, comments, health] = await Promise.all([
    fetchStreakDays(userIds),
    fetchBreedCounts(userIds),
    fetchCommentStats(userIds),
    fetchHealthCounts(userIds),
  ]);

  const result = new Map();
  for (const userId of userIds) {
    result.set(userId, buildBadgesFor(userId, streaks, breeds, comments, health));
  }
  return result;
}

async function getUserBadges(userId) {
  const map = await getBadgesForUsers([userId]);
  return map.get(userId);
}

module.exports = {
  getUserBadges,
  getBadgesForUsers,
  TIER_POINTS,
  TIER_ORDER,
  STREAK_THRESHOLDS,
  COUNT_THRESHOLDS,
  COMMENT_THRESHOLDS,
  BREED_LABELS,
};
