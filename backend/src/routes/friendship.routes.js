const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  sendRequest,
  acceptRequest,
  removeFriendship,
  listMyFriendships,
} = require('../controllers/friendship.controller');

const router = express.Router();

router.get('/me', requireAuth, listMyFriendships);
router.post('/', requireAuth, sendRequest);
router.post('/:id/accept', requireAuth, acceptRequest);
router.delete('/:id', requireAuth, removeFriendship);

module.exports = router;
