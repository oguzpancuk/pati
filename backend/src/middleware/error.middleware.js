function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Kaynak bulunamadı' });
}

// multer's refusals are the client's fault, not ours: a file over the
// size cap, more files than the route takes, or a field the route does
// not know. They used to surface as a 500 with multer's English message.
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Fotoğraf en fazla 10 MB olabilir',
  LIMIT_FILE_COUNT: 'Bu istek için çok fazla fotoğraf gönderildi',
  LIMIT_UNEXPECTED_FILE: 'Bu istek için çok fazla fotoğraf gönderildi',
};

function errorHandler(err, req, res, next) {
  if (err?.name === 'MulterError') {
    return res
      .status(400)
      .json({ error: MULTER_MESSAGES[err.code] || 'Fotoğraf yüklenemedi', code: err.code });
  }
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Sunucu hatası' });
}

module.exports = { notFoundHandler, errorHandler };
