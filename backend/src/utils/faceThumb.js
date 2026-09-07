/**
 * Cuts the square profile picture out of an animal photo around the face
 * box the model returned (ROADMAP P3). The box is Gemini's convention:
 * [ymin, xmin, ymax, xmax] on a 0–1000 grid of the image as sent — and
 * the image was sent EXIF-rotated, so the cut is taken from the rotated
 * pixels too.
 *
 * The square is the face box grown by a margin (ears and a bit of chest
 * read better than a tight crop), centred on the box, clamped to the
 * image, then resized to THUMB_SIZE. Returns the thumbnail's filename
 * (next to the photo in UPLOADS_DIR) or throws when sharp cannot decode.
 */
const path = require('path');
const sharp = require('sharp');
const { UPLOADS_DIR } = require('../config/upload');

const THUMB_SIZE = 320;
const MARGIN = 0.35;

function thumbName(photoFilename) {
  const ext = path.extname(photoFilename);
  return `${path.basename(photoFilename, ext)}-face.jpg`;
}

async function makeFaceThumb(photoFilename, box) {
  const source = sharp(path.join(UPLOADS_DIR, photoFilename)).rotate();
  const { width, height } = await source.metadata();
  const rotated = await source.toBuffer();
  const meta = await sharp(rotated).metadata();
  const w = meta.width ?? width;
  const h = meta.height ?? height;

  const x0 = (box.xmin / 1000) * w;
  const x1 = (box.xmax / 1000) * w;
  const y0 = (box.ymin / 1000) * h;
  const y1 = (box.ymax / 1000) * h;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  let side = Math.max(x1 - x0, y1 - y0) * (1 + MARGIN);
  side = Math.min(side, w, h);
  let left = Math.round(cx - side / 2);
  let top = Math.round(cy - side / 2);
  left = Math.max(0, Math.min(left, w - Math.round(side)));
  top = Math.max(0, Math.min(top, h - Math.round(side)));
  const size = Math.round(side);

  const name = thumbName(photoFilename);
  await sharp(rotated)
    .extract({ left, top, width: size, height: size })
    .resize(THUMB_SIZE, THUMB_SIZE)
    .jpeg({ quality: 82 })
    .toFile(path.join(UPLOADS_DIR, name));
  return name;
}

module.exports = { makeFaceThumb, thumbName, THUMB_SIZE };
