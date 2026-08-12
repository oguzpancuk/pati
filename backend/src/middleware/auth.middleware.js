const pool = require('../config/db');
const { verifyToken } = require('../utils/jwt');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkilendirme başlığı eksik' });
  }

  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
  }

  try {
    // Token geçerli olsa bile kullanıcı silinmiş olabilir (örn. geliştirme sırasında
    // veritabanı sıfırlandığında). Bu durumda istemcinin oturumu temizleyip yeniden
    // giriş yapabilmesi için 401 dönüyoruz; aksi halde her istek anlamsız bir hataya
    // dönüşüyor ve uygulama içinde çıkış yapmak imkânsız hale geliyor.
    const result = await pool.query('SELECT id, role FROM users WHERE id = $1', [payload.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Oturumunuz geçersiz, lütfen tekrar giriş yapın' });
    }
    req.user = { ...payload, role: result.rows[0].role };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
