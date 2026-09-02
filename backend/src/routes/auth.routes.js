const express = require('express');
const {
  register,
  login,
  appleLogin,
  googleLogin,
  providers,
} = require('../controllers/auth.controller');

const router = express.Router();

// Which sign-in buttons to draw; read by both clients before the login screen
// renders. Exempt from the auth rate limit in app.js — it is a page-load read,
// not a credential attempt.
router.get('/providers', providers);

router.post('/register', register);
router.post('/login', login);
router.post('/apple', appleLogin);
router.post('/google', googleLogin);

module.exports = router;
