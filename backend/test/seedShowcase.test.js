const test = require('node:test');
const assert = require('node:assert');

const seed = require('../scripts/seed-showcase');
const { demoPhotoFile } = require('../scripts/lib/demoPhotos');
const { GROUP_OPENING, isColdAt } = require('../scripts/lib/demoContent');

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

test('the two care photos are committed', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'demo-assets', 'care');
  for (const type of ['food', 'water']) {
    const file = path.join(dir, `${type}.png`);
    assert.ok(fs.existsSync(file), `missing ${file} — rerun generate-demo-care-photos.mjs`);
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

// A drop's photo shows the BOWL of what was left, never an animal: that is
// what a real drop carries and what the admin panel renders (QA finding).
test('every drop carries the bowl photo for its own type', () => {
  const { plan } = samplePlan();
  assert.ok(plan.care.length > 0);
  for (const drop of plan.care) {
    assert.strictEqual(drop.photo, `https://x.test/demo/care/${drop.type}.png`);
  }
});

// The seasonal pools are asked of each ROW's own date, not of the machine
// clock or of the group's creation date: a run in early April used to stamp
// "hava çok soğuk" onto messages dated 5 April (review findings). Both
// directions are pinned, and the January date matters — at a September `now`
// no cold line is generated at all, so a one-sided test would pass while
// asserting nothing.
const COLD_WORDS = /soğu|kışlık|battaniye/i;

function datedRows(plan) {
  return [
    ...plan.comments.map((c) => ({ body: c.body, at: c.at })),
    ...plan.group.messages,
    ...plan.directs.flatMap((d) => d.messages),
  ];
}

// EARLY APRIL is the date that bites, and the only one that does: history
// then reaches back into March, so a cold line is available and a plan that
// asks the season of the wrong thing — the group's creation date, the
// friendship's date, the machine clock — stamps it onto an April row. A
// January `now` cannot fail (everything is cold) and an August one produces
// no cold line at all; a test at either date passes against the very code it
// exists to catch (review finding).
// A cold line on a warm date is rare, so a single district on a single date
// proves nothing: two earlier versions of this test passed against the very
// code they were written to catch. The sweep is what bites for the GROUP
// path — every district across the two week-long windows where a 30-day
// history straddles the season boundary, ~0.15 s — and it does fail against
// the per-group planner (18 violations there, 0 here). The DM path's own
// violation is rarer still (the review's year-long probe found none by
// sampling), so its rule is pinned directly, below, instead of by sweeping.
test('no district plans a cold-weather line onto a warm date', () => {
  const districts = seed.selectDistricts(seed.loadDistricts(), 'all');
  const dates = [];
  for (let d = 1; d <= 12; d += 1) {
    dates.push(new Date(`2027-04-${String(d).padStart(2, '0')}T12:00:00Z`));
    dates.push(new Date(`2026-11-${String(d).padStart(2, '0')}T12:00:00Z`));
  }
  let coldSeen = 0;
  for (const now of dates) {
    for (const district of districts) {
      const plan = seed.planDistrict(district, { users: 12, base: 'https://x.test' }, now);
      for (const row of datedRows(plan)) {
        if (!COLD_WORDS.test(row.body)) continue;
        coldSeen += 1;
        assert.ok(
          isColdAt(row.at),
          `${district.key} planned "${row.body}" onto ${row.at.toISOString()}`
        );
      }
    }
  }
  // Without this the sweep would pass by producing no cold line at all.
  assert.ok(coldSeen > 0, 'the sweep should produce cold-weather lines on cold dates');
});

test('an August plan mentions the cold nowhere', () => {
  const { plan } = samplePlan(new Date('2026-08-20T12:00:00Z'));
  for (const row of datedRows(plan)) {
    assert.ok(!COLD_WORDS.test(row.body), `"${row.body}" is dated ${row.at.toISOString()}`);
  }
});

// A plan must be a function of (seed, now) — not of the seeding machine's
// time zone. Asserting that from inside this process proves nothing: it
// passes trivially wherever the ambient zone is already UTC, which is CI and
// the Fly machine (review finding). Two child processes with opposite zones
// are the only honest form.
test('a plan does not depend on the seeding machine time zone', () => {
  const { execFileSync } = require('node:child_process');
  const script = `
    const seed = require(${JSON.stringify(require.resolve('../scripts/seed-showcase'))});
    const district = seed.selectDistricts(seed.loadDistricts(), 'all')
      .find((d) => d.key === 'Ankara/Çankaya');
    const plan = seed.planDistrict(district, { users: 12, base: 'https://x.test' },
      new Date('2027-04-05T12:00:00Z'));
    const bodies = [
      ...plan.comments.map((c) => c.body),
      ...plan.group.messages.map((m) => m.body),
      ...plan.directs.flatMap((d) => d.messages.map((m) => m.body)),
    ];
    process.stdout.write(require('node:crypto').createHash('sha1')
      .update(bodies.join('|')).digest('hex'));
  `;
  const run = (TZ) =>
    execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ } }).toString();
  assert.strictEqual(run('UTC'), run('Pacific/Kiritimati'));
  assert.strictEqual(run('UTC'), run('America/Anchorage'));
});

