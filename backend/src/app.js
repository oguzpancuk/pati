const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const careRoutes = require('./routes/care.routes');
const animalRoutes = require('./routes/animal.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { UPLOADS_DIR } = require('./config/upload');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/care-actions', careRoutes);
app.use('/api/animals', animalRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
