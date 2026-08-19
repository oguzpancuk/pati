const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth.middleware');
const { createReport } = require('../controllers/report.controller');

const router = express.Router();

// A report is a rare action for an honest user; a tight limit costs them
// nothing and blunts revenge-flagging sprees.
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Çok fazla şikayet gönderildi; bir süre sonra tekrar deneyin.' },
});

router.post('/', requireAuth, reportLimiter, createReport);

module.exports = router;
