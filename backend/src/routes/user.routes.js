const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');
const {
  getMe,
  uploadAvatar,
  getMyAnimals,
  searchUsers,
  getPublicProfile,
} = require('../controllers/user.controller');

const router = express.Router();

router.get('/me', requireAuth, getMe);
router.post('/me/avatar', requireAuth, upload.single('photo'), uploadAvatar);
router.get('/me/animals', requireAuth, getMyAnimals);
router.get('/search', requireAuth, searchUsers);
router.get('/:id', requireAuth, getPublicProfile);

module.exports = router;
