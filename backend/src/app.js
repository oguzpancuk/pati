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
const reportRoutes = require('./routes/report.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { UPLOADS_DIR } = require('./config/upload');
const rateLimit = require('express-rate-limit');

const app = express();

// Behind Fly / a reverse proxy: read req.protocol and the IP from proxy
// headers. Photo URLs are built from req.protocol; without this an https
// site produced http:// photo links that browsers blocked.
app.set('trust proxy', 1);

// CORS: in production only our own origins may make browser calls. Requests
// WITHOUT an Origin header (the native app, curl, server-to-server) always
// pass — CORS only governs browsers. With CORS_ORIGINS unset (development,
// LAN testing via http://<ip>:5175) everything is allowed, as before.
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors(
    corsOrigins.length
      ? { origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)) }
      : {}
  )
);
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Brute-force brake for login/registration. Auth endpoints only: the rest
// are JWT-protected, and a client opening the map fires many requests fast.
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

// The installable landing page (public/): manifest, service worker, icons.
// Not a web version of the app; a shortcut plus a quick "is there food/water
// near me" glance. Keeping the service worker uncached matters: a browser
// that reads an old sw.js never receives updates.
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
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

// In production the built clients are served from this same Node process:
// one deploy, /api on the same origin (no proxy/CORS hassle). Which client
// is served depends on the host name: ADMIN_HOST (admin.pati-app.com) → the
// admin panel (admin/dist); everything else → the web PWA (web/dist). In
// development Vite serves itself; missing dist folders are skipped.
const WEB_DIST_DIR = process.env.WEB_DIST_DIR || path.join(__dirname, '..', '..', 'web', 'dist');
const ADMIN_DIST_DIR =
  process.env.ADMIN_DIST_DIR || path.join(__dirname, '..', '..', 'admin', 'dist');
const ADMIN_HOST = process.env.ADMIN_HOST || null;

function serveSpa(distDir, match) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) return;
  const statics = express.static(distDir, {
    setHeaders(res, filePath) {
      // Never cache sw.js and index.html; hashed assets can live long.
      if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\/assets\//.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  app.use((req, res, next) => (match(req) ? statics(req, res, next) : next()));
  // SPA fallback: client routes like /hayvanlar/12 fall through to
  // index.html; API and file paths matched earlier.
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
