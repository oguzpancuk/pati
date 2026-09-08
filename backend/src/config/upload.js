const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

// In production (Fly.io) this writes to the persistent volume
// (UPLOADS_DIR=/data/uploads); in development, the in-repo uploads/.
// Moving to object storage is on the roadmap.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Files that no row references yet — the add-animal match step keeps its
// screened photos behind a photoToken until the create step redeems them,
// and most match calls never reach a create (the user picks an existing
// animal, or goes back). They carry this prefix so the sweeper below can
// tell them from real photos without consulting the database; redeeming a
// token renames the file into the plain form (see redeemPhotoToken).
const PENDING_PREFIX = 'pending-';
// Longer than the token's fifteen minutes plus the clients' upload window.
const PENDING_MAX_AGE_MS = 30 * 60 * 1000;
const PENDING_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function makeStorage(prefix = '') {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${prefix}${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });
}

function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    // The client's fault, so a 400 (the error handler reads `status`);
    // without it this was a 500 with a stack trace in the log.
    return cb(Object.assign(new Error('Yalnızca resim dosyaları kabul edilir'), { status: 400 }));
  }
  cb(null, true);
}

const limits = { fileSize: 10 * 1024 * 1024 };
const upload = multer({ storage: makeStorage(), fileFilter, limits });
const pendingUpload = multer({ storage: makeStorage(PENDING_PREFIX), fileFilter, limits });

/** The plain name a pending file takes once a row is about to own it. */
function pendingToFinal(name) {
  return name.startsWith(PENDING_PREFIX) ? name.slice(PENDING_PREFIX.length) : name;
}

/**
 * Deletes pending files older than PENDING_MAX_AGE_MS. Safe by construction:
 * a pending file is never referenced by a row (a redeem renames it first),
 * so age is the only question. Runs at boot — the machine autostops when
 * idle, so an interval alone would miss whatever was left when it went
 * down — and every few minutes after. Errors are logged, never thrown.
 */
async function sweepPendingUploads() {
  let names;
  try {
    names = await fs.promises.readdir(UPLOADS_DIR);
  } catch (err) {
    console.warn(`[uploads] sweep could not read ${UPLOADS_DIR}: ${err?.message ?? err}`);
    return 0;
  }
  const cutoff = Date.now() - PENDING_MAX_AGE_MS;
  let removed = 0;
  for (const name of names) {
    if (!name.startsWith(PENDING_PREFIX)) continue;
    const full = path.join(UPLOADS_DIR, name);
    try {
      const stat = await fs.promises.stat(full);
      if (stat.mtimeMs < cutoff) {
        await fs.promises.unlink(full);
        removed += 1;
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') console.warn(`[uploads] sweep ${name}: ${err?.message ?? err}`);
    }
  }
  if (removed > 0) console.log(`[uploads] swept ${removed} pending file(s) nobody redeemed`);
  return removed;
}

function startPendingSweeper() {
  sweepPendingUploads();
  const timer = setInterval(sweepPendingUploads, PENDING_SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = {
  upload,
  pendingUpload,
  pendingToFinal,
  sweepPendingUploads,
  startPendingSweeper,
  PENDING_PREFIX,
  PENDING_MAX_AGE_MS,
  UPLOADS_DIR,
};
