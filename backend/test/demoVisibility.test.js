/**
 * The showcase (demo) world is per person: `users.show_demo` decides whether
 * the bots' animals, drops, chat and leaderboard entries are part of someone's
 * app (owner, 2026-09-09). These tests pin the two decisions that are easy to
 * flip by accident and expensive to notice — a signed-out visitor sees the
 * showcase, and the SQL fragment is either empty or a plain alias-qualified
 * negation. No database: the preference cache is primed directly, and the
 * anonymous path never reads one.
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
