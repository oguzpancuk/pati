// Run: node --test backend/test/animalBadges.test.js (no runner dependency: node:test ships
// with Node). Covers the pure threshold function behind animal_badges —
// the database sync is exercised by the curl harness, not here.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ANIMAL_BADGES,
  animalBadgeTier,
  tiersUpTo,
  buildAnimalBadgeLadder,
  COUNT_THRESHOLDS,
  COMMENT_THRESHOLDS,
} = require('../src/utils/badges');

test('count-based keys climb bronze/silver/gold/diamond at 1/5/20/100', () => {
  for (const key of ['matched', 'recovered', 'liked', 'followed', 'cared']) {
    assert.equal(animalBadgeTier(key, 0), null, `${key} at 0`);
    assert.equal(animalBadgeTier(key, 1), 'bronze', `${key} at 1`);
    assert.equal(animalBadgeTier(key, 4), 'bronze', `${key} at 4`);
    assert.equal(animalBadgeTier(key, 5), 'silver', `${key} at 5`);
    assert.equal(animalBadgeTier(key, 19), 'silver', `${key} at 19`);
    assert.equal(animalBadgeTier(key, 20), 'gold', `${key} at 20`);
    assert.equal(animalBadgeTier(key, 99), 'gold', `${key} at 99`);
    assert.equal(animalBadgeTier(key, 100), 'diamond', `${key} at 100`);
    assert.equal(animalBadgeTier(key, 5000), 'diamond', `${key} far above`);
  }
});

test('comments use the wider ladder 1/10/50/200', () => {
  assert.equal(animalBadgeTier('commented', 0), null);
  assert.equal(animalBadgeTier('commented', 1), 'bronze');
  assert.equal(animalBadgeTier('commented', 9), 'bronze');
  assert.equal(animalBadgeTier('commented', 10), 'silver');
  assert.equal(animalBadgeTier('commented', 49), 'silver');
  assert.equal(animalBadgeTier('commented', 50), 'gold');
  assert.equal(animalBadgeTier('commented', 199), 'gold');
  assert.equal(animalBadgeTier('commented', 200), 'diamond');
});

test('every key names its ladder from the shared constants', () => {
  assert.deepEqual(ANIMAL_BADGES.commented.thresholds, COMMENT_THRESHOLDS);
  for (const key of ['matched', 'recovered', 'liked', 'followed', 'cared']) {
    assert.deepEqual(ANIMAL_BADGES[key].thresholds, COUNT_THRESHOLDS);
  }
});

test('an unknown key, a negative or non-numeric count earn nothing', () => {
  assert.equal(animalBadgeTier('nope', 50), null);
  assert.equal(animalBadgeTier('liked', -3), null);
  assert.equal(animalBadgeTier('liked', 'many'), null);
  assert.equal(animalBadgeTier('liked', undefined), null);
});

test('tiersUpTo lists the ladder up to the reached tier, for the inserts', () => {
  assert.deepEqual(tiersUpTo(null), []);
  assert.deepEqual(tiersUpTo('bronze'), ['bronze']);
  assert.deepEqual(tiersUpTo('gold'), ['bronze', 'silver', 'gold']);
  assert.deepEqual(tiersUpTo('diamond'), ['bronze', 'silver', 'gold', 'diamond']);
});

test('every badge has a Turkish label, a unit and a symbol the clients draw', () => {
  const symbols = new Set(['food', 'water', 'register', 'comment', 'health', 'vaccine', 'paw']);
  for (const [key, meta] of Object.entries(ANIMAL_BADGES)) {
    assert.ok(meta.label && meta.unit, key);
    assert.ok(symbols.has(meta.symbol), `${key}: ${meta.symbol}`);
  }
});

test('the ladder lists every key in order, earned or not, with count and thresholds', () => {
  const ladder = buildAnimalBadgeLadder(
    { liked: 7, followed: 1, cared: 0, commented: 12, matched: 0, recovered: 0 },
    [
      { badge_key: 'liked', tier: 'bronze' },
      { badge_key: 'liked', tier: 'silver' },
      { badge_key: 'followed', tier: 'bronze' },
      { badge_key: 'commented', tier: 'silver' },
    ]
  );
  assert.deepEqual(
    ladder.map((b) => b.key),
    Object.keys(ANIMAL_BADGES)
  );
  const liked = ladder.find((b) => b.key === 'liked');
  assert.equal(liked.tier, 'silver');
  assert.equal(liked.value, 7);
  assert.equal(liked.nextThreshold, 20);
  assert.deepEqual(liked.thresholds, COUNT_THRESHOLDS);
  assert.equal(liked.label, 'Gönül Çelen');
  const commented = ladder.find((b) => b.key === 'commented');
  assert.equal(commented.nextThreshold, 50);
  assert.deepEqual(commented.thresholds, COMMENT_THRESHOLDS);
  const cared = ladder.find((b) => b.key === 'cared');
  assert.equal(cared.tier, null);
  assert.equal(cared.value, 0);
  assert.equal(cared.nextThreshold, 1, 'an unearned key points at bronze');
});

test('the ladder keeps the tier on record when the live count has dropped', () => {
  // Five followers earned silver; three unfollowed. The chip stays silver
  // and the progress reads 2 of the 20 gold needs.
  const [followed] = buildAnimalBadgeLadder({ followed: 2 }, [
    { badge_key: 'followed', tier: 'bronze' },
    { badge_key: 'followed', tier: 'silver' },
  ]).filter((b) => b.key === 'followed');
  assert.equal(followed.tier, 'silver');
  assert.equal(followed.value, 2);
  assert.equal(followed.nextThreshold, 20);
});

test('a diamond key has no next threshold; a retired key in the awards is ignored', () => {
  const ladder = buildAnimalBadgeLadder({ liked: 150 }, [
    { badge_key: 'liked', tier: 'diamond' },
    { badge_key: 'retired', tier: 'gold' },
  ]);
  assert.equal(ladder.find((b) => b.key === 'liked').nextThreshold, null);
  assert.equal(ladder.length, Object.keys(ANIMAL_BADGES).length);
  assert.ok(!ladder.some((b) => b.key === 'retired'));
});
