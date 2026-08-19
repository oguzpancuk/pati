const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

// Üretimde (Fly.io) kalıcı volume'a yazılıyor (UPLOADS_DIR=/data/uploads);
// geliştirmede depo içindeki uploads/. Nesne depolamaya geçiş yol haritasında.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Yalnızca resim dosyaları kabul edilir'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = { upload, UPLOADS_DIR };
