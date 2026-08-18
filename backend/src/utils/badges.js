const pool = require('../config/db');
const { CAT_PATTERNS, DOG_PATTERNS } = require('./taxonomy');

// Rozet üretilebilen desenler. Serbest metin ("Diğer" seçilince yazılan) rozet
// açmıyor: aksi hâlde her yazım hatası ayrı bir rozet olurdu.
const BADGEABLE_PATTERNS = new Set([...CAT_PATTERNS, ...DOG_PATTERNS]);

// Rozet kademeleri ve puanları. Bir kere kazanılan rozet kalıcıdır (seri bozulsa
// bile düşmez); leaderboard puanı yalnızca ulaşılan en yüksek kademeden gelir.
const TIER_POINTS = { bronze: 10, silver: 25, gold: 60, diamond: 150 };
const TIER_ORDER = ['bronze', 'silver', 'gold', 'diamond'];

// Üst üste gün serisine dayalı rozetler (mama/su/hayvan kaydetme).
const STREAK_THRESHOLDS = { bronze: 1, silver: 7, gold: 30, diamond: 365 };
// Adet bazlı rozetler (cins dostlukları, yorum, sağlık takibi).
const COUNT_THRESHOLDS = { bronze: 1, silver: 5, gold: 20, diamond: 100 };
const COMMENT_THRESHOLDS = { bronze: 1, silver: 10, gold: 50, diamond: 200 };

// Toplam puana göre seviye. Rozetlerden ve yorumlardan gelen puan tek bir
// ilerleme çubuğunda toplansın diye var. Eşikler başta sık, sonra seyrek: ilk
// günlerde hızlı ilerleme hissi olsun, üst seviyeler ise gerçekten anlam taşısın.
//
// İsimlendirme standardı: seviyeler bir **sorumluluk basamağı** anlatır.
// Gönüllü → Sorumlu → Temsilci → Onur. Şaka yok, abartı yok; rozet isimleriyle
// aynı kayıtta duruyor (bkz. STREAK_CATEGORIES).
const LEVELS = [
  { level: 1, title: 'Yeni Komşu', minPoints: 0 },
  { level: 2, title: 'Mahalle Gönüllüsü', minPoints: 40 },
  { level: 3, title: 'Düzenli Gönüllü', minPoints: 120 },
  { level: 4, title: 'Mahalle Sorumlusu', minPoints: 250 },
  { level: 5, title: 'Kıdemli Gönüllü', minPoints: 450 },
  { level: 6, title: 'Bölge Gönüllüsü', minPoints: 750 },
  { level: 7, title: 'Mahalle Temsilcisi', minPoints: 1200 },
  { level: 8, title: 'Kıdemli Temsilci', minPoints: 1800 },
  { level: 9, title: 'Şehir Gönüllüsü', minPoints: 2600 },
  { level: 10, title: 'Onur Üyesi', minPoints: 3600 },
];

function levelFor(points) {
  const safePoints = Math.max(0, points || 0);
  let current = LEVELS[0];
  for (const entry of LEVELS) {
    if (safePoints >= entry.minPoints) current = entry;
  }
  const next = LEVELS[current.level] || null; // LEVELS sıralı, index = level
  const span = next ? next.minPoints - current.minPoints : 0;
  return {
    level: current.level,
    title: current.title,
    // Seviye amblemi emoji değil: mobil taraf seviye numarasından prosedürel
    // bir işaret çiziyor (bkz. components/badges/LevelMark). Böylece 10 ayrı
    // görsel çizmek gerekmiyor ve ilerleme görsel olarak da bir seri oluşturuyor.
    minPoints: current.minPoints,
    nextLevelPoints: next ? next.minPoints : null,
    nextTitle: next ? next.title : null,
    // İlerleme çubuğu için 0-1 arası oran; en üst seviyede 1.
    progress: next ? Math.min(1, (safePoints - current.minPoints) / span) : 1,
  };
}

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

//
// ## Rozet isimlendirme standardı
//
// İki kalıp var, üçüncüsü yok:
//   1. Katkı rozetleri  →  "<Alan> Gönüllüsü"   (Mama Gönüllüsü, Aşı Gönüllüsü)
//   2. Desen rozetleri  →  "<Desen> Dostu"      (Tekir Dostu, Kangal Melezi Dostu)
//
// Kademe sıfat olarak öne geliyor: "Altın Mama Gönüllüsü".
//
// Neden böyle: önceki isimler ("Mama Perisi", "Mahalle Dedikoducusu") her biri
// ayrı bir şaka olduğu için ne bir arada durabiliyordu ne de yeni rozet
// eklenince kalıbı belliydi. Bu iki kalıpla yeni kategori eklemek mekanik bir iş.
// "Gönüllü" kelimesi ayrıca işin gerçeğini anlatıyor — bunlar gerçekten gönüllü.
//
// `symbol` mobil tarafın hangi SVG'yi çizeceğini söylüyor (emoji kullanmıyoruz).
const STREAK_CATEGORIES = {
  feeder: { label: 'Mama Gönüllüsü', unit: 'gün', symbol: 'food' },
  water: { label: 'Su Gönüllüsü', unit: 'gün', symbol: 'water' },
  registrar: { label: 'Kayıt Gönüllüsü', unit: 'gün', symbol: 'register' },
};

