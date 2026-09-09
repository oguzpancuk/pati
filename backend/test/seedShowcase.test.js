const test = require('node:test');
const assert = require('node:assert');

const seed = require('../scripts/seed-showcase');
const { demoPhotoFile } = require('../scripts/lib/demoPhotos');

/**
 * seed-showcase.js runs against PRODUCTION, next to real rows. The parts
 * worth pinning are the ones whose failure is silent: a photo filename that
 * stops matching the committed asset, a flag that is trusted instead of
 * validated, a plan that puts activity in the future, and the SQL builder
 * that turns thousands of rows into a handful of statements. None of this
 * needs a database.
 */

// --------------------------------------------------------------- photo names

test('demo photo filenames are ASCII and match the committed assets', () => {
  assert.strictEqual(demoPhotoFile('cat', 'Üç renk (calico)'), 'cat-uc-renk-calico.png');
  assert.strictEqual(
    demoPhotoFile('dog', 'Sokak melezi (orta boy)'),
    'dog-sokak-melezi-orta-boy.png'
  );
  assert.strictEqual(demoPhotoFile('dog', 'Akbaş melezi'), 'dog-akbas-melezi.png');
  // A free-text pattern falls back to the neutral face, never to a name
  // that no file answers.
  assert.strictEqual(demoPhotoFile('cat', null), 'cat-other.png');
  assert.strictEqual(demoPhotoFile('cat', 'kendi yazdığım şey'), 'cat-kendi-yazdigim-sey.png');
});

test('every pattern the seed can pick has a committed PNG', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { CAT_PATTERNS, DOG_PATTERNS } = require('../src/utils/taxonomy');
  const dir = path.join(__dirname, '..', 'demo-assets', 'animals');
  for (const [species, patterns] of [
    ['cat', CAT_PATTERNS],
    ['dog', DOG_PATTERNS],
  ]) {
    for (const pattern of [...patterns, null]) {
      const file = path.join(dir, demoPhotoFile(species, pattern));
      assert.ok(fs.existsSync(file), `missing ${file} — rerun generate-demo-animal-photos.mjs`);
    }
  }
});

// --------------------------------------------------------------------- flags

test('parseArgs validates instead of trusting', () => {
  assert.throws(() => seed.parseArgs(['--base=not a url']), /not a URL/);
  assert.throws(() => seed.parseArgs(['--base=ftp://x.example']), /http/);
  assert.throws(() => seed.parseArgs(['--districts=0']), /districts/);
  assert.throws(() => seed.parseArgs(['--districts=half']), /districts/);
  assert.throws(() => seed.parseArgs(['--users=0']), /users/);
  assert.throws(() => seed.parseArgs(['--users=9000']), /users/);
  assert.throws(() => seed.parseArgs(['--nuke']), /unknown flag/);

  const flags = seed.parseArgs(['--districts=all', '--users=4', '--base=https://pati-app.com/x']);
  assert.strictEqual(flags.districts, 'all');
  assert.strictEqual(flags.users, 4);
  // Only the origin is kept: a path here would double up in the photo URL.
  assert.strictEqual(flags.base, 'https://pati-app.com');
  assert.strictEqual(flags.remove, false);
  assert.strictEqual(flags.dryRun, false);
  assert.strictEqual(seed.parseArgs(['--remove', '--dry-run']).remove, true);
  assert.strictEqual(seed.parseArgs(['--remove', '--dry-run']).dryRun, true);
});

test('a capped --districts run still covers all three cities', () => {
  const chosen = seed.selectDistricts(seed.loadDistricts(), 3);
  assert.deepStrictEqual(
    chosen.map((d) => d.city),
    ['İstanbul', 'İzmir', 'Ankara']
  );
  assert.ok(seed.selectDistricts(seed.loadDistricts(), 'all').length >= 44);
});

// ---------------------------------------------------------------- the plan

