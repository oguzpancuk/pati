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
const messageRoutes = require('./routes/message.routes');
const notificationRoutes = require('./routes/notification.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { UPLOADS_DIR } = require('./config/upload');
const storage = require('./config/storage');
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
// The volume first — when the file is on this machine, this is byte for
// byte what it always was. The fallback only runs on a miss, and only does
// anything when a bucket is configured: it pulls the object into the cache
// so a second machine (or a restored volume) can serve what it never
// received itself (src/config/storage.js).
// Only misses reach here — a normal reader is served by express.static
// above — and only misses that FAIL are counted. Uncapped,
// `GET /uploads/<random>.jpg` in a loop was a free way to run up somebody's
// R2 bill; counting successes too would have broken the one case the
// fallback exists for, a cold cache after a volume restore, where every
// image on every screen is a miss and one person browsing galleries behind
// a carrier NAT would have hit the ceiling in a minute (second review
// round). What is left counted is exactly the loop over names that are not
// there.
const uploadsMissLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen biraz sonra tekrar dene.' },
});

app.use(
  '/uploads',
  // The extension is chosen by the server (config/upload.js), but nosniff
  // is the belt to that braces: this mount answers on the app AND the admin
  // host, so anything a browser decided to treat as HTML here would run in
  // the origin that holds the JWT (second review round).
  express.static(UPLOADS_DIR, {
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
  uploadsMissLimit,
  async (req, res, next) => {
    let name;
    try {
      name = decodeURIComponent(req.path.slice(1));
    } catch {
      // A malformed percent-escape (`/uploads/%zz`): serve-static answers
      // 400 and falls through, and an unguarded decode here turned that
      // into an English "URI malformed" 500 (review finding). It is a 404
      // like any other name that does not exist.
      return next();
    }
    try {
      const file = await storage.localPath(name);
      if (!file) return next();
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(file);
    } catch (err) {
      next(err);
    }
  }
);
// The showcase animals' photos ship inside the image, not on the uploads
// volume: the seed can then run against any environment (and `--remove`
// leaves no orphaned files behind). A day of caching, not more: the names
// are stable (`cat-tekir.png`), so redrawn art has to reach returning
// browsers within a deploy or two (review finding).
app.use(
  '/demo',
  express.static(path.join(__dirname, '..', 'demo-assets'), { maxAge: '1d', fallthrough: true })
);

// Brute-force brake for login/registration. Auth endpoints only: the rest
// are JWT-protected, and a client opening the map fires many requests fast.
// Development only: the curl check harnesses fire more credential-shaped
// requests in a minute than this brake allows. Ignored in production.
const authRateLimit =
  process.env.NODE_ENV !== 'production' && Number(process.env.AUTH_RATE_LIMIT) > 0
    ? Number(process.env.AUTH_RATE_LIMIT)
    : 30;
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRateLimit,
    // GET /providers is not a credential attempt: every client reads it once
    // per page load, and counting it would let ordinary traffic from one
    // shared IP (a campus, a carrier NAT) spend the login budget.
    skip: (req) => req.method === 'GET' && req.path === '/providers',
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
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
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
  app.get(/^\/(?!api\/|uploads\/|demo(\/|$)).*/, (req, res, next) => {
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
