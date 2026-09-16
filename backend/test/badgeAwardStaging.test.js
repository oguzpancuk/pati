// Run: node --test backend/test/badgeAwardStaging.test.js. Covers the pure
// chain behind a batch of badges; the insert itself is exercised by the curl
// harness, not here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stagePoints } = require('../src/utils/badgeAwards');

const badge = (points) => ({ points });

test('two badges at once read 0 → 10 and then 10 → 20', () => {
  assert.deepEqual(stagePoints([badge(10), badge(10)], 0, 20), [
    { before: 0, after: 10 },
    { before: 10, after: 20 },
  ]);
});

test('a single badge is the whole jump', () => {
  assert.deepEqual(stagePoints([badge(25)], 40, 65), [{ before: 40, after: 65 }]);
});

test('the chain ends on the real total even when other points moved with it', () => {
  // 3 comment points earned since the snapshot: they ride on the last step,
  // which is the one the profile behind the popup has to agree with.
  const steps = stagePoints([badge(10), badge(30)], 0, 43);
  assert.deepEqual(steps, [
    { before: 0, after: 10 },
    { before: 10, after: 43 },
  ]);
});

test('every step joins the one before it', () => {
  const steps = stagePoints([badge(5), badge(10), badge(20)], 7, 42);
  assert.equal(steps[0].before, 7);
  assert.equal(steps.at(-1).after, 42);
  steps.slice(1).forEach((step, i) => assert.equal(step.before, steps[i].after));
});

test('a stale-low snapshot never makes a middle popup claim more than the total', () => {
  const steps = stagePoints([badge(100), badge(10)], 0, 60);
  assert.deepEqual(steps, [
    { before: 0, after: 60 },
    { before: 60, after: 60 },
  ]);
});

test('no badges, no steps', () => {
  assert.deepEqual(stagePoints([], 0, 0), []);
});