function samplePlan(now = new Date('2026-09-09T12:00:00Z')) {
  const district = seed
    .selectDistricts(seed.loadDistricts(), 'all')
    .find((d) => d.key === 'Ankara/Çankaya');
  return {
    district,
    now,
    plan: seed.planDistrict(district, { users: 12, base: 'https://x.test' }, now),
  };
}

test('the same district always plans the same world', () => {
  const now = new Date('2026-09-09T12:00:00Z');
  const a = samplePlan(now).plan;
  const b = samplePlan(now).plan;
  assert.deepStrictEqual(
    a.users.map((u) => `${u.email}|${u.name}|${u.profile}`),
    b.users.map((u) => `${u.email}|${u.name}|${u.profile}`)
  );
  assert.deepStrictEqual(
    a.care.map((c) => `${c.type}|${c.at.toISOString()}`),
    b.care.map((c) => `${c.type}|${c.at.toISOString()}`)
  );
});

test('account names are the deterministic rerun key', () => {
  const { district, plan } = samplePlan();
  const prefix = seed.emailPrefix(district);
  assert.strictEqual(prefix, 'demo-ankara-cankaya-');
  assert.deepStrictEqual(
    plan.users.map((u) => u.email),
    Array.from({ length: 12 }, (_, i) => `${prefix}${i + 1}@pati.demo`)
  );
  assert.strictEqual(new Set(plan.users.map((u) => u.email)).size, 12);
});

test('nothing is dated in the future and the history stays inside its month', () => {
  const { now, plan } = samplePlan();
  const oldest = new Date(now.getTime() - (seed.HISTORY_DAYS + 20) * 86400000);
  const everything = [
    ...plan.users.map((u) => u.createdAt),
    ...plan.animals.map((a) => a.createdAt),
    ...plan.care.map((c) => c.at),
    ...plan.comments.map((c) => c.at),
    ...plan.group.messages.map((m) => m.at),
  ];
  for (const at of everything) {
    assert.ok(at <= now, `${at.toISOString()} is in the future`);
    assert.ok(at >= oldest, `${at.toISOString()} predates the seeded month`);
  }
});

test('the fresh slice lands inside the map window care.controller.js draws', () => {
  const { now, plan } = samplePlan();
  const fresh = plan.care.filter((c) => c.fresh);
  assert.ok(fresh.length > 0, 'no live care actions — the map would show no rings');
  for (const c of fresh) {
    const ageHours = (now.getTime() - c.at.getTime()) / 3600000;
    assert.ok(ageHours >= 0 && ageHours < seed.FRESH_HOURS[c.type], `${c.type} ${ageHours}h old`);
  }
});

test('every animal gets exactly one photo, inside its district', () => {
  const { district, plan } = samplePlan();
  assert.strictEqual(plan.animals.length, plan.users.length * seed.ANIMALS_PER_USER);
  const lats = district.points.map((p) => p.lat);
  const lngs = district.points.map((p) => p.lng);
  for (const animal of plan.animals) {
    assert.match(animal.photoUrl, /^https:\/\/x\.test\/demo\/animals\/(cat|dog)-[a-z0-9-]+\.png$/);
    // Within the district's own neighbourhood spread plus the jitter.
    assert.ok(animal.spot.lat > Math.min(...lats) - 0.01);
    assert.ok(animal.spot.lat < Math.max(...lats) + 0.01);
    assert.ok(animal.spot.lng > Math.min(...lngs) - 0.01);
    assert.ok(animal.spot.lng < Math.max(...lngs) + 0.01);
  }
});

test('friendships are one row per pair and never self-directed', () => {
  const { plan } = samplePlan();
  const keys = plan.friendships.map((f) => `${f.requester.index}:${f.addressee.index}`);
  assert.strictEqual(new Set(keys).size, keys.length, 'duplicate friendship pair');
  for (const f of plan.friendships) {
    // friendships CHECK (requester_id <> addressee_id), and the pair is
    // always stored low-index-first so (a,b) and (b,a) cannot both exist.
    assert.notStrictEqual(f.requester.index, f.addressee.index);
    assert.ok(f.requester.index < f.addressee.index);
  }
});

