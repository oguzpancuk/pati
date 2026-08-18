const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { getNextAd, recordImpression, recordClick } = require('../controllers/ad.controller');

const router = express.Router();

// Sıradaki reklamı almak yan etkisiz; gösterim ayrıca bildiriliyor. Böylece
// getirilip de gösterilmeyen bir reklam faturaya yazılmıyor ve rotasyon sırası
// gerçekten gösterilenlere göre ilerliyor.
router.get('/', requireAuth, getNextAd);
router.post('/:id/impression', requireAuth, recordImpression);
router.post('/:id/click', requireAuth, recordClick);

module.exports = router;
