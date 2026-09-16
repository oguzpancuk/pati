/**
 * The block SQL fragments, pinned with no database (review finding: the
 * feature's only evidence was the curl suite, which the verify battery does
 * not run).
 *
 * Two things are worth a test here. The fragments are built by string
 * interpolation, so they are an injection shape held safe by convention —
 * the guards are what make a careless caller a crash instead of a hole. And
 * `listComments` renumbers its placeholders depending on whether a health
 * record was asked for, which is exactly the kind of edit that silently
 * points a filter at the wrong parameter.
 */
const test = require('node:test');
const assert = require('node:assert');

const {
  hasBlocked,
  noBlockEitherWaySql,
  notBlockedByViewerSql,
} = require('../src/utils/blocks');

test('the fragments start with AND and name both sides', () => {
  const both = noBlockEitherWaySql('$1', 'users.id');
  assert.match(both, /^AND NOT EXISTS/);
  // Either direction: two OR-ed pairs.
  assert.equal((both.match(/blocker_id/g) || []).length, 2);
  assert.equal((both.match(/blocked_id/g) || []).length, 2);
  assert.match(both, /\$1/);
  assert.match(both, /users\.id/);

  const mine = notBlockedByViewerSql('$2', 'c.user_id');
  assert.match(mine, /^AND NOT EXISTS/);
  // One direction only: the viewer is always the blocker.
  assert.equal((mine.match(/blocker_id/g) || []).length, 1);
  assert.match(mine, /b\.blocker_id = \$2/);
  assert.match(mine, /b\.blocked_id = c\.user_id/);
});

test('anything that is not a placeholder or a column name throws', () => {
  for (const bad of ['1', 'x', '$1 OR true', "'$1'", '', '$', '$1;']) {
    assert.throws(() => noBlockEitherWaySql(bad, 'users.id'), TypeError, `placeholder: ${bad}`);
  }
  for (const bad of ['c.user_id; DROP TABLE users', '1=1', "'x'", '', 'a.b.c', 'c.user_id OR 1']) {
    assert.throws(() => notBlockedByViewerSql('$1', bad), TypeError, `column: ${bad}`);
  }
  // And the shapes the real callers pass are accepted.
  assert.ok(noBlockEitherWaySql('$1', 'users.id'));
  assert.ok(noBlockEitherWaySql('$12', 'u.id'));
  assert.ok(notBlockedByViewerSql('$2', 'c.user_id'));
});

test('hasBlocked asks one direction, and never asks about yourself', async () => {
  const asked = [];
  const db = {
    query(sql, params) {
      asked.push({ sql, params });
      return Promise.resolve({ rows: [] });
    },
  };

  assert.equal(await hasBlocked(db, 7, 7), false);
  assert.equal(asked.length, 0, 'your own profile must not cost a query');

  await hasBlocked(db, 7, 9);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0].params, [7, 9], 'blocker first, blocked second');
  assert.match(asked[0].sql, /blocker_id = \$1 AND blocked_id = \$2/);

  const found = { query: () => Promise.resolve({ rows: [{ '?column?': 1 }] }) };
  assert.equal(await hasBlocked(found, 7, 9), true);
});
