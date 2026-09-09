const pool = require('../config/db');

/**
 * The showcase (demo) world is per person: every user has `show_demo` on
 * their row and decides from their own profile whether the bots' animals,
 * records, chat and leaderboard entries are part of their app (owner,
 * 2026-09-09). A signed-out viewer sees the demo world — that is the tour
 * the pilot ships with.
 *
 * The preference is read on nearly every request, so it is cached per user
 * for a few seconds; the profile toggle writes through the cache, so the
 * next screen already reflects the choice.
 */
const CACHE_MS = 5000;
// Bounded on purpose: entries are only ever overwritten, so without a cap the
// map would hold one entry per user id for the process lifetime (review
// finding). Insertion order is Map order, so the oldest key goes first.
const CACHE_MAX = 5000;
const cache = new Map();

// A failing preference read is invisible otherwise: every caller falls back
// to "show the demo world" and nothing says why.
const FAILURE_LOG_MS = 60000;
let lastFailureLoggedAt = 0;

function remember(userId, value) {
  cache.set(userId, { value, at: Date.now() });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

async function showsDemo(userId) {
  if (!userId) return true;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const result = await pool.query('SELECT show_demo FROM users WHERE id = $1', [userId]);
    const value = result.rows.length ? result.rows[0].show_demo !== false : true;
    remember(userId, value);
    return value;
  } catch (err) {
    // A preference read must never fail a request; the demo world is the
    // default state. It is not cached either — but a lasting failure (the
    // column missing because a migration did not run, an exhausted pool)
    // would then re-issue the same query forever in silence, so it is
    // logged once a minute (review finding).
    if (Date.now() - lastFailureLoggedAt > FAILURE_LOG_MS) {
      lastFailureLoggedAt = Date.now();
      console.warn(`[settings] show_demo read failed: ${err?.message ?? err}`);
    }
    return hit ? hit.value : true;
  }
}

/**
 * Remember a fresh choice without waiting for the cache to expire. This
 * reaches only the process that served the write; pati runs one Fly machine
 * (see rateLimit.middleware.js), so today that is every process. The day a
 * second machine appears, the other one keeps the old answer for up to
 * CACHE_MS — visible as a screen that still shows the demo world for a few
 * seconds after the switch.
 */
function rememberShowsDemo(userId, value) {
  remember(userId, value);
}

/**
 * The SQL fragment that hides the demo world from this request's user, or
 * an empty string when they want to see it. `alias` is the table alias the
 * `is_demo` column lives on.
 */
async function demoFilter(req, alias) {
  return (await showsDemo(req?.user?.userId)) ? '' : ` AND NOT ${alias}.is_demo`;
}

/** Only for tests: forget what was read. */
function clearSettingsCache() {
  cache.clear();
}

module.exports = { showsDemo, rememberShowsDemo, demoFilter, clearSettingsCache };
