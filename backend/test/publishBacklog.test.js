/**
 * The one-off that copies the volume's existing photos into a freshly
 * configured bucket. It only ever runs once per deployment, by hand, on
 * production — which is exactly the kind of script that is wrong when it
 * finally matters, so it is tested against a fake bucket like the driver
 * itself.
 *
 * The module reads its configuration at require time, so the server has to
 * be listening before it is loaded.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-backlog-'));

const objects = new Map();
const seen = [];
let failKeys = new Set();

const server = http.createServer((req, res) => {
  const key = decodeURIComponent(req.url.replace(/^\/pati-backlog\//, '').split('?')[0]);
  seen.push(`${req.method} ${key}`);
  if (req.method === 'HEAD') {
    return objects.has(key) ? res.writeHead(200).end() : res.writeHead(404).end();
  }
  if (req.method === 'PUT') {
    if (failKeys.has(key)) return res.writeHead(500).end('<Error><Code>Boom</Code></Error>');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      objects.set(key, Buffer.concat(chunks));
      res.writeHead(200, { ETag: '"x"' }).end();
    });
    return;
  }
  res.writeHead(405).end();
});

const listening = new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

let publishBacklog;
let candidateFiles;
const quiet = () => {};

/** The database rows the script asks about, faked at the pool. */
let referenced = [];

test.before(async () => {
  await listening;
  process.env.UPLOADS_DIR = uploads;
  process.env.S3_ENDPOINT = `http://127.0.0.1:${server.address().port}`;
  process.env.S3_BUCKET = 'pati-backlog';
  process.env.S3_ACCESS_KEY_ID = 'test-key';
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
  // The script asks the database which files a row points at. A fake pool
  // keeps this test free of Postgres while exercising the real filter.
  const pool = require('../src/config/db');
  pool.query = async () => ({
    rows: referenced.map((name) => ({ url: `https://pati-app.com/uploads/${name}` })),
  });
  ({ publishBacklog, candidateFiles } = require('../scripts/publish-backlog'));
});

test.after(() => {
  server.close();
  fs.rmSync(uploads, { recursive: true, force: true });
});

function write(name, body = name) {
  fs.writeFileSync(path.join(uploads, name), body);
}

test('pending files and temporaries are not candidates at all', () => {
  // Pending files belong to nobody (the sweeper takes them within the
  // half hour) and a dotfile is a half-written `.part` temporary.
  assert.deepEqual(
    candidateFiles(['a.jpg', 'pending-b.jpg', '.c1d2.part', 'd-face.jpg', '.DS_Store']),
    ['a.jpg', 'd-face.jpg']
  );
});

test('a file no row references is listed, never copied', async () => {
  // An unconfirmed care-check photo, or one whose best-effort unlink
  // failed on delete. Publishing it would make content the database has
  // forgotten permanently fetchable at its old URL.
  write('orphan.jpg');
  write('owned.jpg');
  referenced = ['owned.jpg'];

  const result = await publishBacklog({ log: quiet });

  assert.deepEqual(result.unreferenced, ['orphan.jpg']);
  assert.equal(objects.has('orphan.jpg'), false, 'an orphan must not reach the bucket');
  assert.ok(objects.has('owned.jpg'));
  fs.unlinkSync(path.join(uploads, 'orphan.jpg'));
  fs.unlinkSync(path.join(uploads, 'owned.jpg'));
  objects.delete('owned.jpg');
});

test('a volume where nothing is referenced is refused too', async () => {
  // The same class one step down: a DATABASE_URL pointing at an empty or
  // unmigrated database makes every file look unreferenced, and the run
  // would print DONE having copied nothing.
  write('lonely.jpg');
  const previous = referenced;
  referenced = [];
  try {
    await assert.rejects(
      () => publishBacklog({ log: quiet }),
      /not one is referenced by a row/
    );
  } finally {
    referenced = previous;
    fs.unlinkSync(path.join(uploads, 'lonely.jpg'));
  }
});

