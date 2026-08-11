const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { listRegions, getRegion, addAction } = require('../controllers/region.controller');

const router = express.Router();

router.get('/', listRegions);
router.get('/:id', getRegion);
router.post('/:id/actions', requireAuth, addAction);

module.exports = router;
