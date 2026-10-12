/**
 * The showcase (demo) world is per person: `users.show_demo` decides whether
 * the bots' animals and drops appear in someone's map, lists, search and
 * notifications (owner, 2026-09-09; bots are off the leaderboard for
 * everyone, so it needs no filter). These tests pin the two decisions that
 * are easy to flip by accident and expensive to notice — a signed-out visitor
 * sees the showcase, and the SQL fragment is either empty or a plain
 * alias-qualified negation. No database: the preference cache is primed
 * directly, and the anonymous path never reads one.
 *
 * Every case primes the cache first, deliberately: an UNCACHED read would go
 * looking for a database, and pinning the fail-open path that way cost the
 * suite a minute of connection timeout. The fail-open contract (a preference
 * lookup may never fail a request) is exercised by the curl round trip in the
 * commit, not here (review finding).
 */
const test = require('node:test');
const assert = require('node:assert');

const {
  demoFilter,
  showsDemo,
  rememberShowsDemo,
  clearSettingsCache,
} = require('../src/utils/settings');

test('a signed-out visitor sees the showcase world', async () => {
  clearSettingsCache();
  assert.strictEqual(await showsDemo(undefined), true);
  assert.strictEqual(await showsDemo(null), true);
  assert.strictEqual(await demoFilter({}, 'a'), '');
  assert.strictEqual(await demoFilter({ user: {} }, 'a'), '');
});

test('the filter is empty for someone who keeps the showcase on', async () => {
  clearSettingsCache();
  rememberShowsDemo(7, true);
  assert.strictEqual(await demoFilter({ user: { userId: 7 } }, 'care_actions'), '');
});

test('the filter negates is_demo on the given alias when it is off', async () => {
  clearSettingsCache();
  rememberShowsDemo(7, false);
  assert.strictEqual(await demoFilter({ user: { userId: 7 } }, 'a'), ' AND NOT a.is_demo');
  assert.strictEqual(
    await demoFilter({ user: { userId: 7 } }, 'care_actions'),
    ' AND NOT care_actions.is_demo'
  );
});

test('one person switching it off does not change anybody else', async () => {
  clearSettingsCache();
  rememberShowsDemo(7, false);
  rememberShowsDemo(8, true);
  assert.strictEqual(await demoFilter({ user: { userId: 7 } }, 'n'), ' AND NOT n.is_demo');
  assert.strictEqual(await demoFilter({ user: { userId: 8 } }, 'n'), '');
});

test('a fresh choice overrides the one before it, per user', async () => {
  clearSettingsCache();
  rememberShowsDemo(9, false);
  assert.strictEqual(await demoFilter({ user: { userId: 9 } }, 'a'), ' AND NOT a.is_demo');
  rememberShowsDemo(9, true);
  assert.strictEqual(await demoFilter({ user: { userId: 9 } }, 'a'), '');
});

/**
 * The rule this feature kept getting wrong, pinned as a source scan.
 *
 * Six review rounds moved the filter around, and every misplacement produced
 * either a number that disagreed with its list or a card that 404s when
 * tapped. The settled rule — discovery hides, links keep working — is a
 * statement about WHICH call sites exist, so that is what this asserts. A new
 * one is not necessarily wrong; it means somebody is changing the rule and
 * should say so here.
 *
 * A tripwire, not coverage: it counts call sites per file, so moving the
 * filter from one query to another inside the same controller still passes.
 * What it catches is a filter appearing somewhere new, or quietly leaving.
 */
test('demoFilter is applied to the discovery paths, and only those', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..', 'src');

  // settings.js is where demoFilter is defined; its own doc mentions it.
  const found = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const rel = path.relative(root, full);
        if (rel === 'utils/settings.js') continue;
        const hits = (fs.readFileSync(full, 'utf8').match(/demoFilter\(req/g) || []).length;
        if (hits > 0) found.set(rel, hits);
      }
    }
  };
  walk(root);

  assert.deepStrictEqual(
    Object.fromEntries([...found].sort()),
    {
      // the map: the viewport list, the radius list, and the status count
      'controllers/care.controller.js': 3,
      // the animal list (one fragment, two branches) and the match candidates
      'controllers/animal.controller.js': 2,
      // the inbox page, its total, the unread count and mark-read
      'controllers/notification.controller.js': 4,
      // user search
      'controllers/user.controller.js': 1,
    },
    'the set of demo-filtered read paths changed — update the rule in utils/settings.js too'
  );
});

/**
 * Off by default for people (owner, 2026-10-12): a signed-in user whose
 * preference cannot be read — no row, or a failing query — gets the real map,
 * not the showcase. The signed-out visitor above keeps the tour. The pool is
 * stubbed in place, so no database is touched.
 */
test('a signed-in user with no readable preference does not see the showcase', async () => {
  const pool = require('../src/config/db');
  const realQuery = pool.query;
  try {
    clearSettingsCache();
    pool.query = async () => ({ rows: [] });
    assert.strictEqual(await showsDemo(41), false);
    assert.strictEqual(await demoFilter({ user: { userId: 41 } }, 'a'), ' AND NOT a.is_demo');

    clearSettingsCache();
    pool.query = async () => {
      throw new Error('connection refused');
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.strictEqual(await showsDemo(42), false);
    } finally {
      console.warn = warn;
    }
  } finally {
    pool.query = realQuery;
    clearSettingsCache();
  }
});

/**
 * The column default is what a new sign-up gets, and production only learns
 * a new default from a numbered migration (001's CREATE TABLE is a no-op
 * there). Both copies are pinned, plus the one-shot flip of existing rows:
 * the UPDATE must sit behind 019's schema_backfills claim and its RETURN, or
 * every deploy would hide the showcase again from anyone who turned it back
 * on (review finding).
 */
test('show_demo defaults to off in 001 and in the migration production runs', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'migrations');
  const init = fs.readFileSync(path.join(dir, '001_init.sql'), 'utf8');
  assert.match(init, /show_demo BOOLEAN NOT NULL DEFAULT false/);

  const later = fs
    .readdirSync(dir)
    .filter((f) => f > '011' && f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  assert.match(later, /ALTER COLUMN show_demo SET DEFAULT false/);

  const flip = fs.readFileSync(path.join(dir, '019_show_demo_default_off.sql'), 'utf8');
  assert.match(
    flip,
    /INSERT INTO schema_backfills[^;]*'019_show_demo_default_off'[^;]*;[\s\S]*IF claimed = 0 THEN\s+RETURN;\s+END IF;[\s\S]*UPDATE users SET show_demo = false/
  );
  assert.strictEqual(
    (flip.match(/UPDATE users SET show_demo/g) || []).length,
    1,
    'the flip appears once, inside the claimed block'
  );
});
