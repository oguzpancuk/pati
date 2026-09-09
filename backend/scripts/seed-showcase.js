/**
 * Builds the showcase ("demo") world: a month of plausible street-animal care
 * across every central district of İstanbul, İzmir and Ankara, so a first
 * look at the app — or a screenshot for the stores — shows a living map
 * instead of three test pins in Kadıköy.
 *
 * ## This script is ADDITIVE
 * `seed-demo.js` TRUNCATEs every table; this one must never be confused with
 * it. It is meant to run against production, alongside real users, and it
 * only ever INSERTs. Every row it writes carries `is_demo = true`
 * (migration 011), which is what the demo-visibility switch hides
 * everywhere and what `--remove` deletes. That switch lives on each
 * profile (`users.show_demo`), not in the admin panel — it began as one
 * global toggle and moved.
 *
 *   node scripts/seed-showcase.js [flags]
 *
 *   --districts=all|<n>  how many districts to seed (default all; a number
 *                        takes them round-robin across the three cities, so
 *                        --districts=3 is one per city)
 *   --users=<n>          demo users per district (default 50), 3 animals each
 *   --base=<url>         origin for the photo URLs (default
 *                        http://localhost:3000; production passes
 *                        https://pati-app.com)
 *   --remove             delete every is_demo row, in dependency order
 *   --force              with --remove, delete even when real users have
 *                        attached rows that would cascade away with it
 *   --badges-only        skip seeding; just (re)sync badges for the demo
 *                        users that already exist — the resume path when a
 *                        run dies during the badge phase
 *   --skip-photo-check   do not verify that --base actually serves the demo
 *                        photos before writing their URLs
 *   --dry-run            do the whole run inside transactions and ROLLBACK
 *                        them; the reported counts are what would be
 *                        written, minus the cross-district friendships and
 *                        badge awards, which need committed ids
 *
 * ## Two things must be true before the production run
 * 1. `--base` must already serve `demo-assets/` at `/demo` — the photo URLs
 *    are STORED, so a route added afterwards only helps if the path matches
 *    exactly. The preflight below refuses to write until it does.
 * 2. The owner has to accept what the demo world does to stored ranks.
 *    Hiding demo rows from the leaderboard VIEW is not enough: a stored
 *    rank must not move with a viewer's preference, so `getUserRank` reads
 *    the canonical board — demo accounts included. From the moment this
 *    seed lands, the next badge any REAL volunteer earns freezes a rank
 *    computed over a board holding 2200 bots into `user_badge_awards`, and
 *    `--remove` cannot repair it. Nothing in this script can prevent that;
 *    it is a product decision about what a rank means once a demo world
 *    exists.
 *
 * ## Re-running is safe
 * A district is seeded inside one transaction, so it is either wholly there
 * or wholly absent. Whether it is there is asked of the deterministic
 * account names (`demo-<il>-<ilce>-<n>@pati.demo`); an already-seeded
 * district is skipped and reported. `ON CONFLICT DO NOTHING` guards the rows
 * that have a natural key on top of that.
 *
 * ## Chattiness costs minutes
 * The production run happens over `fly ssh console`, so rows go in as
 * multi-row VALUES statements (see insertRows) rather than a statement per
 * row.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../src/config/db');
const { AVATAR_KEYS, AVATAR_PREFIX } = require('../src/utils/avatars');
const {
  CAT_PATTERNS,
  DOG_PATTERNS,
  ILLNESSES,
  INJURIES,
  VACCINE_TYPES,
  colorsFor,
  fixedColorFor,
} = require('../src/utils/taxonomy');
const { syncBadgeAwards } = require('../src/utils/badgeAwards');
const neighborhoods = require('./data/neighborhoods.json');
const { demoPhotoFile, slug } = require('./lib/demoPhotos');
const {
  MARKINGS,
  DM_TOPICS,
  GROUP_LINES,
  GROUP_OPENING,
  GROUP_SUFFIXES,
  VACCINE_NOTES,
  pick,
  pickMany,
  fullName,
  animalName,
  animalComment,
  healthComment,
} = require('./lib/demoContent');

// The three cities the showcase covers. neighborhoods.json also holds a
// four-point Antalya/Kaş entry left over from the guide data; seeding a
// district off four coordinates would look like a bug, so the city list is
// explicit rather than "every key in the file".
const CITIES = ['İstanbul', 'İzmir', 'Ankara'];
const ANIMALS_PER_USER = 3;
const HISTORY_DAYS = 30;
// care.controller.js: food rings live 4 h, water 6 h. The fresh slice sits
// comfortably inside both so the map still shows rings a while after the
// seed runs.
const FRESH_HOURS = { food: 3.5, water: 5.5 };

/**
 * A drop's photo shows the BOWL, not an animal: that is what a real drop
 * carries and what the AI check looks at, and the admin panel's care list
 * renders the field (QA finding, 2026-09-09). The two files come from
 * generate-demo-care-photos.mjs.
 */
const carePhoto = (base, type) => `${base}/demo/care/${type}.png`;
const EMAIL_DOMAIN = 'pati.demo';
const MS_DAY = 86_400_000;
const MS_HOUR = 3_600_000;

// ------------------------------------------------------------------- flags

function parseArgs(argv) {
  const flags = {
    districts: 'all',
    users: 50,
    base: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
    remove: false,
    force: false,
    badgesOnly: false,
    skipPhotoCheck: false,
    dryRun: false,
  };
  for (const arg of argv) {
    const [key, rawValue] = arg.startsWith('--') ? arg.slice(2).split('=') : [arg, undefined];
    switch (key) {
      case 'districts': {
        if (rawValue === 'all') break;
        const n = Number(rawValue);
        if (!Number.isInteger(n) || n < 1) throw new Error(`--districts wants "all" or a count`);
        flags.districts = n;
        break;
      }
      case 'users': {
        const n = Number(rawValue);
        if (!Number.isInteger(n) || n < 1 || n > 500) throw new Error('--users wants 1..500');
        flags.users = n;
        break;
      }
      case 'base': {
        // Validated rather than trusted: a typo here bakes a broken photo
        // URL into thousands of rows, and the failure only shows up as a
        // grey box in the app.
        let url;
        try {
          url = new URL(rawValue);
        } catch {
          throw new Error(`--base is not a URL: ${rawValue}`);
        }
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('--base wants http(s)');
        flags.base = url.origin;
        break;
      }
      case 'remove':
        flags.remove = true;
        break;
      case 'force':
        flags.force = true;
        break;
      case 'badges-only':
        flags.badgesOnly = true;
        break;
      case 'skip-photo-check':
        flags.skipPhotoCheck = true;
        break;
      case 'dry-run':
        flags.dryRun = true;
        break;
      case 'help':
        flags.help = true;
        break;
      default:
        throw new Error(`unknown flag: ${arg}`);
    }
  }
  // Asking what the flags mean is the one input that must never be
  // refused for using them wrongly.
  if (flags.help) return flags;
  // --force only ever means "delete real rows too". Accepting it silently
  // on a seeding run would teach the habit of typing it.
  if (flags.force && !flags.remove) throw new Error('--force only applies with --remove');
  if (flags.badgesOnly && flags.remove) throw new Error('--badges-only and --remove are exclusive');
  return flags;
}

