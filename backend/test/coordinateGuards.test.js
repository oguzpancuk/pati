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
      value.trim() === '' ? /zorunludur/ : /Harita sınırları geçerli koordinat olmalıdır/,
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
    assert.match(res.body.error, /lat ve lng geçerli koordinat olmalıdır/);
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
    assert.match(res.body.error, /radiusMeters 0 ile 200000/);
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

test('the animal write paths refuse an empty or out-of-range point', async () => {
  const bad = [
    { lat: '', lng: '29' },
    { lat: '999', lng: '29' },
    { lat: '41', lng: '181' },
  ];
  for (const { lat, lng } of bad) {
    const create = fakeRes();
    await animals.createAnimal({ body: { species: 'cat', lat, lng }, user: { userId: 1 } }, create, (err) =>
      assert.fail(`createAnimal passed to next(): ${err}`)
    );
    assert.strictEqual(create.code, 400, `create ${lat}/${lng}`);
    assert.match(create.body.error, /geçerli bir konum olmalıdır/);

    const sighting = fakeRes();
    await animals.reportSighting(
      { body: { lat, lng }, params: { id: '1' }, user: { userId: 1 } },
      sighting,
      (err) => assert.fail(`reportSighting passed to next(): ${err}`)
    );
    assert.strictEqual(sighting.code, 400, `sighting ${lat}/${lng}`);
    assert.match(sighting.body.error, /geçerli bir konum olmalıdır/);

    const match = fakeRes();
    await animals.matchAnimals(
      { method: 'POST', body: { species: 'cat', lat, lng }, files: [], user: { userId: 1 } },
      match,
      (err) => assert.fail(`matchAnimals passed to next(): ${err}`)
    );
    assert.strictEqual(match.code, 400, `match ${lat}/${lng}`);
    assert.match(match.body.error, /geçerli bir konum olmalıdır/);
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

test('the public read paths refuse a coordinate PostGIS would silently move', async () => {
  // `lat=999` is a finite number and not a place. PostGIS coerces it to
  // about −81 and answers 200 about the southern ocean, so the range has to
  // be checked here — the write paths have done it since 2026-09-09, the
  // read paths did not (roadmap follow-up, closed 2026-09-10).
  const outOfRange = [
    { lat: '999', lng: '29' },
    { lat: '41', lng: '181' },
    { lat: '-91', lng: '29' },
  ];
  for (const query of outOfRange) {
    for (const handler of [care.listCareActions, care.getCareStatus, animals.listAnimals]) {
      const res = fakeRes();
      await handler({ query }, res, (err) => assert.fail(`passed to next(): ${err}`));
      assert.strictEqual(res.code, 400, `${handler.name} ${JSON.stringify(query)}`);
      assert.match(res.body.error, /geçerli koordinat olmalıdır/);
    }
  }
});

test('a viewport corner off the globe is refused too', async () => {
  const res = fakeRes();
  await care.listCareActions(
    { query: { minLat: '-91', maxLat: '41', minLng: '28.9', maxLng: '29.1' } },
    res,
    (err) => assert.fail(`passed to next(): ${err}`)
  );
  assert.strictEqual(res.code, 400);
  assert.match(res.body.error, /Harita sınırları geçerli koordinat olmalıdır/);
});

test('an absurd radius is refused rather than walking the whole table', async () => {
  // `radiusMeters=1e300` was accepted, and ST_DWithin then compared every
  // row in the table against it (roadmap follow-up).
  for (const value of ['1e300', '900000', '0', '-5']) {
    for (const handler of [care.listCareActions, care.getCareStatus, animals.listAnimals]) {
      const res = fakeRes();
      await handler({ query: { lat: '41', lng: '29', radiusMeters: value } }, res, (err) =>
        assert.fail(`passed to next(): ${err}`)
      );
      assert.strictEqual(res.code, 400, `${handler.name} radius ${value}`);
      assert.match(res.body.error, /radiusMeters 0 ile 200000/);
    }
  }
});

test('the radii the clients actually send are still accepted', async () => {
  // 100 m is the care status circle, 500 m the map's animals, 3 km the
  // care list's default: a guard that refused any of these would be worse
  // than the hole it closes. They reach the database, so the assertion is
  // that they are not refused by the guard.
  const { radiusMeters, MAX_RADIUS_METERS } = require('../src/utils/numbers');
  for (const value of [100, 500, 1000, 3000, MAX_RADIUS_METERS]) {
    assert.strictEqual(radiusMeters(String(value)), value, `radius ${value}`);
  }
  assert.strictEqual(radiusMeters('200001'), null);
});
