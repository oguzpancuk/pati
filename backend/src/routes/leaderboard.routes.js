const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { getLeaderboard } = require('../controllers/leaderboard.controller');

const router = express.Router();

router.get('/', requireAuth, getLeaderboard);

module.exports = router;