// --------------------------------------------------------------------- rng

/**
 * Seeded PRNG (mulberry32). Every district draws from its own stream keyed
 * by its name, so the same district always produces the same world and
 * adding a district does not reshuffle the others.
 */
function rngFor(key) {
  let h = crypto.createHash('sha256').update(key).digest().readUInt32LE(0);
  return function next() {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const chance = (rng, p) => rng() < p;

// ------------------------------------------------------------ batched insert

const MAX_PARAMS = 60000; // Postgres allows 65535 bind parameters per statement.
const MAX_ROWS_PER_STATEMENT = 2000;

/**
 * Inserts many rows as few multi-row VALUES statements.
 *
 * `columns` entries are either a plain name or `{ name, tpl }`, where `tpl`
 * is the value expression with `?` for each bind parameter — that is how a
 * geography column gets its ST_MakePoint wrapper without the caller
 * hand-writing placeholder numbers. Each `row` is a flat array of parameters
 * in column order, as long as the total number of `?`.
 *
 * @returns {Promise<Array>} the RETURNING rows, in statement order
 */
async function insertRows(client, table, columns, rows, { conflict = '', returning = '' } = {}) {
  if (rows.length === 0) return [];
  const names = columns.map((c) => (typeof c === 'string' ? c : c.name));
  const tpls = columns.map((c) => (typeof c === 'string' ? '?' : c.tpl));
  const paramsPerRow = tpls.join('').split('?').length - 1;
  if (rows.some((r) => r.length !== paramsPerRow)) {
    throw new Error(`${table}: row width must be ${paramsPerRow}`);
  }
  const chunkSize = Math.max(
    1,
    Math.min(MAX_ROWS_PER_STATEMENT, Math.floor(MAX_PARAMS / paramsPerRow))
  );
  const out = [];
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params = [];
    let n = 0;
    const tuples = chunk.map((row) => {
      params.push(...row);
      return `(${tpls.map((t) => t.replace(/\?/g, () => `$${(n += 1)}`)).join(', ')})`;
    });
    const sql =
      `INSERT INTO ${table} (${names.join(', ')}) VALUES ${tuples.join(', ')}` +
      (conflict ? ` ${conflict}` : '') +
      (returning ? ` RETURNING ${returning}` : '');
    const result = await client.query(sql, params);
    out.push(...result.rows);
  }
  return out;
}

/**
 * Attaches generated ids back onto the plan objects that produced them.
 *
 * Postgres happens to return multi-row `INSERT … VALUES … RETURNING` in
 * VALUES order, but that is not a contract, and a permutation here would be
 * silent and catastrophic: every photo, comment, health record and
 * notification would attach to the wrong animal without anything erroring.
 * So each insert also returns a column that identifies the row, and the
 * assignment is checked against it rather than trusted.
 *
 * @param {Array} items the planned objects, in the order they were inserted
 * @param {Array} rows the RETURNING rows
 * @param {(item: object) => unknown} expect the value `rows[i][field]` must equal
 * @param {string} field the correlating column in the RETURNING rows
 */
function assignIds(label, items, rows, expect, field) {
  if (rows.length !== items.length) {
    throw new Error(`${label}: inserted ${items.length} rows but got ${rows.length} ids back`);
  }
  items.forEach((item, i) => {
    const got = rows[i][field];
    const want = expect(item);
    const same = got instanceof Date && want instanceof Date ? got.getTime() === want.getTime() : got === want;
    if (!same) {
      throw new Error(
        `${label}: RETURNING came back out of order (row ${i}: ${field} ${String(got)} != ${String(want)})`
      );
    }
    // The correlating column alone is not enough: two rows can share a
    // second-resolution timestamp, and a permutation confined to such a
    // group would slip through. Serial ids are handed out in VALUES order,
    // so requiring them to increase closes that gap.
    if (i > 0 && !(rows[i].id > rows[i - 1].id)) {
      throw new Error(`${label}: RETURNING ids are not in insert order at row ${i}`);
    }
    item.id = rows[i].id;
  });
}

/** A geography point column: two parameters, lng first (PostGIS x, y). */
const POINT = { tpl: 'ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography' };

// ------------------------------------------------------------------ districts

/** [{ city, district, key, points }] for the three showcase cities. */
function loadDistricts() {
  const byCity = new Map(CITIES.map((c) => [c, []]));
  for (const [key, points] of Object.entries(neighborhoods)) {
    const [city, district] = key.split('/');
    if (!byCity.has(city) || points.length === 0) continue;
    byCity.get(city).push({ city, district, key, points });
  }
  for (const [city, list] of byCity) {
    if (list.length === 0) throw new Error(`neighborhoods.json has no districts for ${city}`);
  }
  return byCity;
}

/**
 * Round-robin across the cities so a capped run (--districts=3) covers all
 * three rather than the first city's first three.
 */
function selectDistricts(byCity, limit) {
  const queues = CITIES.map((c) => [...byCity.get(c)]);
  const out = [];
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) if (q.length > 0) out.push(q.shift());
  }
  return limit === 'all' ? out : out.slice(0, limit);
}

/** demo-istanbul-kadikoy-7@pati.demo — the key a rerun recognises. */
function emailPrefix(district) {
  return `demo-${slug(district.city)}-${slug(district.district)}-`;
}

