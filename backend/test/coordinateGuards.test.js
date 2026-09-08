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

// An empty value is refused too: Number('') is 0, which would otherwise
// travel to Postgres as the string '' and come back as an English 500.
const bad = ['abc', 'NaN', 'Infinity', '12,5', '', '   '];

test('listCareActions refuses a non-numeric viewport corner', async () => {
  for (const value of bad) {
    const res = fakeRes();
    await care.listCareActions(
      { query: { minLat: '40', maxLat: '41', minLng: value, maxLng: '29.1' } },
      res,
      (err) => assert.fail(`passed to next(): ${err}`)
    );
    assert.strictEqual(res.code, 400, `corner ${JSON.stringify(value)}`);
    // An empty corner is "missing" and falls to the radius branch's
    // message; anything else is the box guard's own.
    assert.match(
      res.body.error,
      value.trim() === '' ? /zorunludur/ : /Harita sınırları sayı olmalıdır/,
      `corner ${JSON.stringify(value)}`
    );
  }
});

test('listCareActions and getCareStatus refuse a non-numeric radius centre', async () => {
  for (const handler of [care.listCareActions, care.getCareStatus]) {
    const res = fakeRes();
    await handler({ query: { lat: 'abc', lng: '29' } }, res, (err) =>
      assert.fail(`passed to next(): ${err}`)
    );
    assert.strictEqual(res.code, 400);
    assert.match(res.body.error, /lat ve lng sayı olmalıdır/);
  }
});

test('listAnimals refuses a non-numeric centre or radius', async () => {
  for (const query of [
    { lat: 'abc', lng: '29' },
    { lat: '41', lng: 'abc' },
    { lat: '41', lng: '29', radiusMeters: 'abc' },
  ]) {
    const res = fakeRes();
    await animals.listAnimals({ query }, res, (err) =>
      assert.fail(`passed to next(): ${err}`)
    );
    assert.strictEqual(res.code, 400, JSON.stringify(query));
    assert.match(res.body.error, /sayı olmalıdır/);
  }
});

test('listAnimals refuses half a centre and treats blanks as no centre', async () => {
  for (const query of [{ lat: '41' }, { lat: '41', lng: '   ' }, { lng: '29' }]) {
    const res = fakeRes();
    await animals.listAnimals({ query }, res, (err) =>
      assert.fail(`passed to next(): ${err}`)
    );
    assert.strictEqual(res.code, 400, JSON.stringify(query));
    assert.match(res.body.error, /birlikte verilmelidir/);
  }
});

test('a junk radius is refused rather than falling back to the default', async () => {
  for (const handler of [care.listCareActions, care.getCareStatus]) {
    const res = fakeRes();
    await handler({ query: { lat: '41', lng: '29', radiusMeters: 'abc' } }, res, (err) =>
      assert.fail(`passed to next(): ${err}`)
    );
    assert.strictEqual(res.code, 400);
    assert.match(res.body.error, /radiusMeters sayı olmalıdır/);
  }
});

test('addCareAction refuses an empty or out-of-range pin', async () => {
  for (const body of [
    { lat: '', lng: '29', actionType: 'food', photoToken: 'x' },
    { lat: '999', lng: '29', actionType: 'food', photoToken: 'x' },
    { lat: '41', lng: '181', actionType: 'food', photoToken: 'x' },
  ]) {
    const res = fakeRes();
    await care.addCareAction({ body, file: null }, res, (err) =>
      assert.fail(`passed to next(): ${err}`)
    );
    assert.strictEqual(res.code, 400, JSON.stringify(body));
    assert.match(res.body.error, /geçerli bir konum olmalıdır/);
  }
});

test('an empty coordinate never reaches the database', async () => {
  for (const handler of [care.listCareActions, care.getCareStatus]) {
    const res = fakeRes();
    await handler({ query: { lat: '', lng: '' } }, res, (err) =>
      assert.fail(`passed to next(): ${err}`)
    );
    assert.strictEqual(res.code, 400);
    assert.match(res.body.error, /zorunludur/);
  }
});
