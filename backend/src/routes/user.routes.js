const express = require('express');
const { requireAuth, requireAuthAllowPending } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { upload } = require('../config/upload');
const { resizeUploads, AVATAR_MAX_EDGE } = require('../middleware/imageResize.middleware');
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
  blockUser,
  unblockUser,
  listMyBlocks,
} = require('../controllers/user.controller');

const router = express.Router();

// An unverified account may still read itself (the clients learn the pending
// state from here on a cold start) and delete itself (App Store 5.1.1(v):
// deletion must always work). Nothing else opens to it.
router.get('/me', requireAuthAllowPending, getMe);
router.delete('/me', requireAuthAllowPending, limits.accountDelete, deleteMyAccount);
router.post('/me/avatar', requireAuth, limits.avatar, upload.single('photo'), resizeUploads({ maxEdge: AVATAR_MAX_EDGE }), uploadAvatar);
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
// Blocks (App Store guideline 1.2). `/me/blocks` sits with the other /me
// routes, before `/:id` — and the two mutations share the follow-sized
// bucket: a block is a one-row write that nobody honest does forty times an
// hour.
router.get('/me/blocks', requireAuth, listMyBlocks);
router.post('/:id/block', requireAuth, limits.blocks, blockUser);
router.delete('/:id/block', requireAuth, limits.blocks, unblockUser);
// '/:id' routes go last so the literal '/me/...' paths above match first.
router.get('/:id/comments', requireAuth, getUserComments);
router.get('/:id/animals', requireAuth, getUserAnimals);
router.get('/:id', requireAuth, getPublicProfile);

module.exports = router;
