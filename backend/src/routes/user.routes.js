const express = require('express');
const { requireAuth, requireAuthAllowPending } = require('../middleware/auth.middleware');
const { guardDemoUser } = require('../middleware/demo.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { upload } = require('../config/upload');
const {
  getMe,
  uploadAvatar,
  setAvatarKey,
  clearAvatar,
  setFeaturedBadges,
  setShowDemo,
  getUserAnimals,
  getUserComments,
  getMyBadgeAwards,
  markMyBadgeAwardsSeen,
  searchUsers,
  getPublicProfile,
  deleteMyAccount,
} = require('../controllers/user.controller');

const router = express.Router();

// An unverified account may still read itself (the clients learn the pending
// state from here on a cold start) and delete itself (App Store 5.1.1(v):
// deletion must always work). Nothing else opens to it.
router.get('/me', requireAuthAllowPending, getMe);
router.delete('/me', requireAuthAllowPending, limits.accountDelete, deleteMyAccount);
router.post('/me/avatar', requireAuth, limits.avatar, upload.single('photo'), uploadAvatar);
router.put('/me/avatar-key', requireAuth, limits.avatar, setAvatarKey);
router.delete('/me/avatar', requireAuth, clearAvatar);
router.put('/me/featured-badges', requireAuth, setFeaturedBadges);
// Each person's own showcase-world switch (owner, 2026-09-09).
router.put('/me/show-demo', requireAuth, setShowDemo);
router.get('/me/animals', requireAuth, getUserAnimals);
router.get('/me/comments', requireAuth, getUserComments);
router.get('/me/badge-awards', requireAuth, getMyBadgeAwards);
router.post('/me/badge-awards/seen', requireAuth, markMyBadgeAwardsSeen);
router.get('/search', requireAuth, searchUsers);
// '/:id' routes go last so the literal '/me/...' paths above match first.
router.get('/:id/comments', requireAuth, guardDemoUser, getUserComments);
router.get('/:id/animals', requireAuth, guardDemoUser, getUserAnimals);
router.get('/:id', requireAuth, guardDemoUser, getPublicProfile);

module.exports = router;
