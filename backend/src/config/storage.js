/**
 * Where a photo actually lives.
 *
 * Until now the answer was "the machine's disk" — a Fly volume, snapshotted
 * nightly, but single-node and the only copy (NOTES section 3.2, and the
 * launch sprint's first data-safety line). This module makes the answer
 * configurable without moving a single stored URL: photos are still served
 * by us at `/uploads/<file>`, so every row already in the database, every
 * `uploadPathFromUrl` and every delete path keeps working untouched.
 *
 * Two drivers:
 *
 * - **disk** (the default, and what runs with no configuration): exactly
 *   today's behaviour, byte for byte.
 * - **s3**: an S3-compatible bucket — Cloudflare R2 is what this was
 *   written for — becomes the copy of record and the volume becomes a
 *   cache. A file is published BEFORE the row that names it is written, so
 *   a bucket outage fails the upload instead of recording a photo nobody
 *   can fetch later. A read that misses the cache pulls the object back
 *   down, which is what lets a second machine serve photos the first one
 *   received.
 *
 * Configuration (all four, or the driver stays on disk):
 *   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 * Optional: S3_REGION (default `auto`, which is R2's), S3_PREFIX.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('./upload');

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const region = process.env.S3_REGION || 'auto';
const prefix = process.env.S3_PREFIX || '';

const remote = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);

let client = null;
let commands = null;
function s3() {
  if (!client) {
    // Required lazily: a disk-only deployment should not pay the SDK's
    // load time, and the test harness swaps the env before requiring.
    const sdk = require('@aws-sdk/client-s3');
    commands = sdk;
    client = new sdk.S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      // R2 and most S3-compatible endpoints address the bucket by path.
      forcePathStyle: true,
    });
  }
  return client;
}

/** True when a bucket is configured; the call sites read this for logging. */
function isRemote() {
  return remote;
}

function keyFor(filename) {
  return `${prefix}${path.basename(filename)}`;
}

// Almost everything is a JPEG after the resizer, but a transparent image
// stays a PNG and a file sharp could not decode keeps whatever it was.
// Stored wrong, the object would be served with the wrong type the day a
// public bucket domain is put in front of it.
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

function contentTypeOf(filename) {
  return CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

/**
 * Makes the bucket own `filename`, whose bytes are on disk right now.
 * Throws on failure — every caller does this before writing the row that
 * names the file, so the request fails rather than the photo going missing.
 * A no-op without a bucket.
 */
async function publish(filename) {
  if (!remote) return;
  const file = path.basename(filename);
  try {
    // Inside the try: a missing local file would otherwise surface as a raw
    // English ENOENT 500, which is exactly what this catch exists to avoid.
    const body = await fs.promises.readFile(path.join(UPLOADS_DIR, file));
    await s3().send(
      new commands.PutObjectCommand({
        Bucket: bucket,
        Key: keyFor(file),
        Body: body,
        ContentType: contentTypeOf(file),
      })
    );
  } catch (err) {
    // The SDK's own message reaches the user through the error handler,
    // and it is English and meaningless to them ("UnknownError"). What
    // they need is that the photo did not stick and retrying is worth it;
    // the real reason goes to the log for us.
    console.error(`[storage] could not publish ${file}: ${err?.message ?? err}`);
    throw Object.assign(new Error('Fotoğraf şu anda kaydedilemedi, birazdan tekrar dener misin?'), {
      status: 503,
    });
  }
}

/**
 * Drops the object behind `filename`. Best-effort and logged: the local
 * copy has already gone by the time this runs, and a stranded object costs
 * a fraction of a cent, while throwing here would turn a successful delete
 * into a 500.
 */
async function remove(filename) {
  if (!remote) return;
  try {
    await s3().send(
      new commands.DeleteObjectCommand({ Bucket: bucket, Key: keyFor(filename) })
    );
  } catch (err) {
    console.warn(`[storage] could not delete ${filename}: ${err?.message ?? err}`);
  }
}

/**
 * The path to read `filename` from, pulling it out of the bucket into the
 * cache when this machine has never seen it. Returns null when the file
 * exists nowhere — the callers answer 404.
 */
async function localPath(filename) {
  const file = path.basename(filename);
  if (!file || file.startsWith('.')) return null;
  const full = path.join(UPLOADS_DIR, file);
  if (fs.existsSync(full)) return full;
  if (!remote) return null;

  let body;
  try {
    const res = await s3().send(
      new commands.GetObjectCommand({ Bucket: bucket, Key: keyFor(file) })
    );
    body = Buffer.from(await res.Body.transformToByteArray());
  } catch (err) {
    if (err?.name !== 'NoSuchKey' && err?.$metadata?.httpStatusCode !== 404) {
      console.warn(`[storage] could not fetch ${file}: ${err?.message ?? err}`);
    }
    return null;
  }
  // Written under a temp name first: two requests for the same cold file
  // must never let one serve the other's half-written bytes. The name has
  // to be unique per REQUEST, not per process — two concurrent misses in
  // one process share a pid (review finding).
  const temp = path.join(UPLOADS_DIR, `.${crypto.randomUUID()}.part`);
  await fs.promises.writeFile(temp, body);
  await fs.promises.rename(temp, full);
  return full;
}

function describe() {
  return remote ? `s3 (${endpoint}/${bucket})` : `disk (${UPLOADS_DIR})`;
}

/**
 * Whether the bucket already holds this object. Only the backlog script
 * uses it, to skip what it has already copied up: without it a second run
 * would re-upload every photo, which is slow and pointlessly billable.
 * A HEAD is a Class-B operation, the cheap kind.
 *
 * `false` on any error that is not a plain 404 as well, on purpose — the
 * caller's next step is to publish, which is the safe thing to do when we
 * cannot tell.
 */
async function exists(filename) {
  if (!remote) return false;
  try {
    await s3().send(
      new commands.HeadObjectCommand({ Bucket: bucket, Key: keyFor(filename) })
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = { isRemote, publish, remove, localPath, exists, describe, keyFor };