/** A neighbourhood point of the district, jittered by up to ~`meters`. */
function nearby(rng, district, meters) {
  const p = pick(rng, district.points);
  const dLat = ((rng() - 0.5) * 2 * meters) / 111_320;
  const dLng = ((rng() - 0.5) * 2 * meters) / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

/** Jitters an existing point (an animal's spot) by up to ~`meters`. */
function jitter(rng, point, meters) {
  const dLat = ((rng() - 0.5) * 2 * meters) / 111_320;
  const dLng = ((rng() - 0.5) * 2 * meters) / (111_320 * Math.cos((point.lat * Math.PI) / 180));
  return { lat: point.lat + dLat, lng: point.lng + dLng };
}

/**
 * Nothing the seed writes may be dated in the future: a "recovered" note
 * dated next week, or a notification created ahead of now (which is then
 * never old enough to be marked read, so the bell stays lit forever), reads
 * as a bug in the app rather than as demo data. Every derived timestamp
 * goes through here — `momentDaysAgo` picks a plausible moment, this makes
 * sure a chain of "+ N days" offsets on top of it cannot walk past now.
 */
function noLaterThan(at, now) {
  return at > now ? now : at;
}

/**
 * A timestamp `daysAgo` days back, at a plausible hour: care happens on the
 * way to work and after dinner, not uniformly around the clock.
 *
 * The hour is Türkiye's, not the machine's. The production run happens on a
 * Fly machine in UTC, and `setHours` there would shift the morning and
 * evening clusters by three hours — the "after dinner" drops would render to
 * a Turkish user as after midnight. Türkiye is UTC+3 all year (no DST), so
 * the offset is a constant.
 */
const TR_UTC_OFFSET_HOURS = 3;

function momentDaysAgo(rng, daysAgo, now) {
  const morning = chance(rng, 0.55);
  const hour = morning ? 6.5 + rng() * 3.5 : 17.5 + rng() * 5;
  const day = new Date(now.getTime() - daysAgo * MS_DAY);
  day.setUTCHours(
    Math.floor(hour) - TR_UTC_OFFSET_HOURS,
    Math.floor((hour % 1) * 60),
    int(rng, 0, 59),
    0
  );
  // daysAgo === 0 with an evening hour lands after "now". Push it back a
  // whole day rather than clamping, so the row keeps a plausible hour
  // instead of piling onto the same instant as every other clamped row.
  return day > now ? new Date(day.getTime() - MS_DAY) : day;
}

// ------------------------------------------------------------- district seed

/**
 * Everything one district's world needs, generated from its own rng stream.
 * Pure: it takes no client and touches no database, so the shape of a
 * district can be reasoned about (and dry-run counted) on its own.
 */
function planDistrict(district, { users: userCount, base }, now) {
  const rng = rngFor(`pati-showcase/${district.key}`);
  const prefix = emailPrefix(district);

  // --- people
  const users = [];
  for (let i = 1; i <= userCount; i += 1) {
    users.push({
      index: i,
      name: fullName(rng),
      email: `${prefix}${i}@${EMAIL_DOMAIN}`,
      avatar: `${AVATAR_PREFIX}${pick(rng, AVATAR_KEYS)}`,
      createdAt: momentDaysAgo(rng, int(rng, HISTORY_DAYS, HISTORY_DAYS + 15), now),
      // How much of the month this person is active for. The mix is what
      // makes a leaderboard worth looking at: a flat world has no top ten.
      profile: rng() < 0.12 ? 'devoted' : rng() < 0.45 ? 'regular' : 'casual',
    });
  }

  // --- animals + their single photo
  const animals = [];
  for (const user of users) {
    for (let a = 0; a < ANIMALS_PER_USER; a += 1) {
      const species = chance(rng, 0.65) ? 'cat' : 'dog';
      const breed = pick(rng, species === 'cat' ? CAT_PATTERNS : DOG_PATTERNS);
      const fixed = fixedColorFor(species, breed);
      const choices = colorsFor(species, breed);
      const spot = nearby(rng, district, 140);
      const createdAt = new Date(
        user.createdAt.getTime() + int(rng, 1, 6 * 24) * MS_HOUR + int(rng, 0, 59) * 60_000
      );
      animals.push({
        owner: user,
        species,
        breed,
        color: fixed ?? (choices.length > 0 ? pick(rng, choices) : null),
        name: animalName(rng, species),
        markings: chance(rng, 0.35) ? pick(rng, MARKINGS) : null,
        spot,
        createdAt: noLaterThan(createdAt, now),
        photoUrl: `${base}/demo/animals/${demoPhotoFile(species, breed)}`,
      });
    }
  }

  // --- care actions: the month of activity behind the map and the badges
  const care = [];
  const DAYS_ACTIVE = { casual: [3, 8], regular: [10, 20], devoted: [21, 30] };
  for (const user of users) {
    const mine = animals.filter((a) => a.owner === user);
    const [minDays, maxDays] = DAYS_ACTIVE[user.profile];
    const activeDays = int(rng, minDays, maxDays);
    // Devoted and regular users keep a run of consecutive days (that is
    // what the streak badges measure); casual ones scatter.
    const streaky = user.profile !== 'casual';
    const startDay = streaky ? int(rng, activeDays - 1, HISTORY_DAYS - 1) : 0;
    const days = streaky
      ? Array.from({ length: activeDays }, (_, k) => startDay - k)
      : pickMany(
          rng,
          Array.from({ length: HISTORY_DAYS }, (_, k) => k),
          activeDays
        );
    for (const day of days) {
      if (day < 0 || day >= HISTORY_DAYS) continue;
      const drops = user.profile === 'devoted' ? int(rng, 1, 3) : int(rng, 1, 2);
      for (let d = 0; d < drops; d += 1) {
        const anchor = mine.length > 0 && chance(rng, 0.7) ? pick(rng, mine).spot : null;
        const type = chance(rng, 0.6) ? 'food' : 'water';
        care.push({
          user,
          type,
          at: momentDaysAgo(rng, day, now),
          point: anchor ? jitter(rng, anchor, 70) : nearby(rng, district, 220),
          photo: carePhoto(base, type),
        });
      }
    }
  }

  // --- the fresh slice: rings the map can still draw when someone looks
  // Roughly doubled after the QA pass found a street-level viewport with a
  // single ring: a newcomer who opens the map on a seeded neighbourhood
  // should find the feature, not hunt for it.
  for (const user of pickMany(rng, users, Math.min(users.length, int(rng, 14, 22)))) {
    const mine = animals.filter((a) => a.owner === user);
    for (let k = 0; k < int(rng, 1, 3); k += 1) {
      const type = chance(rng, 0.55) ? 'food' : 'water';
      care.push({
        user,
        type,
        at: new Date(now.getTime() - rng() * FRESH_HOURS[type] * MS_HOUR),
        point: mine.length > 0 ? jitter(rng, pick(rng, mine).spot, 60) : nearby(rng, district, 150),
        photo: carePhoto(base, type),
        fresh: true,
      });
    }
  }

  // --- who watches which animal (also the notification recipients)
  const carers = animals.map((a) => ({ animal: a, user: a.owner, at: a.createdAt }));
  const followers = [];
  for (const animal of animals) {
    for (const user of pickMany(rng, users, chance(rng, 0.45) ? int(rng, 1, 3) : 0)) {
      if (user === animal.owner) continue;
      followers.push({
        animal,
        user,
        at: noLaterThan(new Date(animal.createdAt.getTime() + int(rng, 1, 20 * 24) * MS_HOUR), now),
      });
    }
  }

  // --- talk on the animal profiles
  const comments = [];
  for (const animal of animals) {
    if (!chance(rng, 0.45)) continue;
    for (const author of pickMany(rng, users, int(rng, 1, 3))) {
      if (author === animal.owner && chance(rng, 0.7)) continue;
      comments.push({
        animal,
        author,
        body: animalComment(rng, { animal: animal.name }),
        at: noLaterThan(new Date(animal.createdAt.getTime() + int(rng, 2, 25 * 24) * MS_HOUR), now),
      });
    }
  }

  // --- health and vaccination records
  const health = [];
  for (const animal of animals) {
    if (!chance(rng, 0.08)) continue;
    const recordType = chance(rng, 0.55) ? 'illness' : 'injury';
    const recordedAt = noLaterThan(
      new Date(animal.createdAt.getTime() + int(rng, 1, 24 * 24) * MS_HOUR),
      now
    );
    const recovered = chance(rng, 0.5);
    health.push({
      animal,
      recordType,
      description: pick(rng, recordType === 'illness' ? ILLNESSES : INJURIES),
      recordedBy: chance(rng, 0.7) ? animal.owner : pick(rng, users),
      recordedAt,
      // A stray only counts as recovered once the days have actually
      // passed, so a record made last week cannot already be closed.
      recoveredAt:
        recovered && recordedAt.getTime() + 3 * MS_DAY <= now.getTime()
          ? noLaterThan(new Date(recordedAt.getTime() + int(rng, 3, 14) * MS_DAY), now)
          : null,
      vetVerified: chance(rng, 0.25),
      followUps: chance(rng, 0.6) ? int(rng, 1, 2) : 0,
    });
  }
  const vaccinations = [];
  for (const animal of animals) {
    if (!chance(rng, 0.15)) continue;
    const administeredAt = noLaterThan(
      new Date(animal.createdAt.getTime() + int(rng, 1, 25 * 24) * MS_HOUR),
      now
    );
    vaccinations.push({
      animal,
      vaccineType: pick(rng, VACCINE_TYPES),
      note: pick(rng, VACCINE_NOTES),
      vetVerified: chance(rng, 0.6),
      administeredAt,
      // Left NULL often on purpose: nobody can promise a stray's next dose
      // (001_init.sql says so), and inventing one would be fake data.
      nextDueAt: chance(rng, 0.45) ? new Date(administeredAt.getTime() + 365 * MS_DAY) : null,
      recordedBy: chance(rng, 0.75) ? animal.owner : pick(rng, users),
    });
  }

  // --- friendships inside the district: a ring plus random chords, so
  //     everybody has someone and a few people have many.
  const pairs = new Map();
  const addPair = (a, b) => {
    if (a === b) return;
    const [lo, hi] = a.index < b.index ? [a, b] : [b, a];
    const key = `${lo.index}:${hi.index}`;
    if (pairs.has(key)) return;
    pairs.set(key, {
      requester: lo,
      addressee: hi,
      status: chance(rng, 0.9) ? 'accepted' : 'pending',
      at: momentDaysAgo(rng, int(rng, 1, HISTORY_DAYS), now),
    });
  };
  for (let i = 0; i < users.length; i += 1) {
    addPair(users[i], users[(i + 1) % users.length]);
    for (let k = 0; k < int(rng, 0, 6); k += 1) addPair(users[i], pick(rng, users));
  }
  const friendships = [...pairs.values()];

  // --- one-to-one chats on top of some of those friendships
  const directs = [];
  for (const friendship of friendships) {
    if (friendship.status !== 'accepted' || !chance(rng, 0.15)) continue;
    const script = pick(rng, DM_TOPICS);
    const lines = script.slice(0, int(rng, 3, script.length));
    let at = noLaterThan(new Date(friendship.at.getTime() + int(rng, 1, 10) * MS_HOUR), now);
    const messages = lines.map((body, i) => {
      at = noLaterThan(new Date(at.getTime() + int(rng, 2, 220) * 60_000), now);
      return { body, sender: i % 2 === 0 ? friendship.requester : friendship.addressee, at };
    });
    directs.push({ a: friendship.requester, b: friendship.addressee, messages });
  }

  // --- the district's group
  const groupMembers = pickMany(rng, users, Math.min(users.length, int(rng, 14, 26)));
  const groupCreatedAt = momentDaysAgo(rng, int(rng, 20, HISTORY_DAYS), now);
  let groupAt = groupCreatedAt;
  // The creator opens the group; the rest is the shuffled pool, so the
  // inbox preview is never a month-old "gruba yeni katıldım" (QA finding).
  const groupMessages = [
    { body: GROUP_OPENING, sender: groupMembers[0], at: groupCreatedAt },
    ...pickMany(rng, GROUP_LINES, int(rng, 12, 20)).map((body) => {
      groupAt = noLaterThan(new Date(groupAt.getTime() + int(rng, 30, 40 * 60) * 60_000), now);
      return { body, sender: pick(rng, groupMembers), at: groupAt };
    }),
  ];
  const group = {
    name: `${district.district} ${pick(rng, GROUP_SUFFIXES)}`,
    createdBy: groupMembers[0],
    members: groupMembers.map((user, i) => ({
      user,
      role: i < int(rng, 2, 3) ? 'admin' : 'member',
      at: noLaterThan(new Date(groupCreatedAt.getTime() + i * int(rng, 10, 300) * 60_000), now),
    })),
    createdAt: groupCreatedAt,
    messages: groupMessages,
  };

  return {
    district,
    rng,
    users,
    animals,
    care,
    carers,
    followers,
    comments,
    health,
    vaccinations,
    friendships,
    directs,
    group,
  };
}

// --------------------------------------------------------------- district write

const DEMO = true;

async function writeDistrict(client, plan, passwordHash, now) {
  const { rng } = plan;
  const counts = {};
  const bump = (table, n) => {
    counts[table] = (counts[table] ?? 0) + n;
  };

  const userRows = await insertRows(
    client,
    'users',
    ['name', 'email', 'password_hash', 'avatar_url', 'created_at', 'is_demo'],
    plan.users.map((u) => [u.name, u.email, passwordHash, u.avatar, u.createdAt, DEMO]),
    { conflict: 'ON CONFLICT (email) DO NOTHING', returning: 'id, email' }
  );
  if (userRows.length !== plan.users.length) {
    throw new Error(
      `${plan.district.key}: ${plan.users.length - userRows.length} demo accounts already exist`
    );
  }
  const idByEmail = new Map(userRows.map((r) => [r.email, r.id]));
  for (const user of plan.users) user.id = idByEmail.get(user.email);
  bump('users', userRows.length);

  const animalRows = await insertRows(
    client,
    'animals',
    [
      'species',
      'name',
      'color',
      'breed',
      'markings',
      { name: 'location', tpl: POINT.tpl },
      'location_updated_at',
      'created_by',
      'created_at',
      'is_demo',
    ],
    plan.animals.map((a) => [
      a.species,
      a.name,
      a.color,
      a.breed,
      a.markings,
      a.spot.lng,
      a.spot.lat,
      a.createdAt,
      a.owner.id,
      a.createdAt,
      DEMO,
    ]),
    { returning: 'id, created_at' }
  );
  assignIds(
    `${plan.district.key} animals`,
    plan.animals,
    animalRows,
    (a) => a.createdAt,
    'created_at'
  );
  bump('animals', animalRows.length);

  bump(
    'animal_photos',
    (
      await insertRows(
        client,
        'animal_photos',
        ['animal_id', 'url', 'uploaded_by', 'created_at', 'is_demo'],
        plan.animals.map((a) => [
          a.id,
          a.photoUrl,
          a.owner.id,
          noLaterThan(new Date(a.createdAt.getTime() + int(rng, 1, 40) * 60_000), now),
          DEMO,
        ]),
        { returning: 'id' }
      )
    ).length
  );

  bump(
    'care_actions',
    (
      await insertRows(
        client,
        'care_actions',
        [
          { name: 'location', tpl: POINT.tpl },
          'user_id',
          'action_type',
          'photo_url',
          'created_at',
          'is_demo',
        ],
        plan.care.map((c) => [c.point.lng, c.point.lat, c.user.id, c.type, c.photo, c.at, DEMO]),
        { returning: 'id' }
      )
    ).length
  );

  bump(
    'user_animal_care',
    (
      await insertRows(
        client,
        'user_animal_care',
        ['user_id', 'animal_id', 'created_at', 'is_demo'],
        plan.carers.map((c) => [c.user.id, c.animal.id, c.at, DEMO]),
        { conflict: 'ON CONFLICT DO NOTHING', returning: 'user_id' }
      )
    ).length
  );
  bump(
    'animal_followers',
    (
      await insertRows(
        client,
        'animal_followers',
        ['animal_id', 'user_id', 'created_at', 'is_demo'],
        plan.followers.map((f) => [f.animal.id, f.user.id, f.at, DEMO]),
        { conflict: 'ON CONFLICT DO NOTHING', returning: 'user_id' }
      )
    ).length
  );

  const healthRows = await insertRows(
    client,
    'health_records',
    [
      'animal_id',
      'record_type',
      'description',
      'vet_verified',
      'recorded_by',
      'recorded_at',
      'recovered_at',
      'recovered_by',
      'is_demo',
    ],
    plan.health.map((h) => [
      h.animal.id,
      h.recordType,
      h.description,
      h.vetVerified,
      h.recordedBy.id,
      h.recordedAt,
      h.recoveredAt,
      h.recoveredAt ? h.recordedBy.id : null,
      DEMO,
    ]),
    { returning: 'id, recorded_at' }
  );
  assignIds(
    `${plan.district.key} health_records`,
    plan.health,
    healthRows,
    (h) => h.recordedAt,
    'recorded_at'
  );
  bump('health_records', healthRows.length);

  bump(
    'vaccinations',
    (
      await insertRows(
        client,
        'vaccinations',
        [
          'animal_id',
          'vaccine_type',
          'note',
          'vet_verified',
          'administered_at',
          'next_due_at',
          'recorded_by',
          'recorded_at',
          'is_demo',
        ],
        plan.vaccinations.map((v) => [
          v.animal.id,
          v.vaccineType,
          v.note,
          v.vetVerified,
          v.administeredAt,
          v.nextDueAt,
          v.recordedBy.id,
          v.administeredAt,
          DEMO,
        ]),
        { returning: 'id' }
      )
    ).length
  );

  // Free comments, plus the follow-ups hanging off a health record (that
  // attachment is what the app reads as "treatment started").
  const commentRows = [
    ...plan.comments.map((c) => ({
      animalId: c.animal.id,
      userId: c.author.id,
      healthRecordId: null,
      body: c.body,
      at: c.at,
      animal: c.animal,
      actor: c.author,
    })),
    ...plan.health.flatMap((h) =>
      Array.from({ length: h.followUps }, (_, k) => ({
        animalId: h.animal.id,
        userId: h.recordedBy.id,
        healthRecordId: h.id,
        body: healthComment(rng),
        at: noLaterThan(new Date(h.recordedAt.getTime() + (k + 1) * int(rng, 6, 72) * MS_HOUR), now),
        animal: h.animal,
        actor: h.recordedBy,
      }))
    ),
  ];
  bump(
    'animal_comments',
    (
      await insertRows(
        client,
        'animal_comments',
        ['animal_id', 'user_id', 'health_record_id', 'body', 'created_at', 'is_demo'],
        commentRows.map((c) => [c.animalId, c.userId, c.healthRecordId, c.body, c.at, DEMO]),
        { returning: 'id' }
      )
    ).length
  );

  // The inbox. Recipients are an animal's carers and followers minus the
  // actor — the same rule notification.controller.js applies.
  const watchers = new Map();
  for (const c of plan.carers) {
    if (!watchers.has(c.animal.id)) watchers.set(c.animal.id, new Set());
    watchers.get(c.animal.id).add(c.user.id);
  }
  for (const f of plan.followers) watchers.get(f.animal.id)?.add(f.user.id);
  const notifications = [];
  const addNotification = (animal, kind, actorId, actorName, text, at) => {
    for (const userId of watchers.get(animal.id) ?? []) {
      if (userId === actorId) continue;
      notifications.push([
        userId,
        kind,
        animal.id,
        actorId,
        JSON.stringify({
          animalName: animal.name,
          species: animal.species,
          actorName,
          text: text ?? null,
        }),
        // Older news has been read; the last few days keep the bell lit.
        at.getTime() < now.getTime() - 4 * MS_DAY ? at : null,
        at,
        DEMO,
      ]);
    }
  };
  for (const c of commentRows)
    addNotification(c.animal, 'comment', c.userId, c.actor.name, c.body, c.at);
  for (const h of plan.health)
    addNotification(
      h.animal,
      'health_record',
      h.recordedBy.id,
      h.recordedBy.name,
      h.description,
      h.recordedAt
    );
  for (const v of plan.vaccinations)
    addNotification(
      v.animal,
      'vaccination',
      v.recordedBy.id,
      v.recordedBy.name,
      v.vaccineType,
      v.administeredAt
    );
  bump(
    'notifications',
    (
      await insertRows(
        client,
        'notifications',
        [
          'user_id',
          'kind',
          'animal_id',
          'actor_id',
          { name: 'payload', tpl: '?::jsonb' },
          'read_at',
          'created_at',
          'is_demo',
        ],
        notifications,
        { returning: 'id' }
      )
    ).length
  );

  bump(
    'friendships',
    (
      await insertRows(
        client,
        'friendships',
        ['requester_id', 'addressee_id', 'status', 'created_at', 'responded_at', 'is_demo'],
        plan.friendships.map((f) => [
          f.requester.id,
          f.addressee.id,
          f.status,
          f.at,
          f.status === 'accepted'
            ? noLaterThan(new Date(f.at.getTime() + int(rng, 5, 40) * MS_HOUR), now)
            : null,
          DEMO,
        ]),
        { conflict: 'ON CONFLICT (requester_id, addressee_id) DO NOTHING', returning: 'id' }
      )
    ).length
  );

  await writeConversations(client, plan, bump);
  return counts;
}

/** The district's DMs and its one group, with members and messages. */
async function writeConversations(client, plan, bump) {
  const conversations = [
    ...plan.directs.map((d) => ({
      kind: 'direct',
      name: null,
      createdBy: d.a.id,
      // The same key message.controller.js computes, so a demo pair and a
      // real "mesaj gönder" land on one row instead of forking.
      directKey: `${Math.min(d.a.id, d.b.id)}:${Math.max(d.a.id, d.b.id)}`,
      createdAt: d.messages[0].at,
      lastMessageAt: d.messages[d.messages.length - 1].at,
      members: [
        { user: d.a, role: 'member', at: d.messages[0].at },
        { user: d.b, role: 'member', at: d.messages[0].at },
      ],
      messages: d.messages,
    })),
    {
      kind: 'group',
      name: plan.group.name,
      createdBy: plan.group.createdBy.id,
      directKey: null,
      createdAt: plan.group.createdAt,
      lastMessageAt: plan.group.messages[plan.group.messages.length - 1].at,
      members: plan.group.members,
      messages: plan.group.messages,
    },
  ];

  const rows = await insertRows(
    client,
    'conversations',
    ['kind', 'name', 'created_by', 'direct_key', 'created_at', 'last_message_at', 'is_demo'],
    conversations.map((c) => [
      c.kind,
      c.name,
      c.createdBy,
      c.directKey,
      c.createdAt,
      c.lastMessageAt,
      DEMO,
    ]),
    { returning: 'id, created_at' }
  );
  assignIds(
    `${plan.district.key} conversations`,
    conversations,
    rows,
    (c) => c.createdAt,
    'created_at'
  );
  bump('conversations', rows.length);

  bump(
    'conversation_members',
    (
      await insertRows(
        client,
        'conversation_members',
        ['conversation_id', 'user_id', 'role', 'joined_at', 'last_read_at', 'is_demo'],
        conversations.flatMap((c) =>
          c.members.map((m) => [c.id, m.user.id, m.role, m.at, c.lastMessageAt, DEMO])
        ),
        { conflict: 'ON CONFLICT DO NOTHING', returning: 'user_id' }
      )
    ).length
  );

  bump(
    'messages',
    (
      await insertRows(
        client,
        'messages',
        ['conversation_id', 'sender_id', 'body', 'created_at', 'is_demo'],
        conversations.flatMap((c) =>
          c.messages.map((m) => [c.id, m.sender.id, m.body, m.at, DEMO])
        ),
        { returning: 'id' }
      )
    ).length
  );
}

/**
 * Friendships across district lines, added once every district exists: a
 * world where nobody knows anyone one neighbourhood over looks generated.
 * Neighbouring means "the next district of the same city in the seeding
 * order" — the file carries no adjacency, and the alternative (real
 * borders) buys nothing a demo can show.
 */
async function linkNeighbouringDistricts(client, plans, now) {
  const rows = [];
  const byCity = new Map();
  for (const plan of plans) {
    if (!byCity.has(plan.district.city)) byCity.set(plan.district.city, []);
    byCity.get(plan.district.city).push(plan);
  }
  for (const list of byCity.values()) {
    for (let i = 0; i < list.length; i += 1) {
      const here = list[i];
      const there = list[(i + 1) % list.length];
      if (here === there) continue;
      const rng = rngFor(`pati-showcase/link/${here.district.key}`);
      for (let k = 0; k < int(rng, 3, 8); k += 1) {
        const a = pick(rng, here.users);
        const b = pick(rng, there.users);
        if (!a.id || !b.id || a.id === b.id) continue;
        const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        const at = momentDaysAgo(rng, int(rng, 1, HISTORY_DAYS), now);
        rows.push([
          lo,
          hi,
          'accepted',
          at,
          noLaterThan(new Date(at.getTime() + int(rng, 2, 30) * MS_HOUR), now),
          DEMO,
        ]);
      }
    }
  }
  return (
    await insertRows(
      client,
      'friendships',
      ['requester_id', 'addressee_id', 'status', 'created_at', 'responded_at', 'is_demo'],
      rows,
      { conflict: 'ON CONFLICT (requester_id, addressee_id) DO NOTHING', returning: 'id' }
    )
  ).length;
}

// ------------------------------------------------------------------- badges

/**
 * Runs the app's own badge sync for the demo users, so the leaderboard
 * reflects the activity that was just written instead of showing everyone
 * at zero.
 *
 * One deliberate deviation: syncBadgeAwards asks getUserRank for the rank at
 * the moment a badge is earned, and getUserRank recomputes the entire
 * leaderboard. Two thousand full leaderboard computations would take hours,
 * so the rank is computed once and served from a snapshot for the length of
 * this phase. For a bulk backfill that is also the more truthful number:
 * the demo users' activity was not really interleaved, and the order the
 * script happens to walk them in is not a ranking event.
 *
 * A consequence worth knowing when reading a demo profile: every badge a
 * demo user has was earned inside one syncBadgeAwards call, so they all
 * share points_before = 0 and the same points_after and rank_after. The
 * award history reads as one big jump rather than a climb. Real users, who
 * earn badges one action at a time, are unaffected.
 */
async function syncDemoBadges(userIds, { onProgress }) {
  const leaderboard = require('../src/controllers/leaderboard.controller');
  const realGetUserRank = leaderboard.getUserRank;
  const rows = await leaderboard.computeLeaderboard();
  const snapshot = new Map(
    rows.map((r) => [r.id, { rank: r.rank, points: r.points, totalUsers: rows.length }])
  );
  // badgeAwards.js resolves the controller lazily (a require inside the
  // function), so it picks this up.
  leaderboard.getUserRank = async (userId) => snapshot.get(userId) ?? null;

  let awarded = 0;
  try {
    const CONCURRENCY = 8;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < userIds.length) {
          const index = cursor;
          cursor += 1;
          // Not `awarded += await …`: that reads `awarded` before the await
          // and writes it back after, so eight workers lose each other's
          // updates (the first run under-reported 1959 of 15762 awards).
          const n = (await syncBadgeAwards(userIds[index])).length;
          awarded += n;
          if ((index + 1) % 250 === 0) onProgress(index + 1);
        }
      })
    );
  } finally {
    leaderboard.getUserRank = realGetUserRank;
  }
  return awarded;
}

