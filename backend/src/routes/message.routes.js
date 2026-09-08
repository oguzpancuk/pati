const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const c = require('../controllers/message.controller');

const router = express.Router();

router.get('/conversations', requireAuth, c.listConversations);
router.post('/direct', requireAuth, limits.messageAdmin, c.openDirect);
router.post('/groups', requireAuth, limits.messageAdmin, c.createGroup);

router.get('/conversations/:id', requireAuth, c.getConversation);
router.put('/conversations/:id', requireAuth, limits.messageAdmin, c.renameGroup);
router.post('/conversations/:id/members', requireAuth, limits.messageAdmin, c.addMember);
router.delete(
  '/conversations/:id/members/:userId',
  requireAuth,
  limits.messageAdmin,
  c.removeMember
);
router.post(
  '/conversations/:id/members/:userId/promote',
  requireAuth,
  limits.messageAdmin,
  c.promoteMember
);
router.post('/conversations/:id/leave', requireAuth, limits.messageAdmin, c.leaveGroup);

router.get('/conversations/:id/messages', requireAuth, c.listMessages);
router.post('/conversations/:id/messages', requireAuth, limits.messages, c.sendMessage);
router.post('/conversations/:id/read', requireAuth, c.markRead);

router.delete('/:id', requireAuth, c.deleteMessage);
router.post('/:id/report', requireAuth, limits.messageReports, c.reportMessage);

module.exports = router;
