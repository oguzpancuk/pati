const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { getMe, getMyAnimals } = require('../controllers/user.controller');

const router = express.Router();

router.get('/me', requireAuth, getMe);
router.get('/me/animals', requireAuth, getMyAnimals);

module.exports = router;
