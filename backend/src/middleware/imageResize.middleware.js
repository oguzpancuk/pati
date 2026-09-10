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
 * **A file sharp cannot decode is refused**, not stored. This used to fail
 * open — the original bytes were kept, on the reasoning that a failed
 * upload is worse than an unresized one. It is not, and the reason is
 * privacy rather than size: an undecodable file is one whose metadata we
 * cannot strip, and every upload is served publicly at `/uploads/<name>`.
 * A HEIC straight off a phone carries the GPS coordinates, capture time
 * and device model of wherever it was taken, and the privacy notice tells
 * the reader location is only ever taken at the moment they act (review
 * finding). A successful re-encode is metadata-free because sharp copies
 * none of it; the only way to be sure is to have re-encoded.
 *
 * The clients this affects: the app pins its picker to PHPicker's
 * compatibility representation (`mobile/src/photoPicker.ts`), so what it
 * sends is a JPEG by contract rather than by Apple's discretion — camera
 * captures are JPEG regardless. The web PWA's `accept="image/*"` can still
 * produce a HEIC on Safari, and that upload gets a Turkish 400 asking for
 * a different format instead of silently publishing the photo's GPS.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_EDGE = 1600;
// Avatars are rendered at 40–120 pt; a full-size portrait is pure waste.
const AVATAR_MAX_EDGE = 512;
const QUALITY = 82;

/**
 * The refusal for a file we cannot read. The user's half says what to do
 * about it; the real reason goes to the log, since sharp's own message
 * ("Input file contains unsupported image format") is English and tells
 * them nothing.
 */
function undecodable(file, err, photoIndex) {
  console.warn(`[uploads] refused ${file.filename}: ${err?.message ?? err}`);
  return Object.assign(
    new Error('Bu fotoğraf biçimini okuyamadık. JPEG veya PNG olarak dener misin?'),
    // `/animals/match` and `/animals/:id/care-photos` take several photos in
    // one request, and one bad file refuses the batch. Without the index the
    // user re-picks and bisects by hand; the clients already know how to
    // prune a strip from `photoIndex`, because `photoRejected` carries one
    // (fourth review round).
    { status: 400, code: 'photoUnreadable', photoIndex }
  );
}

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
 * file). Throws a Turkish 400 for anything sharp cannot read.
 */
async function shrink(file, maxEdge, index) {
  // Only an image that is ACTUALLY see-through stays a PNG. JPEG has no
  // alpha and sharp puts black behind it, which on an advertiser's logo or
  // a user's avatar is a black tile — but `hasAlpha` is true for any RGBA
  // file, opaque or not, and a phone screenshot is RGBA. Keeping those as
  // PNG made a 2000x1500 upload 6,3 MB where JPEG gives 0,77 MB: eight
  // times the storage and bandwidth this middleware exists to save (second
  // review round). `stats()` reads every pixel, so it is only asked when
  // there is an alpha channel to ask about.
  let alpha = false;
  try {
    alpha = (await sharp(file.path).metadata()).hasAlpha === true;
    if (alpha) alpha = !(await sharp(file.path).stats()).isOpaque;
  } catch (err) {
    throw undecodable(file, err, index);
  }

  let body;
  try {
    const fitted = sharp(file.path)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      // iPhones shoot Display-P3. Dropping the profile leaves P3 numbers to
      // be read as sRGB, which is a duller, shifted photo — invisible in a
      // test and obvious to the person who took it (review finding).
      .keepIccProfile();
    body = await (alpha ? fitted.png({ compressionLevel: 9 }) : fitted.jpeg({ quality: QUALITY }))
      .toBuffer();
  } catch (err) {
    throw undecodable(file, err, index);
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
      const files = uploadedFiles(req);
      for (const [i, file] of files.entries()) await shrink(file, maxEdge, i);
      next();
    } catch (err) {
      // Multer has already written every part to the volume, and this
      // throws BEFORE any controller runs — so the controllers' own
      // discard paths never get the chance, and the sweeper only knows
      // `pending-` and `.part`. Without this each refusal parks a file
      // nothing references and nothing reclaims: at the avatar route's
      // 15/hour that is 150 MB an hour from one account, and the very
      // bytes this middleware refuses in order not to publish would sit
      // on the disk anyway (review finding).
      for (const file of uploadedFiles(req)) {
        await fs.promises.unlink(file.path).catch(() => {});
      }
      next(err);
    }
  };
}

module.exports = { resizeUploads, MAX_EDGE, AVATAR_MAX_EDGE, QUALITY };
