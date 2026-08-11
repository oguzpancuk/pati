const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { listMyNotifications, markRead } = require('../controllers/notification.controller');

const router = express.Router();

router.get('/', requireAuth, listMyNotifications);
router.post('/:id/read', requireAuth, markRead);

module.exports = router;
