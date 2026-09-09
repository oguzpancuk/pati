const express = require('express');
const { requireAuth, identifyUser } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { upload } = require('../config/upload');
const { resizeUploads } = require('../middleware/imageResize.middleware');
const {
  checkCarePhoto,
  addCareAction,
  listCareActions,
  getCareStatus,
  listMyCareActions,
  deleteCareAction,
} = require('../controllers/care.controller');

const router = express.Router();

// Open to signed-out visitors, but a signed-in one's demo preference has
// to be known: identifyUser names the caller without ever refusing.
router.get('/', identifyUser, listCareActions);
router.get('/status', identifyUser, getCareStatus);
router.get('/mine', requireAuth, listMyCareActions);
// The check has its own bucket: sharing the create budget halved the
// route the limiter was sized for (review finding).
router.post('/check', requireAuth, limits.carePhotoCheck, upload.single('photo'), resizeUploads(), checkCarePhoto);
router.post('/', requireAuth, limits.careActions, upload.single('photo'), resizeUploads(), addCareAction);
router.delete('/:id', requireAuth, limits.careDelete, deleteCareAction);

module.exports = router;
