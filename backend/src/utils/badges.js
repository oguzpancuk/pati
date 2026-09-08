const pool = require('../config/db');
const { CAT_PATTERNS, DOG_PATTERNS } = require('./taxonomy');

// Patterns that can produce a badge. Free text (typed when "Other" is picked)
// earns no badge: otherwise every typo would become its own badge.
const BADGEABLE_PATTERNS = new Set([...CAT_PATTERNS, ...DOG_PATTERNS]);

// Badge tiers and their points. Once earned, a badge is permanent (it doesn't
// drop even if the streak breaks); leaderboard points come only from the
// highest tier reached.
const TIER_POINTS = { bronze: 10, silver: 25, gold: 60, diamond: 150 };
const TIER_ORDER = ['bronze', 'silver', 'gold', 'diamond'];

// Badges based on consecutive-day streaks (food/water/animal registration).
const STREAK_THRESHOLDS = { bronze: 1, silver: 7, gold: 30, diamond: 365 };
// Count-based badges (breed friendships, comments, health tracking).
const COUNT_THRESHOLDS = { bronze: 1, silver: 5, gold: 20, diamond: 100 };
const COMMENT_THRESHOLDS = { bronze: 1, silver: 10, gold: 50, diamond: 200 };

// Level derived from total points, so that points from badges and comments
// accumulate in a single progress bar. Thresholds are dense at first, then
// sparse: fast progress in the early days, while upper levels carry real
// meaning.
//
// Naming standard: levels describe a **ladder of responsibility** (in Turkish,
// product-facing): Gönüllü (volunteer) → Sorumlu (steward) → Temsilci
// (representative) → Onur (honorary). No jokes, no hyperbole; same register
// as the badge names (see STREAK_CATEGORIES).
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
  const next = LEVELS[current.level] || null; // LEVELS is ordered, index = level
  const span = next ? next.minPoints - current.minPoints : 0;
  return {
    level: current.level,
    title: current.title,
    // The level emblem is not an emoji: the mobile side draws a procedural
    // mark from the level number (see components/badges/LevelMark). No need to
    // draw 10 separate images, and progression forms a visual series too.
    minPoints: current.minPoints,
    nextLevelPoints: next ? next.minPoints : null,
    nextTitle: next ? next.title : null,
    // 0-1 ratio for the progress bar; 1 at the top level.
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
// ## Badge naming standard (labels are Turkish, product-facing)
//
// Two patterns, no third:
//   1. Contribution badges →  "<Area> Gönüllüsü" ("<area> volunteer":
//      Mama Gönüllüsü, Aşı Gönüllüsü)
//   2. Pattern badges      →  "<Pattern> Dostu"  ("friend of <pattern>":
//      Tekir Dostu, Kangal Melezi Dostu)
//
// The tier goes in front as an adjective: "Altın Mama Gönüllüsü" (gold).
//
// Why: the earlier names ("Mama Perisi", "Mahalle Dedikoducusu") were each a
// separate joke, so they neither sat well together nor suggested a pattern
// when a new badge was added. With these two patterns, adding a category is
// mechanical. "Gönüllü" (volunteer) also states the plain truth — these
// people really are volunteers.
//
// `symbol` tells the mobile side which SVG to draw (we don't use emoji).
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

// Queries are written set-based over many users so a single-user lookup and
// the leaderboard share the same code path: the leaderboard can compute 100+
// users without issuing a query per user.
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
    // care_actions uses 'food'/'water'; badge keys are 'feeder'/'water'.
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
            -- At most 5 comments per animal count toward points, so piling
            -- comments onto one animal has limited value (harder to turn spam into points).
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

// Pattern badges come from a single template: "<Pattern> Dostu". There is no
// separate mapping table — a new pattern in the taxonomy gets its badge
// automatically. The one exception is free text: user-typed "Other" values
// produce no badge, otherwise every typo would open a new one.
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
    // The mobile side draws the SVG symbol from this name; no emoji sent.
    symbol,
    points: tier ? TIER_POINTS[tier] : 0,
    nextThreshold: nextThresholdFor(tier, thresholds),
  };
}

// Weighted comment points: 1 point per comment (max 5 counted per animal),
// plus 3 points for each distinct animal commented on. Caring about many
// animals is rewarded over posting hundreds of comments on one.
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

// ---------------------------------------------------------------- animals
//
// Badges an ANIMAL earns (ROADMAP P6 item 5). The whole vocabulary is
// THIS one constant: the rows in animal_badges keep only the key, so a
// rename is a one-place change. Names are the owner's (2026-09-08); the
// tier shows as the medallion colour, the name stays fixed — no "Altın …"
// prefix here, unlike the user badges. `symbol` reuses the medallion
// glyphs both clients already draw (BadgeSymbolName): no new art.
//
// Tiers are count-based: 1/5/20/100 (comments 1/10/50/200), the user
// ladders. A tier, once earned, is permanent — the sync only ever inserts.
const ANIMAL_BADGES = {
  // Registration match hits: someone's photo was judged the same animal
  // in the add-animal step, or went unjudged with no model (rows in
  // animal_match_attempts, kind = 'register'; 'similar'/'unsure' are never
  // logged), counted per person — a retried form is one recognition.
  // Spent rows (used_at) count too: the animal WAS recognised; which
  // animal the person confirmed afterwards is another fact.
  matched: {
    label: 'Tanıdık Yüz',
    unit: 'eşleşme',
    symbol: 'register',
    thresholds: COUNT_THRESHOLDS,
  },
  commented: {
    label: 'Mahallenin Dilinde',
    unit: 'yorum',
    symbol: 'comment',
    thresholds: COMMENT_THRESHOLDS,
  },
  // Health records marked recovered.
  recovered: {
    label: 'Şifa Bulan',
    unit: 'iyileşme',
    symbol: 'health',
    thresholds: COUNT_THRESHOLDS,
  },
  liked: { label: 'Gönül Çelen', unit: 'beğeni', symbol: 'paw', thresholds: COUNT_THRESHOLDS },
  followed: {
    label: 'Mahallenin Yıldızı',
    unit: 'takipçi',
    symbol: 'paw',
    thresholds: COUNT_THRESHOLDS,
  },
  cared: { label: 'El Üstünde', unit: 'bakıcı', symbol: 'paw', thresholds: COUNT_THRESHOLDS },
};

