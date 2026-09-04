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
// The photo check shares the create budget: every drop is one check plus
// one confirm, and a check without a confirm is the only way to burn extra.
router.post('/check', requireAuth, limits.careActions, upload.single('photo'), checkCarePhoto);
router.post('/', requireAuth, limits.careActions, upload.single('photo'), addCareAction);
router.delete('/:id', requireAuth, limits.careDelete, deleteCareAction);

module.exports = router;
