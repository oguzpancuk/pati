const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const {
  listNotifications,
  getUnreadCount,
  markRead,
  registerDeviceToken,
  removeDeviceToken,
} = require('../controllers/notification.controller');

const router = express.Router();

router.get('/', requireAuth, listNotifications);
router.get('/unread-count', requireAuth, getUnreadCount);
router.post('/read', requireAuth, markRead);
// Where a push would go; no sender yet (see notification.controller.js).
router.post('/device-tokens', requireAuth, limits.deviceTokens, registerDeviceToken);
router.delete('/device-tokens', requireAuth, limits.deviceTokens, removeDeviceToken);

module.exports = router;