// ------------------------------------------------------------------- remove

// Children before parents. Most of these would cascade from `users`, but
// deleting them by hand is what makes the per-table counts reportable — and
// animals, care_actions, health_records and vaccinations reference users
// with no ON DELETE at all, so they have to go first regardless.
const REMOVE_ORDER = [
  'messages',
  'conversation_members',
  'conversations',
  'notifications',
  'friendships',
  'animal_comments',
  'vaccinations',
  'health_records',
  'animal_photos',
  'care_actions',
  'animal_followers',
  'user_animal_care',
  'animals',
  'users',
];

/**
 * Rows a real user attached to demo content. Deleting a demo animal
 * cascades them, so they are counted and shown before anything is removed
 * — silently eating a real volunteer's comment would be the worst possible
 * outcome of a cleanup script.
 */
async function realCollateral(client) {
  const checks = [
    [
      'animal_comments',
      'SELECT count(*)::int AS n FROM animal_comments c JOIN animals a ON a.id = c.animal_id WHERE a.is_demo AND NOT c.is_demo',
    ],
    [
      'animal_photos',
      'SELECT count(*)::int AS n FROM animal_photos p JOIN animals a ON a.id = p.animal_id WHERE a.is_demo AND NOT p.is_demo',
    ],
    [
      'health_records',
      'SELECT count(*)::int AS n FROM health_records h JOIN animals a ON a.id = h.animal_id WHERE a.is_demo AND NOT h.is_demo',
    ],
    [
      'vaccinations',
      'SELECT count(*)::int AS n FROM vaccinations v JOIN animals a ON a.id = v.animal_id WHERE a.is_demo AND NOT v.is_demo',
    ],
    [
      'user_animal_care',
      'SELECT count(*)::int AS n FROM user_animal_care c JOIN animals a ON a.id = c.animal_id WHERE a.is_demo AND NOT c.is_demo',
    ],
    [
      'animal_followers',
      'SELECT count(*)::int AS n FROM animal_followers f JOIN animals a ON a.id = f.animal_id WHERE a.is_demo AND NOT f.is_demo',
    ],
    [
      'messages',
      'SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.is_demo AND NOT m.is_demo',
    ],
    [
      'animal_photo_likes',
      `SELECT count(*)::int AS n FROM animal_photo_likes l
         JOIN animal_photos p ON p.id = l.photo_id
         JOIN users u ON u.id = l.user_id
        WHERE p.is_demo AND NOT u.is_demo`,
    ],
    // These hang off a demo USER rather than a demo animal, and they carry
    // no is_demo flag of their own, so nothing else would ever count them.
    // notifications.actor_id is ON DELETE SET NULL (the row survives with a
    // blank actor); the rest cascade away entirely.
    [
      'friendships (real <-> demo)',
      `SELECT count(*)::int AS n FROM friendships f
         JOIN users a ON a.id = f.requester_id JOIN users b ON b.id = f.addressee_id
        WHERE NOT f.is_demo AND (a.is_demo OR b.is_demo)`,
    ],
    [
      'notifications (real user)',
      `SELECT count(*)::int AS n FROM notifications n
         JOIN users u ON u.id = n.user_id
        WHERE NOT n.is_demo AND NOT u.is_demo
          AND (n.animal_id IN (SELECT id FROM animals WHERE is_demo)
               OR n.actor_id IN (SELECT id FROM users WHERE is_demo))`,
    ],
    [
      'conversation_members (real user)',
      `SELECT count(*)::int AS n FROM conversation_members m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN users u ON u.id = m.user_id
        WHERE c.is_demo AND NOT u.is_demo`,
    ],
    [
      'animal_match_attempts',
      `SELECT count(*)::int AS n FROM animal_match_attempts m
         JOIN animals a ON a.id = m.animal_id WHERE a.is_demo`,
    ],
    // content_reports has no foreign key by design (001_init.sql: the trail
    // must survive its target), so these are not deleted — they are left in
    // the moderation queue pointing at a row that no longer exists. Counted
    // so whoever runs --remove knows to close them.
    [
      'content_reports (left orphaned)',
      `SELECT count(*)::int AS n FROM content_reports r
        WHERE r.status = 'open'
          AND ((r.target_type = 'animal' AND r.target_id IN (SELECT id FROM animals WHERE is_demo))
            OR (r.target_type = 'user' AND r.target_id IN (SELECT id FROM users WHERE is_demo))
            OR (r.target_type = 'comment' AND r.target_id IN (SELECT id FROM animal_comments WHERE is_demo))
            OR (r.target_type = 'care_action' AND r.target_id IN (SELECT id FROM care_actions WHERE is_demo))
            OR (r.target_type = 'message' AND r.target_id IN (SELECT id FROM messages WHERE is_demo)))`,
    ],
  ];
  const found = [];
  for (const [table, sql] of checks) {
    const n = (await client.query(sql)).rows[0].n;
    if (n > 0) found.push({ table, n });
  }
  return found;
}

