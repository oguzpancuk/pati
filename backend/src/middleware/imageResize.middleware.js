/**
 * Shrinks every uploaded image in place, the moment multer has written it.
 *
 * Until this existed a phone's 4000x3000, 8 MB original was stored and then
 * downloaded again by every viewer — the "images are never resized" half of
 * the photo debt (NOTES §3.2). Re-encoding at 1600 px turns a typical street
 * photo into ~200 KB with no visible loss at the sizes the clients render.
 *
 * The file is also EXIF-rotated here, so what is stored is what is shown:
 * downstream `sharp(...).rotate()` calls (the AI's `imagePart`, the face
 * thumbnail) become no-ops on our own files and keep working unchanged on
 * anything older. A transparent image stays a PNG — JPEG has no alpha, and
 * flattening a sponsor's logo onto black is a visible defect.
 *
 * **Fails open.** A file sharp cannot decode (HEIC on the prebuilt binaries,
 * a corrupt upload) is left exactly as it arrived — the same bytes the
 * server would have stored before this middleware existed. Rejecting it
 * here would turn a photo the AI screening already handles gracefully into
 * a failed upload.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_EDGE = 1600;
// Avatars are rendered at 40–120 pt; a full-size portrait is pure waste.
const AVATAR_MAX_EDGE = 512;
const QUALITY = 82;

/** Every file multer may have attached, whichever shape the route used. */
function uploadedFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return [];
}

/**
 * Rewrites one upload as a fitted image and gives it the extension of what
 * it actually is, updating the multer file object the controllers read
 * (`filename` is what ends up in the database, so it must change with the
 * file). Returns false when the original was kept.
 */
async function shrink(file, maxEdge) {
  const source = sharp(file.path).rotate();

  let meta;
  try {
    meta = await source.metadata();
  } catch (err) {
    console.warn(`[uploads] left ${file.filename} unresized: ${err?.message ?? err}`);
    return false;
  }

  // A transparent image stays a PNG. JPEG has no alpha, and sharp puts
  // BLACK behind it — which on an advertiser's logo (the one surface with a
  // paying customer) or a user's avatar is a black tile where the
  // background should show through (review finding).
  const alpha = meta.hasAlpha === true;

  let body;
  try {
    const fitted = source
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      // iPhones shoot Display-P3. Dropping the profile leaves P3 numbers to
      // be read as sRGB, which is a duller, shifted photo — invisible in a
      // test and obvious to the person who took it (review finding).
      .keepIccProfile();
    body = await (alpha ? fitted.png({ compressionLevel: 9 }) : fitted.jpeg({ quality: QUALITY }))
      .toBuffer();
  } catch (err) {
    console.warn(`[uploads] left ${file.filename} unresized: ${err?.message ?? err}`);
    return false;
  }

  const dir = path.dirname(file.path);
  const name = `${path.basename(file.filename, path.extname(file.filename))}${alpha ? '.png' : '.jpg'}`;
  const target = path.join(dir, name);

  // Through a temp file, and the original goes FIRST. `IMG_4821.JPG` and
  // `IMG_4821.jpg` are different strings and the same file on a
  // case-insensitive filesystem (macOS, where the screenshot checks run):
  // writing the target and then unlinking the "other" name deleted the
  // photo that had just been written (review finding).
  const temp = path.join(dir, `.${crypto.randomUUID()}.part`);
  await fs.promises.writeFile(temp, body);
  await fs.promises.unlink(file.path).catch(() => {});
  await fs.promises.rename(temp, target);

  file.filename = name;
  file.path = target;
  file.mimetype = alpha ? 'image/png' : 'image/jpeg';
  file.size = body.length;
  return true;
}

function resizeUploads({ maxEdge = MAX_EDGE } = {}) {
  return async function resizeUploadsMiddleware(req, res, next) {
    try {
      for (const file of uploadedFiles(req)) await shrink(file, maxEdge);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { resizeUploads, MAX_EDGE, AVATAR_MAX_EDGE, QUALITY };