test('the text is Turkish and varied, not one template repeated', () => {
  const { plan } = samplePlan();
  const bodies = plan.comments.map((c) => c.body);
  assert.ok(bodies.length > 10);
  // A templated seed would collapse to a handful of distinct strings.
  assert.ok(new Set(bodies).size > bodies.length * 0.6, 'comments repeat too much');
  for (const body of bodies) {
    assert.ok(!/lorem|ipsum|test|demo/i.test(body), `placeholder text: ${body}`);
  }
});

// -------------------------------------------------------------- SQL building

test('insertRows batches rows into few statements and numbers placeholders', async () => {
  const seen = [];
  const client = {
    async query(sql, params) {
      seen.push({ sql, params });
      return { rows: params.filter((_, i) => i % 2 === 0).map((id) => ({ id })) };
    },
  };
  const rows = Array.from({ length: 5 }, (_, i) => [i, `n${i}`]);
  await seed.insertRows(client, 'widgets', ['id', 'name'], rows, {
    conflict: 'ON CONFLICT DO NOTHING',
    returning: 'id',
  });
  assert.strictEqual(seen.length, 1, 'five rows must be one statement');
  assert.strictEqual(
    seen[0].sql,
    'INSERT INTO widgets (id, name) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10)' +
      ' ON CONFLICT DO NOTHING RETURNING id'
  );
  assert.strictEqual(seen[0].params.length, 10);
});

test('insertRows expands a multi-parameter column template', async () => {
  let captured = null;
  const client = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [] };
    },
  };
  await seed.insertRows(
    client,
    'care_actions',
    [{ name: 'location', tpl: 'ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography' }, 'user_id'],
    [[29.02, 40.99, 7]]
  );
  assert.strictEqual(
    captured.sql,
    'INSERT INTO care_actions (location, user_id) VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)'
  );
  assert.deepStrictEqual(captured.params, [29.02, 40.99, 7]);
});

test('insertRows refuses a row of the wrong width', async () => {
  const client = {
    async query() {
      return { rows: [] };
    },
  };
  await assert.rejects(
    () => seed.insertRows(client, 'widgets', ['a', 'b'], [[1, 2], [3]]),
    /row width must be 2/
  );
});

test('insertRows stays under the bind-parameter ceiling', async () => {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push(params.length);
      return { rows: [] };
    },
  };
  // Ten columns x 5000 rows would be 50 000 parameters in one statement.
  const columns = Array.from({ length: 10 }, (_, i) => `c${i}`);
  const rows = Array.from({ length: 5000 }, () => columns.map(() => 1));
  await seed.insertRows(client, 'widgets', columns, rows);
  assert.ok(statements.length > 1);
  for (const count of statements) assert.ok(count <= 60000, `${count} bind parameters`);
  assert.strictEqual(
    statements.reduce((a, b) => a + b, 0),
    50000
  );
});

// ------------------------------------------------------------------- removal

test('the removal order deletes children before their parents', () => {
  const order = seed.REMOVE_ORDER;
  const before = (a, b) =>
    assert.ok(order.indexOf(a) < order.indexOf(b), `${a} must be deleted before ${b}`);
  before('messages', 'conversations');
  before('conversation_members', 'conversations');
  before('animal_comments', 'animals');
  before('animal_photos', 'animals');
  before('health_records', 'animals');
  before('vaccinations', 'animals');
  before('animal_followers', 'animals');
  before('user_animal_care', 'animals');
  before('notifications', 'animals');
  // animals.created_by / care_actions.user_id have no ON DELETE clause at
  // all, so the users row cannot go first.
  before('animals', 'users');
  before('care_actions', 'users');
  before('friendships', 'users');
  assert.strictEqual(order[order.length - 1], 'users');
});
