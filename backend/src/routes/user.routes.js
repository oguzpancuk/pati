const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');
const {
  getMe,
  uploadAvatar,
  setAvatarKey,
  clearAvatar,
  setFeaturedBadges,
  getUserAnimals,
  getUserComments,
  getMyBadgeAwards,
  markMyBadgeAwardsSeen,
  searchUsers,
  getPublicProfile,
} = require('../controllers/user.controller');

const router = express.Router();

router.get('/me', requireAuth, getMe);
router.post('/me/avatar', requireAuth, upload.single('photo'), uploadAvatar);
router.put('/me/avatar-key', requireAuth, setAvatarKey);
router.delete('/me/avatar', requireAuth, clearAvatar);
router.put('/me/featured-badges', requireAuth, setFeaturedBadges);
router.get('/me/animals', requireAuth, getUserAnimals);
router.get('/me/comments', requireAuth, getUserComments);
router.get('/me/badge-awards', requireAuth, getMyBadgeAwards);
router.post('/me/badge-awards/seen', requireAuth, markMyBadgeAwardsSeen);
router.get('/search', requireAuth, searchUsers);
// '/:id' routes go last so the literal '/me/...' paths above match first.
router.get('/:id/comments', requireAuth, getUserComments);
router.get('/:id/animals', requireAuth, getUserAnimals);
router.get('/:id', requireAuth, getPublicProfile);

module.exports = router;
