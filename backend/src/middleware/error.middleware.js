function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Kaynak bulunamadı' });
}

// multer's refusals are the client's fault, not ours: a file over the
// size cap, more files than the route takes, or a field the route does
// not know. They used to surface as a 500 with multer's English message.
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Fotoğraf en fazla 10 MB olabilir',
  LIMIT_FILE_COUNT: 'Bu istek için çok fazla fotoğraf gönderildi',
  // Raised both for one file too many under a known field and for a field
  // the route does not take; one message covers both.
  LIMIT_UNEXPECTED_FILE: 'Beklenmeyen bir dosya alanı ya da çok fazla fotoğraf gönderildi',
};

function errorHandler(err, req, res, next) {
  if (err?.name === 'MulterError') {
    return res
      .status(400)
      .json({ error: MULTER_MESSAGES[err.code] || 'Fotoğraf yüklenemedi', code: err.code });
  }
  console.error(err);
  const status = err.status || 500;
  // A thrown error can carry a machine-readable reason the clients branch
  // on, the way the controllers' own `res.json` answers do. Forwarding it
  // is what makes a code set on a throw mean anything at all: the upload
  // resizer's `photoUnreadable` and its `photoIndex` were being dropped
  // here, so the batch refusal it added could not prune the strip that the
  // client already knows how to prune (review finding).
  const body = { error: err.message || 'Sunucu hatası' };
  if (status < 500) {
    if (err.code) body.code = err.code;
    if (Number.isInteger(err.photoIndex)) body.photoIndex = err.photoIndex;
  }
  res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