/**
 * Deletes every demo row. REFUSES if a real user has attached anything to
 * the demo world, because those rows cascade away with it and no flag marks
 * them: printing the number and deleting anyway is how a volunteer's
 * comments and friendships get destroyed by a one-word command. `--force`
 * is the deliberate override, and it has to be typed.
 */
async function removeDemo(client, { force, dryRun }) {
  const collateral = await realCollateral(client);
  if (collateral.length > 0) {
    console.log('\n  real rows attached to the demo world (they cascade with it):');
    for (const c of collateral) console.log(`    ${c.table.padEnd(32)} ${c.n}`);
    if (!force && !dryRun) {
      throw new Error(
        `refusing to delete: ${collateral.reduce((a, c) => a + c.n, 0)} real rows would go with` +
          ' the demo world. Re-run with --force once that is what you want.'
      );
    }
    console.log(
      dryRun
        ? '  --dry-run: counting them, deleting nothing. A real run needs --force.'
        : '  --force given: deleting them too.'
    );
  }
  const counts = {};
  // user_badge_awards has no is_demo of its own — a badge belongs to the
  // user, and it would cascade — but it is deleted explicitly so the count
  // shows up in the report.
  const awards = await client.query(
    'DELETE FROM user_badge_awards a USING users u WHERE u.id = a.user_id AND u.is_demo'
  );
  counts.user_badge_awards = awards.rowCount;
  for (const table of REMOVE_ORDER) {
    counts[table] = (await client.query(`DELETE FROM ${table} WHERE is_demo`)).rowCount;
  }
  return counts;
}

