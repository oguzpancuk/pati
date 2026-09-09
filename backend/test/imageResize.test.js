/**
 * The upload resizer (NOTES §3.2): every photo the server stores must be a
 * fitted, EXIF-baked JPEG, and a file sharp cannot read must survive
 * untouched rather than failing the upload. These tests drive the
 * middleware directly against files in a temp directory — no server, no
 * multer, no database.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const {
  resizeUploads,
  MAX_EDGE,
  AVATAR_MAX_EDGE,
} = require('../src/middleware/imageResize.middleware');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-resize-'));

/** Writes a file into the temp dir and returns multer's shape for it. */
async function upload(name, buffer) {
  const full = path.join(dir, name);
  await fs.promises.writeFile(full, buffer);
  return { filename: name, path: full, mimetype: 'image/jpeg', size: buffer.length };
}

function photo(width, height, format = 'jpeg') {
  return sharp({
    create: { width, height, channels: 3, background: '#c8842a' },
  })
    [format]()
    .toBuffer();
}

/** Runs the middleware over one request shape and returns nothing. */
function run(req, options) {
  return new Promise((resolve, reject) => {
    resizeUploads(options)(req, {}, (err) => (err ? reject(err) : resolve()));
  });
}

test('a large photo is fitted to the long edge', async () => {
  const file = await upload('big.jpg', await photo(3000, 2000));
  const before = file.size;
  await run({ file });

  const meta = await sharp(file.path).metadata();
  assert.equal(meta.width, MAX_EDGE);
  assert.equal(meta.height, Math.round((2000 / 3000) * MAX_EDGE));
  assert.ok(file.size < before, 'the rewritten file should be smaller');
  assert.equal(file.filename, 'big.jpg');
});

test('a small photo is never enlarged', async () => {
  const file = await upload('small.jpg', await photo(320, 240));
  await run({ file });

  const meta = await sharp(file.path).metadata();
  assert.equal(meta.width, 320);
  assert.equal(meta.height, 240);
});

test('a png becomes a jpg and leaves nothing behind', async () => {
  const file = await upload('shot.png', await photo(2000, 2000, 'png'));
  await run({ file });

  assert.equal(file.filename, 'shot.jpg');
  assert.equal(file.mimetype, 'image/jpeg');
  assert.equal(path.basename(file.path), 'shot.jpg');
  assert.equal(fs.existsSync(path.join(dir, 'shot.png')), false);
  assert.equal((await sharp(file.path).metadata()).format, 'jpeg');
});

test('the pending prefix survives the rename', async () => {
  const file = await upload('pending-1-ab.png', await photo(800, 600, 'png'));
  await run({ file });

  assert.equal(file.filename, 'pending-1-ab.jpg');
});

test('avatars are fitted to their own, smaller edge', async () => {
  const file = await upload('avatar.jpg', await photo(2000, 2000));
  await run({ file }, { maxEdge: AVATAR_MAX_EDGE });

  assert.equal((await sharp(file.path).metadata()).width, AVATAR_MAX_EDGE);
});

test('a file sharp cannot decode is kept exactly as it arrived', async () => {
  const bytes = Buffer.from('not an image at all');
  const file = await upload('broken.jpg', bytes);
  await run({ file });

  assert.equal(file.filename, 'broken.jpg');
  assert.equal(file.size, bytes.length);
  assert.deepEqual(await fs.promises.readFile(file.path), bytes);
});

test('the fields shape (several named sets) is resized too', async () => {
  const req = {
    files: {
      photo: [await upload('f1.jpg', await photo(2400, 2400))],
      photos: [
        await upload('f2.jpg', await photo(2400, 2400)),
        await upload('f3.jpg', await photo(2400, 2400)),
      ],
    },
  };
  await run(req);

  for (const file of [...req.files.photo, ...req.files.photos]) {
    assert.equal((await sharp(file.path).metadata()).width, MAX_EDGE);
  }
});

test('the array shape is resized too', async () => {
  const req = { files: [await upload('a1.jpg', await photo(2400, 1200))] };
  await run(req);

  assert.equal((await sharp(req.files[0].path).metadata()).width, MAX_EDGE);
});

test('a request with no upload passes straight through', async () => {
  await run({});
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
