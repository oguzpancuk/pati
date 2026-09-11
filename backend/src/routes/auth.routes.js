const express = require('express');
const {
  register,
  login,
  verifyEmail,
  resendCooldown,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  appleLogin,
  googleLogin,
  providers,
} = require('../controllers/auth.controller');
const { requireAuth, requireAuthAllowPending } = require('../middleware/auth.middleware');
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
// Cooldown before the hourly limiter: a double tap costs one 429, not one
// of the six resends the limiter allows.
router.post(
  '/verify-email/resend',
  requireAuthAllowPending,
  resendCooldown,
  limits.verifyResend,
  resendVerification
);
// Forgotten password. Both are unauthenticated, so their limiters key on the
// IP (rateLimit.middleware's fallback) on top of the /api/auth IP brake in
// app.js; what really bounds the mail is the per-account cooldown inside
// utils/passwordReset.js, and what bounds guessing is the 5-attempt cap the
// code retires itself after.
router.post('/forgot-password', limits.forgotPassword, forgotPassword);
router.post('/reset-password', limits.resetPassword, resetPassword);
// Changing (or first setting) a password from inside the app. Plain
// requireAuth, not the pending-tolerant one: an account still owing a
// verification code verifies first, like every other authenticated route.
router.post('/change-password', requireAuth, limits.changePassword, changePassword);
router.post('/apple', appleLogin);
router.post('/google', googleLogin);

module.exports = router;
