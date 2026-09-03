const express = require('express');
const {
  register,
  login,
  verifyEmail,
  resendVerification,
  appleLogin,
  googleLogin,
  providers,
} = require('../controllers/auth.controller');
const { requireAuthAllowPending } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');

const router = express.Router();

// Which sign-in buttons to draw; read by both clients before the login screen
// renders. Exempt from the auth rate limit in app.js — it is a page-load read,
// not a credential attempt.
router.get('/providers', providers);

router.post('/register', register);
router.post('/login', login);
// The two endpoints a not-yet-verified session may call (besides reading and
// deleting itself in user.routes). Both sit under the /api/auth IP limiter
// as well; the per-user limiters here are what bound code guessing.
router.post('/verify-email', requireAuthAllowPending, limits.verifyEmail, verifyEmail);
router.post(
  '/verify-email/resend',
  requireAuthAllowPending,
  limits.verifyResend,
  resendVerification
);
router.post('/apple', appleLogin);
router.post('/google', googleLogin);

module.exports = router;
