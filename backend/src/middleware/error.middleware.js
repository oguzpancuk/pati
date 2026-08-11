function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Kaynak bulunamadı' });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Sunucu hatası' });
}

module.exports = { notFoundHandler, errorHandler };
