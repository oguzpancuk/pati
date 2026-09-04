const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

/**
 * Per-USER rate limiter for authenticated write endpoints.
 *
 * Why not per-IP: Turkish mobile carriers put thousands of users behind one
 * CGNAT address, so an IP limit on content endpoints would throttle a whole
 * neighborhood because one person fed forty cats. Auth endpoints keep their
 * per-IP limit (app.js) — there is no user id before login, and that limit
 * exists to brake password guessing, which *is* per-IP behavior.
 *
 * Mount AFTER requireAuth so req.user exists; the IP fallback only matters
 * if a route ever mounts it unauthenticated. The store is in-process memory,
 * which matches the deployment (one Fly machine); a second machine would
 * need a shared store, noted in docs/ROADMAP.md's scaling items.
 *
 * The ceilings are sized from the heaviest legitimate day we could imagine
 * (a volunteer running a big feeding route, a rescue photographing a whole
 * colony) with ~3x headroom — they should be invisible to honest users and
 * only bound how much junk one account can produce per hour.
 */
function userRateLimit({ windowMs, limit, action }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? `u:${req.user.userId}` : ipKeyGenerator(req.ip)),
    // `retryAfter` (seconds) lets a client mirror the wait instead of
    // guessing; the verification screens count it down.
    message: (req) => ({
      error: `Kısa sürede çok fazla ${action}. Lütfen biraz sonra tekrar dene.`,
      retryAfter: req.rateLimit?.resetTime
        ? Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000))
        : undefined,
    }),
  });
}

const HOUR = 60 * 60 * 1000;

// One limiter instance per endpoint group — instances hold the counters, so
// they must be created once here, not per request.
const limits = {
  // A big feeding route: 40 spots/hour is one drop every 90 seconds, nonstop.
  careActions: userRateLimit({ windowMs: HOUR, limit: 40, action: 'mama/su kaydı' }),
  // Deletes get their own bucket: a mistaken drop at the end of a full
  // 40-drop route must still be correctable (sharing the create budget
  // would 429 exactly then), and deletes must not eat create budget.
  careDelete: userRateLimit({ windowMs: HOUR, limit: 20, action: 'kayıt silme' }),
  // Registering a whole colony in one sitting is ~15 animals.
  createAnimal: userRateLimit({ windowMs: HOUR, limit: 20, action: 'hayvan kaydı' }),
  // Photo matching: one vision request holding up to nine images per call,
  // the most expensive thing a user can trigger; a colony still fits.
  matchAnimals: userRateLimit({ windowMs: HOUR, limit: 30, action: 'eşleştirme' }),
  // Chat is the loosest: a lively conversation is still under one/minute.
  comments: userRateLimit({ windowMs: HOUR, limit: 60, action: 'yorum' }),
  // Sightings, follows and photo additions share a "profile touch" budget.
  animalTouch: userRateLimit({ windowMs: HOUR, limit: 30, action: 'işlem' }),
  // Health + vaccination records: a vet day at a colony is ~15 records.
  healthRecords: userRateLimit({ windowMs: HOUR, limit: 30, action: 'sağlık/aşı kaydı' }),
  // Avatar changes: trying every face twice still fits.
  avatar: userRateLimit({ windowMs: HOUR, limit: 15, action: 'avatar değişikliği' }),
  // Friend requests: the classic spam vector; 30/hour is still a busy day.
  friendRequests: userRateLimit({ windowMs: HOUR, limit: 30, action: 'arkadaşlık isteği' }),
  // Account deletion re-auth: 5 tries covers any honest typo streak and
  // shuts the endpoint as a password-guessing oracle for a stolen token.
  accountDelete: userRateLimit({ windowMs: HOUR, limit: 5, action: 'deneme' }),
  // E-mail verification: a code retires itself after 5 wrong guesses and a
  // new one costs a resend, so these bound the guess rate at a few dozen an
  // hour against a million codes. Honest users type one code, maybe twice.
  verifyEmail: userRateLimit({ windowMs: HOUR, limit: 30, action: 'doğrulama denemesi' }),
  verifyResend: userRateLimit({ windowMs: HOUR, limit: 6, action: 'kod isteği' }),
};

module.exports = { userRateLimit, limits };
