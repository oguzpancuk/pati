const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const careRoutes = require('./routes/care.routes');
const animalRoutes = require('./routes/animal.routes');
const friendshipRoutes = require('./routes/friendship.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const adRoutes = require('./routes/ad.routes');
const adminRoutes = require('./routes/admin.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { UPLOADS_DIR } = require('./config/upload');
const rateLimit = require('express-rate-limit');

const app = express();

// Fly/ters proxy arkasında: req.protocol ve IP proxy başlıklarından okunsun.
// Fotoğraf adresleri req.protocol ile kuruluyor; bu olmadan https sitede
// http:// fotoğraf linkleri üretilip tarayıcıda engelleniyordu.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Giriş/kayıt için kaba kuvvet freni. Yalnızca auth uçlarında: diğer uçlar
// JWT ile korunuyor ve haritayı açan istemci kısa sürede çok istek atıyor.
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Çok fazla deneme; 15 dakika sonra tekrar deneyin.' },
  })
);

// Kök adres "ana ekrana eklenebilir" web sayfası (public/): manifest, service
// worker ve ikonlar. Mobil uygulamanın web sürümü değil; kısayol + hızlı
// "yakınımda mama/su var mı" bakışı. Service worker'ın önbelleğe alınmaması
// önemli: tarayıcı sw.js'i eski sürümden okursa güncelleme hiç gelmez.
app.use(
  '/tanitim',
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/care-actions', careRoutes);
app.use('/api/animals', animalRoutes);
app.use('/api/friendships', friendshipRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/admin', adminRoutes);

// Üretimde derlenmiş istemciler aynı Node sürecinden servis ediliyor: tek
// deploy, /api aynı origin (proxy/CORS derdi yok). Hangi istemcinin verileceği
// ana bilgisayar adına göre seçiliyor: ADMIN_HOST (admin.pati-app.com) →
// yönetim paneli (admin/dist), diğer her şey → web PWA (web/dist).
// Geliştirmede Vite kendi sunuyor; dist yoksa ilgili blok atlanır.
const WEB_DIST_DIR = process.env.WEB_DIST_DIR || path.join(__dirname, '..', '..', 'web', 'dist');
const ADMIN_DIST_DIR = process.env.ADMIN_DIST_DIR || path.join(__dirname, '..', '..', 'admin', 'dist');
const ADMIN_HOST = process.env.ADMIN_HOST || null;

function serveSpa(distDir, match) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) return;
  const statics = express.static(distDir, {
    setHeaders(res, filePath) {
      // sw.js ve index.html önbelleğe alınmasın; hash'li asset'ler uzun süre kalsın.
      if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\/assets\//.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  app.use((req, res, next) => (match(req) ? statics(req, res, next) : next()));
  // SPA fallback: /hayvanlar/12 gibi istemci rotaları index.html'e düşer;
  // API ve dosya yolları yukarıda zaten eşleşmiş olur.
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res, next) => {
    if (!match(req) || (req.headers.accept ?? '').indexOf('text/html') === -1) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const isAdminHost = (req) => !!ADMIN_HOST && req.hostname === ADMIN_HOST;
serveSpa(ADMIN_DIST_DIR, isAdminHost);
serveSpa(WEB_DIST_DIR, (req) => !isAdminHost(req));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