// --------------------------------------------------------------------- main

function report(title, counts) {
  console.log(`\n${title}`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(22)} ${String(n).padStart(8)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(total).padStart(8)}`);
}

/**
 * Refuses to write until `--base` actually serves the demo photos.
 *
 * The URL is stored in every animal_photos row and every care_actions row,
 * not computed at read time — so seeding against a base that does not serve
 * demo-assets/ at /demo bakes tens of thousands of 404s into production, and
 * mounting the route afterwards only rescues them if the path matches to the
 * character. One request is a cheap way to find that out first.
 */
async function checkPhotosAreServed(base) {
  // One URL from each family: the animal faces and the two bowls live in
  // different directories, so a mount that serves one may still miss the
  // other.
  const urls = [
    `${base}/demo/animals/${demoPhotoFile('cat', CAT_PATTERNS[0])}`,
    carePhoto(base, 'food'),
    carePhoto(base, 'water'),
  ];
  for (const url of urls) {
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } catch (err) {
      throw new Error(
        `${url} is unreachable (${err.message}).\n` +
          '  The demo photos must be served before their URLs are stored. Start the\n' +
          '  backend, or pass --skip-photo-check if you know what you are doing.'
      );
    }
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) {
      throw new Error(
        `${url} answered ${res.status} ${type}`.trim() +
          '\n  demo-assets/ is not served at /demo on this origin, so every photo URL\n' +
          '  this run would store is dead. Land the static mount first, or pass\n' +
          '  --skip-photo-check.'
      );
    }
  }
  console.log(`  photos verified: ${urls.length} URLs under ${base}/demo/`);
}

/**
 * The resume path. The badge phase runs after every district has committed
 * and is not itself transactional, so a dropped `fly ssh console` session
 * leaves some demo users without their badges — and a plain rerun skips
 * every district as "already seeded" and so never reaches the badge code.
 */
async function badgesOnly({ dryRun }) {
  const ids = (await pool.query('SELECT id FROM users WHERE is_demo ORDER BY id')).rows.map(
    (r) => r.id
  );
  if (ids.length === 0) {
    console.log('no demo users — nothing to sync');
    return;
  }
  // syncBadgeAwards writes through the app's own pool, one small transaction
  // per user; there is no single transaction to roll back here. Rather than
  // let --dry-run quietly perform the one thing it promises not to do, this
  // combination reports and stops.
  if (dryRun) {
    console.log(`would sync badges for ${ids.length} demo users (--dry-run: nothing written)`);
    return;
  }
  const startedAt = Date.now();
  process.stdout.write(`badge sync: ${ids.length} demo users`);
  const awarded = await syncDemoBadges(ids, {
    onProgress: (n) => process.stdout.write(` ${n}…`),
  });
  console.log(`\n  ${awarded} badge awards in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
    return;
  }
  const startedAt = Date.now();

  if (flags.remove) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const counts = await removeDemo(client, { force: flags.force, dryRun: flags.dryRun });
      await client.query(flags.dryRun ? 'ROLLBACK' : 'COMMIT');
      report(flags.dryRun ? 'would delete (rolled back)' : 'deleted', counts);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    console.log(`\ndone in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
    return;
  }

  if (flags.badgesOnly) {
    await badgesOnly({ dryRun: flags.dryRun });
    console.log(`\ndone in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
    return;
  }

  const districts = selectDistricts(loadDistricts(), flags.districts);
  const now = new Date();
  console.log(
    `showcase seed: ${districts.length} districts x ${flags.users} users x ${ANIMALS_PER_USER} animals` +
      `\n  photos: ${flags.base}/demo/animals/` +
      (flags.dryRun ? '\n  DRY RUN — every transaction is rolled back' : '')
  );

  if (flags.skipPhotoCheck) console.log('  photo check skipped (--skip-photo-check)');
  else await checkPhotosAreServed(flags.base);

  // One hash for every demo account: bcrypt is deliberately slow and 2200
  // hashes of the same throwaway password would cost minutes for nothing.
  // The password is random per run and printed nowhere — these accounts are
  // not meant to be signed into; the admin panel is how you inspect them.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

  const totals = {};
  const plans = [];
  let skipped = 0;
  let skippedUsers = 0;

  for (const district of districts) {
    const prefix = emailPrefix(district);
    const existing = (
      await pool.query('SELECT count(*)::int AS n FROM users WHERE is_demo AND email LIKE $1', [
        `${prefix}%@${EMAIL_DOMAIN}`,
      ])
    ).rows[0].n;
    if (existing >= flags.users) {
      skipped += 1;
      skippedUsers += existing;
      continue;
    }
    if (existing > 0) {
      console.log(
        `  ! ${district.key}: ${existing} of ${flags.users} accounts exist — skipping.` +
          ' Run --remove first, or keep the --users you seeded with.'
      );
      skipped += 1;
      skippedUsers += existing;
      continue;
    }

    const plan = planDistrict(district, flags, now);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const counts = await writeDistrict(client, plan, passwordHash, now);
      if (flags.dryRun) await client.query('ROLLBACK');
      else await client.query('COMMIT');
      for (const [table, n] of Object.entries(counts)) totals[table] = (totals[table] ?? 0) + n;
      plans.push(plan);
      console.log(
        `  ${district.key.padEnd(26)} ${String(counts.users).padStart(4)} users` +
          ` ${String(counts.animals).padStart(5)} animals` +
          ` ${String(counts.care_actions).padStart(6)} care`
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${district.key}: ${err.message}`);
    } finally {
      client.release();
    }
  }

  if (skipped > 0) {
    console.log(
      `\nalready seeded: ${skipped} districts, ${skippedUsers} demo accounts — left alone.` +
        '\n  Cross-district friendships are only drawn between districts seeded in the' +
        '\n  same run, so an incremental run leaves the old and new sets unlinked.'
    );
  }

  if (plans.length > 0 && !flags.dryRun) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      totals.friendships =
        (totals.friendships ?? 0) + (await linkNeighbouringDistricts(client, plans, now));
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  report(flags.dryRun ? 'would insert (rolled back)' : 'inserted', totals);
  if (flags.dryRun) {
    console.log(
      '  (cross-district friendships and badge awards need committed ids,' +
        ' so they are not in this count)'
    );
  }
  const seedSeconds = (Date.now() - startedAt) / 1000;
  console.log(`\nrows written in ${seedSeconds.toFixed(1)} s`);

  if (plans.length > 0 && !flags.dryRun) {
    const userIds = plans.flatMap((p) => p.users.map((u) => u.id));
    const badgeStart = Date.now();
    process.stdout.write(`badge sync: ${userIds.length} users`);
    const awarded = await syncDemoBadges(userIds, {
      onProgress: (n) => process.stdout.write(` ${n}…`),
    });
    console.log(
      `\n  ${awarded} badge awards in ${((Date.now() - badgeStart) / 1000).toFixed(1)} s`
    );
  }

  console.log(`\ndone in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
}

// Guarded so test/seedShowcase.test.js can require the pure planning and
// SQL-building parts without a database and without seeding anything.
if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      console.error(`\nseed-showcase failed: ${err.message}`);
      console.error(err.stack);
      pool.end();
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  noLaterThan,
  assignIds,
  writeDistrict,
  rngFor,
  insertRows,
  loadDistricts,
  selectDistricts,
  emailPrefix,
  planDistrict,
  momentDaysAgo,
  HISTORY_DAYS,
  FRESH_HOURS,
  ANIMALS_PER_USER,
  REMOVE_ORDER,
};
