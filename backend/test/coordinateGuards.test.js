/**
 * The public map routes take coordinates straight from a client-controlled
 * viewport. A non-numeric corner must be a Turkish 400, not a Postgres
 * "invalid input syntax" 500 whose message the error middleware echoes
 * back (review finding, 2026-09-09). These tests pin the guard itself,
 * with no database: they call the controller with a fake res.
 */
const test = require('node:test');
const assert = require('node:assert');

const care = require('../src/controllers/care.controller');
const animals = require('../src/controllers/animal.controller');

function fakeRes() {
  return {
    code: null,
    body: null,
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

// An empty string is Number('') === 0, a valid corner — not in this list.
const bad = ['abc', 'NaN', 'Infinity', '12,5'];

test('listCareActions refuses a non-numeric viewport corner', async () => {
  for (const value of bad) {
    const res = fakeRes();
    await care.listCareActions(
      { query: { minLat: '40', maxLat: '41', minLng: value, maxLng: '29.1' } },
      res,
      (err) => assert.fail(`passed to next(): ${err}`)
    );
    assert.strictEqual(res.code, 400, `corner ${JSON.stringify(value)}`);
    assert.match(res.body.error, /sayı olmalı|zorunludur/);
  }
});

test('listCareActions and getCareStatus refuse a non-numeric radius centre', async () => {
  for (const handler of [care.listCareActions, care.getCareStatus]) {
    const res = fakeRes();
    await handler({ query: { lat: 'abc', lng: '29' } }, res, (err) =>
      assert.fail(`passed to next(): ${err}`)
    );
    assert.strictEqual(res.code, 400);
    assert.match(res.body.error, /sayı olmalı/);
  }
});

test('listAnimals refuses a non-numeric centre', async () => {
  const res = fakeRes();
  await animals.listAnimals({ query: { lat: 'abc', lng: '29' } }, res, (err) =>
    assert.fail(`passed to next(): ${err}`)
  );
  assert.strictEqual(res.code, 400);
  assert.match(res.body.error, /sayı olmalı/);
});
