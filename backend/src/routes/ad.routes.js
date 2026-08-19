const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { getNextAd, recordImpression, recordClick } = require('../controllers/ad.controller');

const router = express.Router();

// Fetching the next ad is side-effect-free; the impression is reported
// separately. An ad fetched but never rendered isn't billed, and rotation
// advances by what was actually shown.
router.get('/', requireAuth, getNextAd);
router.post('/:id/impression', requireAuth, recordImpression);
router.post('/:id/click', requireAuth, recordClick);

module.exports = router;