test('a group opens with its creator, and never with a joiner greeting', () => {
  const { plan } = samplePlan();
  const [first, ...rest] = plan.group.messages;
  assert.strictEqual(first.body, GROUP_OPENING);
  assert.strictEqual(first.sender, plan.group.createdBy);
  assert.ok(!/yeni katıldım/.test(first.body));
  assert.ok(rest.every((m) => m.at >= first.at));
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

// ------------------------------------------- the whole run, without a database

/**
 * A stand-in for a pg client that records every statement and hands back
 * plausible RETURNING rows. It exists because the first version of this
 * suite sampled ONE district at --users=12 and so missed thirteen
 * future-dated health records that appear at the shipping configuration,
 * plus two whole classes of timestamp that are built in writeDistrict and
 * never appear in the plan at all.
 */
function fakeClient() {
  const statements = [];
  let nextId = 1;
  return {
    statements,
    async query(sql, params = []) {
      statements.push({ sql, params });
      const match = /^INSERT INTO (\w+) \(([^)]+)\) VALUES/.exec(sql);
      if (!match) return { rows: [] };
      const columns = match[2].split(', ');
      // Every column binds one parameter except the PostGIS point, which
      // binds lng and lat.
      const width = columns.length + (columns.includes('location') ? 1 : 0);
      const offsetOf = (name) => {
        let offset = 0;
        for (const column of columns) {
          if (column === name) return offset;
          offset += column === 'location' ? 2 : 1;
        }
        return -1;
      };
      const returning = (/RETURNING (.+)$/.exec(sql)?.[1] ?? '').split(', ').filter(Boolean);
      const rows = [];
      for (let start = 0; start < params.length; start += width) {
        const row = { id: nextId++ };
        for (const field of returning) {
          if (field === 'id') continue;
          const offset = offsetOf(field);
          row[field] = offset < 0 ? null : params[start + offset];
        }
        rows.push(row);
      }
      return { rows };
    },
  };
}

test('no district at the shipping configuration plans a future timestamp', () => {
  const now = new Date('2026-09-09T12:00:00Z');
  const districts = seed.selectDistricts(seed.loadDistricts(), 'all');
  assert.ok(districts.length >= 44);
  let checked = 0;
  for (const district of districts) {
    const plan = seed.planDistrict(district, { users: 50, base: 'https://x.test' }, now);
    const dates = [
      ...plan.users.map((u) => u.createdAt),
      ...plan.animals.map((a) => a.createdAt),
      ...plan.care.map((c) => c.at),
      ...plan.comments.map((c) => c.at),
      ...plan.followers.map((f) => f.at),
      ...plan.health.flatMap((h) => [h.recordedAt, h.recoveredAt]),
      ...plan.vaccinations.flatMap((v) => [v.administeredAt, v.nextDueAt]),
      ...plan.friendships.map((f) => f.at),
      ...plan.directs.flatMap((d) => d.messages.map((m) => m.at)),
      ...plan.group.messages.map((m) => m.at),
      ...plan.group.members.map((m) => m.at),
      plan.group.createdAt,
    ].filter(Boolean);
    for (const at of dates) {
      // next_due_at is the one column that is meant to be ahead of now: a
      // booster is due in the future or it is not a booster.
      checked += 1;
      assert.ok(at <= now || plan.vaccinations.some((v) => v.nextDueAt === at),
        `${district.key}: ${at.toISOString()} is after ${now.toISOString()}`);
    }
  }
  assert.ok(checked > 70000, `only ${checked} timestamps checked`);
});

test('writeDistrict binds no future timestamp either', async () => {
  const now = new Date('2026-09-09T12:00:00Z');
  const district = seed
    .selectDistricts(seed.loadDistricts(), 'all')
    .find((d) => d.key === 'İstanbul/Kadıköy');
  const plan = seed.planDistrict(district, { users: 50, base: 'https://x.test' }, now);
  const client = fakeClient();
  const counts = await seed.writeDistrict(client, plan, '$2b$10$fakehash', now);

  assert.strictEqual(counts.users, 50);
  assert.strictEqual(counts.animals, 50 * seed.ANIMALS_PER_USER);
  assert.strictEqual(counts.animal_photos, counts.animals, 'exactly one photo per animal');

  const nextDue = new Set(plan.vaccinations.map((v) => v.nextDueAt?.getTime()).filter(Boolean));
  let dates = 0;
  for (const { sql, params } of client.statements) {
    for (const value of params) {
      if (!(value instanceof Date)) continue;
      dates += 1;
      if (nextDue.has(value.getTime()) && sql.includes('vaccinations')) continue;
      assert.ok(value <= now, `${sql.slice(0, 40)}… bound ${value.toISOString()}`);
    }
  }
  assert.ok(dates > 3000, `only ${dates} bound timestamps`);
});

test('assignIds refuses ids that came back out of order', () => {
  const items = [{ createdAt: new Date(1) }, { createdAt: new Date(2) }];
  assert.throws(
    () =>
      seed.assignIds(
        'animals',
        items,
        [
          { id: 9, created_at: new Date(2) },
          { id: 8, created_at: new Date(1) },
        ],
        (i) => i.createdAt,
        'created_at'
      ),
    /out of order/
  );
  assert.throws(
    () => seed.assignIds('animals', items, [{ id: 9, created_at: new Date(1) }], (i) => i.createdAt, 'created_at'),
    /got 1 ids back/
  );
  seed.assignIds(
    'animals',
    items,
    [
      { id: 8, created_at: new Date(1) },
      { id: 9, created_at: new Date(2) },
    ],
    (i) => i.createdAt,
    'created_at'
  );
  assert.deepStrictEqual(items.map((i) => i.id), [8, 9]);
});

test('noLaterThan never returns a moment after now', () => {
  const now = new Date('2026-09-09T12:00:00Z');
  assert.strictEqual(seed.noLaterThan(new Date('2026-09-20T00:00:00Z'), now), now);
  const earlier = new Date('2026-09-01T00:00:00Z');
  assert.strictEqual(seed.noLaterThan(earlier, now), earlier);
});

test('--remove flags are parsed and --force is opt-in', () => {
  assert.strictEqual(seed.parseArgs(['--remove']).force, false);
  assert.strictEqual(seed.parseArgs(['--remove', '--force']).force, true);
  assert.strictEqual(seed.parseArgs(['--badges-only']).badgesOnly, true);
  assert.strictEqual(seed.parseArgs(['--skip-photo-check']).skipPhotoCheck, true);
});

test('flag combinations that would mean the opposite of what they say are refused', () => {
  // --force alone would teach the habit of typing it on ordinary runs.
  assert.throws(() => seed.parseArgs(['--force']), /only applies with --remove/);
  assert.throws(() => seed.parseArgs(['--badges-only', '--remove']), /exclusive/);
  assert.strictEqual(seed.parseArgs(['--remove', '--force']).force, true);
});

test('assignIds also catches a permutation that keeps the correlating value', () => {
  // Two rows sharing a second-resolution timestamp: the column check alone
  // cannot tell them apart, so the id order has to.
  const same = new Date('2026-09-09T10:00:00Z');
  const items = [{ createdAt: same }, { createdAt: same }];
  assert.throws(
    () =>
      seed.assignIds(
        'animals',
        items,
        [
          { id: 9, created_at: same },
          { id: 8, created_at: same },
        ],
        (i) => i.createdAt,
        'created_at'
      ),
    /not in insert order/
  );
});

test('--help answers even alongside flags that conflict', () => {
  assert.strictEqual(seed.parseArgs(['--force', '--help']).help, true);
  assert.strictEqual(seed.parseArgs(['--help']).help, true);
});

// The DM rule, pinned as a predicate. A winter script's lines run up to
// DM_MAX_SPAN_MS past the first message, so a chat that STARTS in winter can
// end outside it; asking only the start planned "kışlık kulübe" onto 1 April
// (review finding). Sampling cannot catch this — the combination is one line
// in tens of thousands — so the rule is asserted where it is decided.
test('a winter script needs BOTH ends of the chat in winter', () => {
  assert.ok(seed.DM_MAX_SPAN_MS > 0);
  // Deep winter: allowed.
  assert.strictEqual(seed.coldChatAllowed(new Date('2027-01-15T12:00:00Z')), true);
  // The last hours of March: the chat would run into April.
  assert.strictEqual(seed.coldChatAllowed(new Date('2027-03-31T12:00:00Z')), false);
  assert.strictEqual(seed.coldChatAllowed(new Date('2027-03-31T23:00:00Z')), false);
  // Far enough inside March that the whole chat stays there.
  assert.strictEqual(seed.coldChatAllowed(new Date('2027-03-30T00:00:00Z')), true);
  // Warm side of the boundary: never.
  assert.strictEqual(seed.coldChatAllowed(new Date('2027-04-01T12:00:00Z')), false);
});
