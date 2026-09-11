const test = require('node:test');
const assert = require('node:assert');

// The badge rule is counts, not consecutive days (owner, 2026-09-11). These
// pin the two ladders and the property that made "recompute from scratch"
// safe to reason about: a streak of N days implies at least N records, so a
// tier only survives the change when the new threshold is no higher than the
// old streak length.
const { CARE_THRESHOLDS, COUNT_THRESHOLDS, TIER_ORDER, tierFor } = require('../src/utils/badges');

const OLD_STREAK = { bronze: 1, silver: 7, gold: 30, diamond: 365 };

test('the care ladder is the owner’s', () => {
  assert.deepStrictEqual(CARE_THRESHOLDS, { bronze: 1, silver: 10, gold: 50, diamond: 250 });
});

test('registering an animal keeps the shorter ladder', () => {
  assert.deepStrictEqual(COUNT_THRESHOLDS, { bronze: 1, silver: 5, gold: 20, diamond: 100 });
});

test('a tier is reached at its threshold and not one short of it', () => {
  for (const tier of TIER_ORDER) {
    const at = CARE_THRESHOLDS[tier];
    assert.strictEqual(tierFor(at, CARE_THRESHOLDS), tier, `${at} records should be ${tier}`);
    if (at > 1) {
      assert.notStrictEqual(
        tierFor(at - 1, CARE_THRESHOLDS),
        tier,
        `${at - 1} records should not be ${tier}`
      );
    }
  }
});

test('nobody drops a tier on animal registration', () => {
  // Old gold wanted 30 consecutive days, so at least 30 animals; new gold
  // wants 20. Same shape at every tier, so the change can only promote.
  for (const tier of TIER_ORDER) {
    assert.ok(
      COUNT_THRESHOLDS[tier] <= OLD_STREAK[tier],
      `${tier}: ${COUNT_THRESHOLDS[tier]} must be <= ${OLD_STREAK[tier]}`
    );
  }
});

test('food and water CAN drop a tier, and only in the bands we named', () => {
  // This is the honest half: silver used to be reachable with 7 records and
  // now wants 10, gold with 30 and now wants 50. The recompute script reports
  // exactly these people by name before it writes anything.
  const demotable = TIER_ORDER.filter((t) => CARE_THRESHOLDS[t] > OLD_STREAK[t]);
  assert.deepStrictEqual(demotable, ['silver', 'gold']);
  assert.strictEqual(tierFor(7, CARE_THRESHOLDS), 'bronze');
  assert.strictEqual(tierFor(30, CARE_THRESHOLDS), 'silver');
  assert.strictEqual(tierFor(365, CARE_THRESHOLDS), 'diamond');
});
