const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { upload } = require('../config/upload');
const { addCareAction, listCareActions, getCareStatus } = require('../controllers/care.controller');

const router = express.Router();

router.get('/', listCareActions);
router.get('/status', getCareStatus);
router.post('/', requireAuth, limits.careActions, upload.single('photo'), addCareAction);

module.exports = router;
