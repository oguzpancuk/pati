const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { upload } = require('../config/upload');
const {
  checkCarePhoto,
  addCareAction,
  listCareActions,
  getCareStatus,
  listMyCareActions,
  deleteCareAction,
} = require('../controllers/care.controller');

const router = express.Router();

router.get('/', listCareActions);
router.get('/status', getCareStatus);
router.get('/mine', requireAuth, listMyCareActions);
// The check has its own bucket: sharing the create budget halved the
// route the limiter was sized for (review finding).
router.post('/check', requireAuth, limits.carePhotoCheck, upload.single('photo'), checkCarePhoto);
router.post('/', requireAuth, limits.careActions, upload.single('photo'), addCareAction);
router.delete('/:id', requireAuth, limits.careDelete, deleteCareAction);

module.exports = router;
