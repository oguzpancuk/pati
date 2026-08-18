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
    const result = await pool.query(
      'SELECT id, role, suspended_at, suspended_reason FROM users WHERE id = $1',
      [payload.userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Oturumunuz geçersiz, lütfen tekrar giriş yapın' });
    }

    const user = result.rows[0];
    // JWT'nin kendisi iptal edilemiyor (bkz. docs/NOTLAR.md), bu yüzden askıya
    // alma her istekte veritabanından kontrol ediliyor. Askıya alınan kullanıcı
    // token'ı elinde olsa bile hiçbir şey yapamıyor.
    if (user.suspended_at) {
      return res.status(403).json({
        error: user.suspended_reason
          ? `Hesabınız askıya alındı: ${user.suspended_reason}`
          : 'Hesabınız askıya alındı.',
        suspended: true,
      });
    }

    req.user = { ...payload, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

// requireAuth'tan sonra kullanılır; rolü veritabanından okunmuş olur, yani
// token'daki eski rol bilgisi yetki yükseltmek için kullanılamaz.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekiyor' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
