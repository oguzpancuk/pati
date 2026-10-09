/**
 * The admin form's slot choice, pinned with no database. That an ad in two
 * slots is served in both, and that rotation keeps moving in either, needs
 * a database: scripts/ad-targeting-check/run.sh.
 */
const test = require('node:test');
const assert = require('node:assert');

const { parseAdSlots } = require('../src/utils/adSlots');

test('parseAdSlots: nothing sent leaves the ad as it is', () => {
  assert.deepStrictEqual(parseAdSlots({}), { slots: undefined });
});

test('parseAdSlots takes a list, and the single slot older callers send', () => {
  assert.deepStrictEqual(parseAdSlots({ slots: ['vet_health_record', 'food_popup'] }), {
    slots: ['food_popup', 'vet_health_record'],
  });
  assert.deepStrictEqual(parseAdSlots({ slot: 'water_popup' }), { slots: ['water_popup'] });
  // The list wins when both arrive.
  assert.deepStrictEqual(parseAdSlots({ slots: ['water_popup'], slot: 'food_popup' }), {
    slots: ['water_popup'],
  });
});

test('parseAdSlots collapses duplicates into the fixed order', () => {
  assert.deepStrictEqual(parseAdSlots({ slots: ['water_popup', 'food_popup', 'water_popup'] }), {
    slots: ['food_popup', 'water_popup'],
  });
});

test('parseAdSlots refuses an empty list and unknown slots', () => {
  for (const bad of [
    { slots: [] },
    { slots: null },
    { slots: 'food_popup' },
    { slots: ['food_popup', 'banner'] },
    { slot: 'banner' },
    { slot: null },
  ]) {
    assert.ok(parseAdSlots(bad).error, JSON.stringify(bad));
  }
});
