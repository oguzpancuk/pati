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
  // The photo check before each drop, plus retakes after a rejection: one
  // vision request each, so bounded on its own rather than out of the
  // drop budget above.
  carePhotoCheck: userRateLimit({ windowMs: HOUR, limit: 80, action: 'fotoğraf kontrolü' }),
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
  // Photo likes: someone browsing a gallery taps a heart every few
  // seconds; a like is a one-row insert, so the bucket is wide.
  photoLikes: userRateLimit({ windowMs: HOUR, limit: 240, action: 'beğeni' }),
  // Follow/unfollow toggles: cheap rows, but a flapping button must not
  // write hundreds of them.
  follows: userRateLimit({ windowMs: HOUR, limit: 60, action: 'takip işlemi' }),
  // Device (push) token registration: once per launch is the honest rate.
  deviceTokens: userRateLimit({ windowMs: HOUR, limit: 30, action: 'cihaz kaydı' }),
  // Health + vaccination records: a vet day at a colony is ~15 records.
  healthRecords: userRateLimit({ windowMs: HOUR, limit: 30, action: 'sağlık/aşı kaydı' }),
  // Avatar changes: trying every face twice still fits.
  avatar: userRateLimit({ windowMs: HOUR, limit: 15, action: 'avatar değişikliği' }),
  // Friend requests: the classic spam vector; 30/hour is still a busy day.
  friendRequests: userRateLimit({ windowMs: HOUR, limit: 30, action: 'arkadaşlık isteği' }),
  // Block / unblock: one row each; a flapping button is the only way past 30.
  blocks: userRateLimit({ windowMs: HOUR, limit: 30, action: 'engelleme' }),
  // Account deletion re-auth: 5 tries covers any honest typo streak and
  // shuts the endpoint as a password-guessing oracle for a stolen token.
  accountDelete: userRateLimit({ windowMs: HOUR, limit: 5, action: 'deneme' }),
  // E-mail verification: a code retires itself after 5 wrong guesses and a
  // new one costs a resend, so these bound the guess rate at a few dozen an
  // hour against a million codes. Honest users type one code, maybe twice.
  verifyEmail: userRateLimit({ windowMs: HOUR, limit: 30, action: 'doğrulama denemesi' }),
  verifyResend: userRateLimit({ windowMs: HOUR, limit: 6, action: 'kod isteği' }),
  // Password reset. These two mount UNAUTHENTICATED, so the keyGenerator falls
  // back to the IP — which is what they need, and which means a carrier NAT
  // shares one bucket. That is the case this module's own header warns about,
  // so these now sit level with what /api/auth's own brake already allows over
  // an hour (30 per 15 min, app.js) instead of an order of magnitude below it.
  // At 10/h a single script on a Turkish CGNAT took password reset away from
  // everyone behind that address for an hour with ten cheap requests, and the
  // eleventh honest person was locked out of their own account while login
  // from the same address kept working. The outer brake still bites first in a
  // burst, which is the right way round: it is the one shared with login.
  //
  // Neither limiter is the real defence and neither is sized as if it were: a
  // mailbox is protected by the per-account 60-second cooldown in
  // utils/passwordReset.js (so 60 requests an hour from one NAT still cannot
  // mail one address more than 60 times), and a code by its own 5-attempt cap
  // against a million possibilities.
  forgotPassword: userRateLimit({ windowMs: HOUR, limit: 60, action: 'şifre sıfırlama isteği' }),
  resetPassword: userRateLimit({ windowMs: HOUR, limit: 60, action: 'kod denemesi' }),
  // Changing a password is authenticated, so this one is per user — and it
  // gets account deletion's tight budget for account deletion's reason: the
  // current-password check is a password-guessing oracle for a stolen token,
  // and five tries covers any honest typo streak.
  changePassword: userRateLimit({ windowMs: HOUR, limit: 5, action: 'deneme' }),
  // Direct messages: a fast back-and-forth is a few a minute; 300/hour is
  // one every 12 seconds nonstop, and bounds a spam script's reach.
  messages: userRateLimit({ windowMs: HOUR, limit: 300, action: 'mesaj' }),
  // Conversation and membership changes (create, rename, add, remove,
  // promote): setting up a handful of groups is well under this.
  messageAdmin: userRateLimit({ windowMs: HOUR, limit: 40, action: 'sohbet işlemi' }),
  // Reports on messages: the same tight budget as /reports.
  messageReports: userRateLimit({ windowMs: HOUR, limit: 20, action: 'şikayet' }),
  // Ad impressions are the billing metric, and the client reports them:
  // uncapped, one account could sell an advertiser a number it invented.
  // The honest ceiling is the popups a user can open, which their own
  // care-action (40/h) and health-record (30/h) budgets already bound; 200
  // leaves the flow room to spare and still makes inflation pointless. A
  // refusal costs nothing — an unrecorded impression only skips a billing
  // row, and ads never break a flow (NOTES section 1).
  adImpressions: userRateLimit({ windowMs: HOUR, limit: 200, action: 'reklam gösterimi' }),
  // A click is a deliberate tap on a banner; 60/hour is one a minute.
  adClicks: userRateLimit({ windowMs: HOUR, limit: 60, action: 'reklam tıklaması' }),
};

module.exports = { userRateLimit, limits };