const COUNT_CATEGORIES = {
  commenter: {
    label: 'Takip Gönüllüsü',
    unit: 'yorum',
    symbol: 'comment',
    thresholds: COMMENT_THRESHOLDS,
  },
  healer: {
    label: 'Sağlık Gönüllüsü',
    unit: 'kayıt',
    symbol: 'health',
    thresholds: COUNT_THRESHOLDS,
  },
  vaccinator: {
    label: 'Aşı Gönüllüsü',
    unit: 'aşı',
    symbol: 'vaccine',
    thresholds: COUNT_THRESHOLDS,
  },
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

async function fetchVaccinationCounts(userIds) {
  const result = await pool.query(
    `SELECT recorded_by AS user_id, count(*)::int AS count
     FROM vaccinations WHERE recorded_by = ANY($1)
     GROUP BY recorded_by`,
    [userIds]
  );
  const map = new Map();
  for (const row of result.rows) map.set(row.user_id, row.count);
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

// Desen rozetleri tek kalıpla üretiliyor: "<Desen> Dostu". Ayrı bir eşleme
// tablosu yok — taksonomiye yeni desen eklenince rozeti kendiliğinden oluşuyor.
// Tek istisna serbest metin: kullanıcının yazdığı "Diğer" değerleri rozet
// üretmiyor, aksi hâlde her yazım hatası ayrı bir rozet açardı.
function breedBadgeLabel(breed) {
  return `${breed} Dostu`;
}

function badgeEntry(key, label, unit, value, tier, thresholds, symbol) {
  return {
    key,
    label,
    unit,
    value,
    tier,
    // Mobil taraf bu ada göre SVG sembolü çiziyor; emoji göndermiyoruz.
    symbol,
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

function buildBadgesFor(userId, streaks, breeds, comments, health, vaccines) {
  const streakData = streaks.get(userId) || {};
  const breedData = breeds.get(userId) || {};
  const commentData = comments.get(userId);
  const healthCount = health.get(userId) || 0;
  const vaccineCount = vaccines.get(userId) || 0;

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
        STREAK_THRESHOLDS,
        meta.symbol
      )
    );
  }

  for (const [breed, count] of Object.entries(breedData)) {
    if (!BADGEABLE_PATTERNS.has(breed)) continue;
    badges.push(
      badgeEntry(
        `breed:${breed}`,
        breedBadgeLabel(breed),
        'hayvan',
        count,
        tierFor(count, COUNT_THRESHOLDS),
        COUNT_THRESHOLDS,
        'paw'
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
      COMMENT_THRESHOLDS,
      COUNT_CATEGORIES.commenter.symbol
    )
  );

  badges.push(
    badgeEntry(
      'count:healer',
      COUNT_CATEGORIES.healer.label,
      COUNT_CATEGORIES.healer.unit,
      healthCount,
      tierFor(healthCount, COUNT_THRESHOLDS),
      COUNT_THRESHOLDS,
      COUNT_CATEGORIES.healer.symbol
    )
  );

  badges.push(
    badgeEntry(
      'count:vaccinator',
      COUNT_CATEGORIES.vaccinator.label,
      COUNT_CATEGORIES.vaccinator.unit,
      vaccineCount,
      tierFor(vaccineCount, COUNT_THRESHOLDS),
      COUNT_THRESHOLDS,
      COUNT_CATEGORIES.vaccinator.symbol
    )
  );

  const badgePoints = badges.reduce((sum, b) => sum + b.points, 0);
  const engagementPoints = commentPoints(commentData);
  const total = badgePoints + engagementPoints;

  return {
    badges,
    points: {
      badges: badgePoints,
      comments: engagementPoints,
      total,
    },
    level: levelFor(total),
  };
}

async function getBadgesForUsers(userIds) {
  if (userIds.length === 0) return new Map();
  const [streaks, breeds, comments, health, vaccines] = await Promise.all([
    fetchStreakDays(userIds),
    fetchBreedCounts(userIds),
    fetchCommentStats(userIds),
    fetchHealthCounts(userIds),
    fetchVaccinationCounts(userIds),
  ]);

  const result = new Map();
  for (const userId of userIds) {
    result.set(userId, buildBadgesFor(userId, streaks, breeds, comments, health, vaccines));
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
  levelFor,
  LEVELS,
  TIER_POINTS,
  TIER_ORDER,
  STREAK_THRESHOLDS,
  COUNT_THRESHOLDS,
  COMMENT_THRESHOLDS,
};
