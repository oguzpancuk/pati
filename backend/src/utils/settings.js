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
const cache = new Map();

async function showsDemo(userId) {
  if (!userId) return true;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const result = await pool.query('SELECT show_demo FROM users WHERE id = $1', [userId]);
    const value = result.rows.length ? result.rows[0].show_demo !== false : true;
    cache.set(userId, { value, at: Date.now() });
    return value;
  } catch {
    // A preference read must never fail a request; the demo world is the
    // default state.
    return hit ? hit.value : true;
  }
}

/** Remember a fresh choice without waiting for the cache to expire. */
function rememberShowsDemo(userId, value) {
  cache.set(userId, { value, at: Date.now() });
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
