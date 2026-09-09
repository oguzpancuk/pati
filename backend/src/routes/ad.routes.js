const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { getNextAd, recordImpression, recordClick } = require('../controllers/ad.controller');

const router = express.Router();

// Fetching the next ad is side-effect-free; the impression is reported
// separately. An ad fetched but never rendered isn't billed, and rotation
// advances by what was actually shown.
router.get('/', requireAuth, getNextAd);
router.post('/:id/impression', requireAuth, limits.adImpressions, recordImpression);
router.post('/:id/click', requireAuth, limits.adClicks, recordClick);

module.exports = router;