/** The tier a count reaches for one animal badge key; null below bronze. */
function animalBadgeTier(key, count) {
  const meta = ANIMAL_BADGES[key];
  if (!meta) return null;
  return tierFor(Math.max(0, Number(count) || 0), meta.thresholds);
}

/** Every tier up to and including `tier`, in ladder order (for the inserts). */
function tiersUpTo(tier) {
  if (!tier) return [];
  return TIER_ORDER.slice(0, TIER_ORDER.indexOf(tier) + 1);
}

// One query, six counts: the sync runs after every event that can move a
// count, and a profile shows at most six chips.
async function fetchAnimalCounts(animalId) {
  const result = await pool.query(
    `SELECT
       (SELECT count(DISTINCT user_id) FROM animal_match_attempts WHERE animal_id = $1 AND kind = 'register')::int AS matched,
       (SELECT count(*) FROM animal_comments WHERE animal_id = $1)::int AS commented,
       (SELECT count(*) FROM health_records WHERE animal_id = $1 AND recovered_at IS NOT NULL)::int AS recovered,
       (SELECT count(*) FROM animal_photo_likes l JOIN animal_photos p ON p.id = l.photo_id WHERE p.animal_id = $1)::int AS liked,
       (SELECT count(*) FROM animal_followers WHERE animal_id = $1)::int AS followed,
       (SELECT count(*) FROM user_animal_care WHERE animal_id = $1)::int AS cared`,
    [animalId]
  );
  return result.rows[0];
}

function animalBadgeEntry(key, tier, value) {
  const meta = ANIMAL_BADGES[key];
  return {
    key,
    label: meta.label,
    unit: meta.unit,
    symbol: meta.symbol,
    tier,
    value,
    nextThreshold: nextThresholdFor(tier, meta.thresholds),
  };
}

/**
 * Compares the counts with animal_badges and inserts the tiers newly
 * reached (every tier up to the current one: a jump past silver still
 * records silver). Returns the badges earned by this call.
 */
async function syncAnimalBadges(animalId) {
  const counts = await fetchAnimalCounts(animalId);
  const existing = await pool.query(
    'SELECT badge_key, tier FROM animal_badges WHERE animal_id = $1',
    [animalId]
  );
  const seen = new Set(existing.rows.map((row) => `${row.badge_key}:${row.tier}`));
  const fresh = [];
  for (const key of Object.keys(ANIMAL_BADGES)) {
    const value = counts[key] ?? 0;
    for (const tier of tiersUpTo(animalBadgeTier(key, value))) {
      if (seen.has(`${key}:${tier}`)) continue;
      const inserted = await pool.query(
        `INSERT INTO animal_badges (animal_id, badge_key, tier) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING tier`,
        [animalId, key, tier]
      );
      if (inserted.rowCount > 0) fresh.push(animalBadgeEntry(key, tier, value));
    }
  }
  return fresh;
}

// A badge sync must never fail the request that triggered it: the like or
// the comment is already written; the badge can catch up on the next event.
async function syncAnimalBadgesSafe(animalId) {
  try {
    return await syncAnimalBadges(animalId);
  } catch (err) {
    console.warn(`[badges] animal ${animalId} sync failed: ${err?.message ?? err}`);
    return [];
  }
}

/**
 * The earned badges of many animals at once (the list page, the profile):
 * the highest tier per key from animal_badges, in ANIMAL_BADGES order.
 * Reads the awards table only — the counts were compared when the event
 * happened, and a list must not run six counts per row.
 * @returns {Promise<Map<number, Array>>}
 */
async function getAnimalBadgesFor(animalIds) {
  const map = new Map(animalIds.map((id) => [id, []]));
  if (animalIds.length === 0) return map;
  const result = await pool.query(
    `SELECT animal_id, badge_key, tier FROM animal_badges WHERE animal_id = ANY($1)`,
    [animalIds]
  );
  const best = new Map();
  for (const row of result.rows) {
    const k = `${row.animal_id}:${row.badge_key}`;
    const current = best.get(k);
    if (!current || TIER_ORDER.indexOf(row.tier) > TIER_ORDER.indexOf(current.tier)) {
      best.set(k, row);
    }
  }
  const keyOrder = Object.keys(ANIMAL_BADGES);
  for (const row of best.values()) {
    if (!ANIMAL_BADGES[row.badge_key]) continue; // a retired key: rows stay, nothing shows
    map.get(row.animal_id)?.push(animalBadgeEntry(row.badge_key, row.tier, undefined));
  }
  for (const list of map.values()) {
    list.sort((a, b) => keyOrder.indexOf(a.key) - keyOrder.indexOf(b.key));
  }
  return map;
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
  ANIMAL_BADGES,
  animalBadgeTier,
  tiersUpTo,
  syncAnimalBadges,
  syncAnimalBadgesSafe,
  getAnimalBadgesFor,
};
