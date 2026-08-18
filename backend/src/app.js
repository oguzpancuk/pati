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

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Kök adres "ana ekrana eklenebilir" web sayfası (public/): manifest, service
// worker ve ikonlar. Mobil uygulamanın web sürümü değil; kısayol + hızlı
// "yakınımda mama/su var mı" bakışı. Service worker'ın önbelleğe alınmaması
// önemli: tarayıcı sw.js'i eski sürümden okursa güncelleme hiç gelmez.
app.use(
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

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
