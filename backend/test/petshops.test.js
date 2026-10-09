/**
 * Petshop listings on the map: what the admin form may store, and the
 * public viewport route's guard. No database — the input rules are pure,
 * and the route refuses a bad viewport before it reaches Postgres.
 */
const test = require('node:test');
const assert = require('node:assert');

const { parsePetshopInput } = require('../src/utils/petshops');
const petshops = require('../src/controllers/petshop.controller');

const valid = {
  name: '  Mama Dünyası  ',
  address: 'Moda Cd. 12, Kadıköy',
  phone: '0216 555 12 34',
  openingHours: 'Her gün 09:00–21:00',
  websiteUrl: 'https://instagram.com/mamadunyasi',
  lat: 40.987,
  lng: 29.027,
  startsAt: '2026-10-07T00:00:00.000Z',
  endsAt: '2026-11-06T20:59:59.000Z',
};

test('a complete listing is accepted and trimmed', () => {
  const { value, error } = parsePetshopInput(valid);
  assert.strictEqual(error, null);
  assert.strictEqual(value.name, 'Mama Dünyası');
  assert.strictEqual(value.lat, 40.987);
  assert.strictEqual(value.lng, 29.027);
  assert.strictEqual(value.hidden, false);
});

test('only a name and a location are required', () => {
  const { value, error } = parsePetshopInput({ name: 'Pati Shop', lat: '41.01', lng: '28.97' });
  assert.strictEqual(error, null);
  assert.strictEqual(value.address, null);
  assert.strictEqual(value.phone, null);
  assert.strictEqual(value.websiteUrl, null);
  assert.strictEqual(value.startsAt, null);
  assert.strictEqual(value.endsAt, null);
});

test('a listing without a name or a place is refused in Turkish', () => {
  assert.match(parsePetshopInput({ ...valid, name: '   ' }).error, /ad/i);
  for (const [lat, lng] of [
    [undefined, 29],
    ['', '29'],
    ['abc', '29'],
    [999, 29],
    [41, 200],
  ]) {
    assert.match(parsePetshopInput({ ...valid, lat, lng }).error, /Konum/, `${lat},${lng}`);
  }
});

test('a phone must look like a phone', () => {
  for (const phone of ['abc', '12', '0216 555 12 34 ext. 5', '+90 216 555 12 34 99 88 77 66']) {
    assert.match(parsePetshopInput({ ...valid, phone }).error, /Telefon/, phone);
  }
  for (const phone of ['+90 (216) 555-12-34', '05325551234', '444 1 234']) {
    assert.strictEqual(parsePetshopInput({ ...valid, phone }).error, null, phone);
  }
});

test('the link must be an http(s) address', () => {
  for (const websiteUrl of ['instagram.com/x', 'javascript:alert(1)', 'ftp://x.com']) {
    assert.match(parsePetshopInput({ ...valid, websiteUrl }).error, /Bağlantı/, websiteUrl);
  }
});

test('the visibility window must be real dates in order', () => {
  assert.match(parsePetshopInput({ ...valid, startsAt: 'yarın' }).error, /tarih/i);
  assert.match(
    parsePetshopInput({ ...valid, startsAt: valid.endsAt, endsAt: valid.startsAt }).error,
    /Bitiş/
  );
});

test('overlong free text is refused rather than cut', () => {
  assert.match(parsePetshopInput({ ...valid, name: 'x'.repeat(121) }).error, /ad/i);
  assert.match(parsePetshopInput({ ...valid, openingHours: 'x'.repeat(301) }).error, /saat/i);
});

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

test('the public route refuses a missing or junk viewport with a Turkish 400', async () => {
  const cases = [
    {},
    { minLat: '40', maxLat: '41', minLng: '28' },
    { minLat: '40', maxLat: '41', minLng: 'abc', maxLng: '29' },
    { minLat: '999', maxLat: '41', minLng: '28', maxLng: '29' },
  ];
  for (const query of cases) {
    const res = fakeRes();
    await petshops.listPetshops({ query }, res, (err) => assert.fail(`next(): ${err}`));
    assert.strictEqual(res.code, 400, JSON.stringify(query));
    assert.match(res.body.error, /Harita sınırları/);
  }
});

test('hidden must be a real boolean, so a stray "true" cannot un-hide a listing', () => {
  assert.strictEqual(parsePetshopInput({ ...valid, hidden: true }).value.hidden, true);
  assert.strictEqual(parsePetshopInput({ ...valid, hidden: false }).value.hidden, false);
  assert.strictEqual(parsePetshopInput({ ...valid }).value.hidden, false);
  for (const hidden of ['true', 'false', 1, 0, 'evet', {}]) {
    const { value, error } = parsePetshopInput({ ...valid, hidden });
    assert.strictEqual(value, null, JSON.stringify(hidden));
    assert.match(error, /Gizli/, JSON.stringify(hidden));
  }
});

test('the window order is compared as instants, not as ISO text', () => {
  // Year 10000 prints as "+010000-…", which sorts before "2026-…" as text.
  const { error } = parsePetshopInput({ ...valid, endsAt: '+010000-01-01T00:00:00.000Z' });
  assert.strictEqual(error, null);
});
