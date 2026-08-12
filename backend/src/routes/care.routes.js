const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { addCareAction, listCareActions, getCareStatus } = require('../controllers/care.controller');

const router = express.Router();

router.get('/', listCareActions);
router.get('/status', getCareStatus);
router.post('/', requireAuth, addCareAction);

module.exports = router;
