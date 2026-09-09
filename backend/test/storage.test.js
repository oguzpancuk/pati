/**
 * The S3 driver, against a fake bucket — the same shape as the AI check's
 * fake `generateContent` endpoint: a real HTTP server on a loopback port,
 * so the SDK signs and sends exactly as it would to R2, and the assertions
 * are about what arrives.
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

const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-storage-'));

/** key -> bytes, plus the log of what the SDK actually asked for. */
const objects = new Map();
const seen = [];
// Set for a whole test: the SDK retries a 5xx, so one refusal is not enough.
let failPuts = false;

const server = http.createServer((req, res) => {
  const key = decodeURIComponent(req.url.replace(/^\/pati-test\//, '').split('?')[0]);
  seen.push(`${req.method} ${key}`);
  if (req.method === 'PUT') {
    if (failPuts) {
      res.writeHead(500).end('<Error><Code>InternalError</Code></Error>');
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      objects.set(key, Buffer.concat(chunks));
      res.writeHead(200, { ETag: '"x"' }).end();
    });
    return;
  }
  if (req.method === 'GET') {
    const body = objects.get(key);
    if (!body) {
      res
        .writeHead(404, { 'Content-Type': 'application/xml' })
        .end('<Error><Code>NoSuchKey</Code></Error>');
      return;
    }
    res.writeHead(200, { 'Content-Length': body.length }).end(body);
    return;
  }
  if (req.method === 'DELETE') {
    objects.delete(key);
    res.writeHead(204).end();
    return;
  }
  res.writeHead(405).end();
});

const listening = new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

let storage;
test.before(async () => {
  await listening;
  process.env.UPLOADS_DIR = uploads;
  process.env.S3_ENDPOINT = `http://127.0.0.1:${server.address().port}`;
  process.env.S3_BUCKET = 'pati-test';
  process.env.S3_ACCESS_KEY_ID = 'test-key';
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
  storage = require('../src/config/storage');
});

test.after(() => {
  server.close();
  fs.rmSync(uploads, { recursive: true, force: true });
});

test('the driver reports itself as remote once configured', () => {
  assert.equal(storage.isRemote(), true);
  assert.match(storage.describe(), /^s3 /);
});

test('publish puts the bytes on disk into the bucket', async () => {
  fs.writeFileSync(path.join(uploads, 'a.jpg'), 'first photo');
  await storage.publish('a.jpg');

  assert.equal(objects.get('a.jpg').toString(), 'first photo');
});

test('publish throws when the bucket refuses, so the caller can fail the upload', async () => {
  fs.writeFileSync(path.join(uploads, 'b.jpg'), 'second photo');
  failPuts = true;
  try {
    await assert.rejects(() => storage.publish('b.jpg'), (err) => {
      // Turkish and actionable, not the SDK's "UnknownError".
      assert.equal(err.status, 503);
      assert.match(err.message, /tekrar dener misin/);
      return true;
    });
  } finally {
    failPuts = false;
  }
  assert.equal(objects.has('b.jpg'), false);
});

test('a path is never allowed to escape the uploads folder', async () => {
  fs.writeFileSync(path.join(uploads, 'c.jpg'), 'third photo');
  await storage.publish('../../etc/c.jpg');

  assert.equal(objects.get('c.jpg').toString(), 'third photo');
  assert.equal(await storage.localPath('../../etc/passwd'), null);
});

test('a local file is served without asking the bucket', async () => {
  fs.writeFileSync(path.join(uploads, 'local.jpg'), 'cached');
  const before = seen.length;

  assert.equal(await storage.localPath('local.jpg'), path.join(uploads, 'local.jpg'));
  assert.equal(seen.length, before, 'no request should have been made');
});

test('a cold file is pulled out of the bucket and cached', async () => {
  objects.set('cold.jpg', Buffer.from('from the bucket'));

  const full = await storage.localPath('cold.jpg');
  assert.equal(fs.readFileSync(full, 'utf8'), 'from the bucket');
  assert.ok(seen.includes('GET cold.jpg'));

  // Second read is a cache hit: no further request.
  const before = seen.length;
  await storage.localPath('cold.jpg');
  assert.equal(seen.length, before);
});

test('a file that exists nowhere answers null rather than throwing', async () => {
  assert.equal(await storage.localPath('missing.jpg'), null);
});

test('remove drops the object and swallows a failure', async () => {
  objects.set('gone.jpg', Buffer.from('bye'));
  await storage.remove('gone.jpg');
  assert.equal(objects.has('gone.jpg'), false);

  // A key that was never there is not an error for the caller.
  await storage.remove('never-existed.jpg');
});

test('no temp file is left behind by a cache fill', async () => {
  objects.set('temp-check.jpg', Buffer.from('x'));
  await storage.localPath('temp-check.jpg');

  assert.deepEqual(
    fs.readdirSync(uploads).filter((n) => n.endsWith('.part')),
    []
  );
});
