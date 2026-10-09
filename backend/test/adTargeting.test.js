/**
 * The two wire parsers behind location-targeted ads, pinned with no
 * database. What this does NOT pin: that a targeted ad is withheld outside
 * its circle — that is PostGIS's ST_DWithin in getNextAd and needs a
 * database, so it lives in scripts/ad-targeting-check/run.sh.
 */
const test = require('node:test');
const assert = require('node:assert');

const { parseAdTarget, parseViewerLocation } = require('../src/utils/adTargeting');

test('parseAdTarget keeps "not sent", "nationwide" and "a circle" apart', () => {
  assert.deepStrictEqual(parseAdTarget(undefined), { target: undefined });
  assert.deepStrictEqual(parseAdTarget(null), { target: null });
  assert.deepStrictEqual(parseAdTarget({ lat: 40.99, lng: 29.03, radiusMeters: 2000 }), {
    target: { lat: 40.99, lng: 29.03, radiusMeters: 2000 },
  });
  // A form field arrives as a string; the parser accepts what Number would.
  assert.deepStrictEqual(parseAdTarget({ lat: '40.99', lng: '29.03', radiusMeters: '2000' }), {
    target: { lat: 40.99, lng: 29.03, radiusMeters: 2000 },
  });
});

test('parseAdTarget refuses a point that is not a coordinate', () => {
  for (const bad of [
    { lat: 999, lng: 29, radiusMeters: 2000 },
    { lat: 41, lng: -181, radiusMeters: 2000 },
    { lat: '', lng: 29, radiusMeters: 2000 },
    { lng: 29, radiusMeters: 2000 },
    { radiusMeters: 2000 },
    'Kadıköy',
    [41, 29],
  ]) {
    assert.ok(parseAdTarget(bad).error, JSON.stringify(bad));
  }
});

test('parseAdTarget holds the radius to 100 m – 200 km, whole metres', () => {
  const at = (radiusMeters) => parseAdTarget({ lat: 41, lng: 29, radiusMeters });
  assert.strictEqual(at(100).target.radiusMeters, 100);
  assert.strictEqual(at(200000).target.radiusMeters, 200000);
  for (const bad of [99, 200001, 0, -5, 1500.5, 'abc', '', undefined, null, Infinity]) {
    assert.match(at(bad).error ?? '', /yarıçap/, String(bad));
  }
});

test('parseViewerLocation: nothing sent is "unknown", not an error', () => {
  assert.deepStrictEqual(parseViewerLocation({}), { location: null });
  assert.deepStrictEqual(parseViewerLocation({ lat: '', lng: ' ' }), { location: null });
  assert.deepStrictEqual(parseViewerLocation({ lat: '40.9955', lng: '29.031' }), {
    location: { lat: 40.9955, lng: 29.031 },
  });
});

test('parseViewerLocation refuses half a pair and non-coordinates', () => {
  for (const bad of [
    { lat: '41' },
    { lng: '29' },
    { lat: 'abc', lng: '29' },
    { lat: '91', lng: '29' },
    { lat: '41', lng: 'Infinity' },
  ]) {
    assert.match(parseViewerLocation(bad).error ?? '', /lat ve lng/, JSON.stringify(bad));
  }
});