test('an empty uploads directory is refused, not reported as success', async () => {
  // config/upload.js CREATES the directory on import, so a wrong
  // UPLOADS_DIR would otherwise print "0 files, nothing to copy" and exit
  // 0 — the silent failure this script exists to prevent, in itself.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-backlog-empty-'));
  const previous = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = empty;
  for (const key of Object.keys(require.cache)) {
    if (key.includes('config/storage') || key.includes('config/upload') || key.includes('publish-backlog')) {
      delete require.cache[key];
    }
  }
  try {
    const fresh = require('../scripts/publish-backlog');
    await assert.rejects(() => fresh.publishBacklog({ log: quiet }), /No files under/);
  } finally {
    process.env.UPLOADS_DIR = previous;
    fs.rmSync(empty, { recursive: true, force: true });
    for (const key of Object.keys(require.cache)) {
      if (key.includes('config/storage') || key.includes('config/upload') || key.includes('publish-backlog')) {
        delete require.cache[key];
      }
    }
    const pool = require('../src/config/db');
    pool.query = async () => ({
      rows: referenced.map((name) => ({ url: `https://pati-app.com/uploads/${name}` })),
    });
    ({ publishBacklog, candidateFiles } = require('../scripts/publish-backlog'));
  }
});

test('a first run copies the backlog up', async () => {
  write('one.jpg');
  write('two.jpg');
  write('two-face.jpg');
  write('pending-three.jpg');
  write('.half.part');
  referenced = ['one.jpg', 'two.jpg', 'two-face.jpg'];

  const result = await publishBacklog({ log: quiet });

  assert.equal(result.total, 3);
  assert.deepEqual(result.published.sort(), ['one.jpg', 'two-face.jpg', 'two.jpg']);
  assert.deepEqual(result.failed, []);
  assert.equal(objects.get('one.jpg').toString(), 'one.jpg');
  assert.equal(objects.has('pending-three.jpg'), false, 'a pending file belongs to nobody');
  assert.equal(objects.has('.half.part'), false, 'a temp file is not a photo');
});

test('a second run uploads nothing', async () => {
  const puts = () => seen.filter((s) => s.startsWith('PUT')).length;
  const before = puts();

  const result = await publishBacklog({ log: quiet });

  assert.equal(result.published.length, 0);
  assert.equal(result.skipped.length, 3);
  assert.equal(puts(), before, 'nothing should have been re-uploaded');
});

test('--dry-run reports without writing', async () => {
  write('fresh.jpg');
  referenced = [...referenced, 'fresh.jpg'];
  const before = objects.size;

  const result = await publishBacklog({ dryRun: true, log: quiet });

  assert.deepEqual(result.published, ['fresh.jpg']);
  assert.equal(objects.size, before, 'a dry run must not write');
});

test('one bad file does not abandon the rest', async () => {
  write('good-a.jpg');
  write('bad.jpg');
  write('good-b.jpg');
  referenced = [...referenced, 'good-a.jpg', 'bad.jpg', 'good-b.jpg'];
  failKeys = new Set(['bad.jpg']);
  try {
    const result = await publishBacklog({ log: quiet });

    assert.deepEqual(result.failed, ['bad.jpg']);
    assert.ok(result.published.includes('good-a.jpg'));
    assert.ok(result.published.includes('good-b.jpg'));
    assert.ok(result.published.includes('fresh.jpg'), 'the dry run left it unpublished');
  } finally {
    failKeys = new Set();
  }
});

test('it refuses to run without a bucket, instead of doing nothing quietly', async () => {
  // A fresh module instance with the configuration missing: the failure
  // this script prevents is silent, so its own must not be.
  const restore = { ...process.env };
  delete process.env.S3_BUCKET;
  for (const key of Object.keys(require.cache)) {
    if (key.includes('config/storage') || key.includes('publish-backlog')) delete require.cache[key];
  }
  try {
    const fresh = require('../scripts/publish-backlog');
    await assert.rejects(() => fresh.publishBacklog({ log: quiet }), /No bucket is configured/);
  } finally {
    Object.assign(process.env, restore);
  }
});
