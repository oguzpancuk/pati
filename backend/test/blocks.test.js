/**
 * The block SQL fragments, pinned with no database (review finding: the
 * feature's only evidence was the curl suite, which the verify battery does
 * not run).
 *
 * What this pins, exactly: the two fragment builders (which are an injection
 * shape held safe by convention, so the guards are what make a careless
 * caller a crash instead of a hole), `hasBlocked`'s call shape, and — the
 * one that guards a real invariant — that the health-record SELECT filters
 * its comment COUNT and its `in_treatment` test on the same viewer.
 *
 * What it does NOT pin, so nobody reads more into it than is here: the
 * placeholder numbering at each call site, `listComments`' renumbering, and
 * the `acceptRequest` guard. Those need a database and live in
 * `scripts/ai-check/checks.sh` section 17, which the verify battery does not
 * run (review round 2 was right that the first version of this docblock
 * claimed the first of them).
 */
const test = require('node:test');
const assert = require('node:assert');

const {
  hasBlocked,
  noBlockEitherWaySql,
  notBlockedByViewerSql,
} = require('../src/utils/blocks');
const { healthRecordSelectSql } = require('../src/controllers/animal.controller');

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

test('a health record filters its count and its status on the same viewer', () => {
  const sql = healthRecordSelectSql('$2');

  // Two subqueries over animal_comments: the count, and the in_treatment test.
  const subqueries = sql.match(/FROM animal_comments c[\s\S]*?\)/g) || [];
  assert.equal(subqueries.length, 2, 'the count and the status both read comments');

  for (const sub of subqueries) {
    assert.match(sub, /b\.blocker_id = \$2/, 'every one filters, on the viewer given');
    assert.match(sub, /b\.blocked_id = c\.user_id/);
  }

  // A different placeholder must reach BOTH of them: filtering only the count
  // is the shape of the defect this guards.
  const other = healthRecordSelectSql('$7');
  assert.equal((other.match(/b\.blocker_id = \$7/g) || []).length, 2);
  assert.equal(other.includes('$2'), false, 'no placeholder left hard-coded');
});
