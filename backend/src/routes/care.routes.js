const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { upload } = require('../config/upload');
const {
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
router.post('/', requireAuth, limits.careActions, upload.single('photo'), addCareAction);
router.delete('/:id', requireAuth, limits.careActions, deleteCareAction);

module.exports = router;
