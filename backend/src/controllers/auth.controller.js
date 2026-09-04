const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { signToken } = require('../utils/jwt');
const { AVATAR_KEYS, AVATAR_PREFIX } = require('../utils/avatars');
const {
  AuthTokenError,
  isEnabled,
  publicConfig,
  verifyIdentityToken,
} = require('../utils/socialAuth');
const verification = require('../utils/emailVerification');

const SALT_ROUNDS = 10;

/** users columns every auth response is built from. */
const USER_COLUMNS = 'id, name, email, role, avatar_url, email_verification_pending';

/**
 * The one way an e-mail enters this file. Trimmed because a pasted address
 * often carries a space and mobile does not trim before sending, lower-cased
 * because providers always report lower-case and `users.email` is compared
 * against them — registering `Ali@x.com` and signing in with Google must
 * reach the same account (review found both halves).
 */
function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * New accounts get a random built-in avatar. A chat full of blank
 * (initials-only) profiles made the app look abandoned; the random pick is a
 * starting value, not an imposition — users can switch it or upload a photo
 * from their profile.
 */
function randomAvatarValue() {
  return `${AVATAR_PREFIX}${AVATAR_KEYS[Math.floor(Math.random() * AVATAR_KEYS.length)]}`;
}

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email ve password zorunludur' });
    }
    // Typed check as well as truthiness: an object here normalises to '' and
    // would insert a user with an empty address (review finding).
    if (typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'name, email ve password metin olmalıdır' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır' });
    }

    const normalizedEmail = normalizeEmail(email);

    // A registration that never verified holds its address for PENDING_HOLD,
    // then becomes replaceable. Holding it at all is what keeps someone from
    // swapping their own password under a registration whose code is about
    // to be typed; releasing it is what keeps a squatter — who knows the
    // password but never sees the mailbox — from denying the address forever
    // (ADR-0004). A verified or grandfathered account is never replaceable.
    const existing = await pool.query(
      `SELECT id, email_verification_pending,
              created_at < now() - $2::interval AS hold_expired
         FROM users WHERE lower(email) = $1`,
      [normalizedEmail, verification.PENDING_HOLD]
    );
    const replaceable =
      existing.rows.length === 1 &&
      existing.rows[0].email_verification_pending &&
      existing.rows[0].hold_expired;
    if (existing.rows.length > 0 && !replaceable) {
      return res.status(409).json({
        error: existing.rows.some((r) => r.email_verification_pending)
          ? 'Bu e-posta için doğrulama bekleyen bir kayıt var. Kaydı sen yaptıysan giriş yapıp yeni kod iste.'
          : 'Bu e-posta ile kayıtlı bir kullanıcı zaten var',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // Off (and accounts land unverified, as before) wherever no mail can be
    // sent: a pending account nobody can reach would be worse than the old
    // behaviour. Production says so in the boot log.
    const pending = verification.isEnabled();
    // One transaction for "retire the expired registration, then insert":
    // two requests replacing the same row queue on its lock, and the second
    // finds nothing left to delete — it must not insert on top of the first
    // (review: four concurrent replacements all got a token).
    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      if (replaceable) {
        const removed = await verification.retirePendingAccount(client, existing.rows[0].id, {
          requireHoldExpired: true,
        });
        if (removed === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error:
              'Bu e-posta için doğrulama bekleyen bir kayıt var. Kaydı sen yaptıysan giriş yapıp yeni kod iste.',
          });
        }
      }
      result = await client.query(
        `INSERT INTO users (name, email, password_hash, avatar_url, email_verification_pending)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${USER_COLUMNS}, created_at`,
        [name, normalizedEmail, passwordHash, randomAvatarValue(), pending]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // Two registrations racing on the same address — newly reachable now
      // that `Ali@x.com` and `ali@x.com` normalise to one key. The check
      // above is not a lock; `users_email_key` is (it is case-sensitive, and
      // only works here because the address was normalised first —
      // `idx_users_email_lower` is an index, not a constraint). Its verdict
      // deserves the same 409 rather than a 500.
      // Only the e-mail collision means "already registered"; any other
      // unique violation is our problem and deserves to surface as one.
      if (err.code !== '23505' || err.constraint !== 'users_email_key') throw err;
      return res.status(409).json({ error: 'Bu e-posta ile kayıtlı bir kullanıcı zaten var' });
    } finally {
      client.release();
    }

    const user = result.rows[0];
    const token = signToken({ userId: user.id, role: user.role });

    // The account exists either way; a mail that could not go out is
    // reported, not fatal — the verification screen offers a resend.
    let codeSent = false;
    if (pending) {
      try {
        await verification.sendCode(user);
        codeSent = true;
      } catch (err) {
        console.error(`verification mail to user ${user.id} failed:`, err.message);
      }
    }
    res.status(201).json({ user, token, verificationRequired: pending, codeSent });
  } catch (err) {
    next(err);
  }
}

/** The client's answer to "what should I show": the session plus its state. */
function pendingResponse(user, token, extra = {}) {
  return { user, token, verificationRequired: !!user.email_verification_pending, ...extra };
}

/** How a refused code is explained. Every reason has a way forward. */
const CODE_ERRORS = {
  none: 'Bekleyen bir doğrulama kodu yok; yeni kod iste',
  expired: 'Kodun süresi dolmuş; yeni kod iste',
  attempts: 'Çok fazla hatalı deneme; yeni kod iste',
  wrong: 'Kod hatalı',
};

/**
 * POST /auth/verify-email — mounted with the pending-tolerant authenticator,
 * since the whole point is that the caller is not verified yet. Idempotent
 * for an already-verified account so a double tap cannot fail.
 */
async function verifyEmail(req, res, next) {
  try {
    const raw = req.body?.code;
    // People paste "123 456"; the mail shows the digits without spaces but
    // some clients add them.
    const code = typeof raw === 'string' ? raw.replace(/\s+/g, '') : '';
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Kod 6 haneli olmalı' });
    }

    const current = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
      req.user.userId,
    ]);
    const user = current.rows[0];
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (!user.email_verification_pending) return res.json({ user, alreadyVerified: true });

    const outcome = await verification.checkCode(user.id, code);
    if (!outcome.ok) {
      // Any refusal may be a race with a submission that just won: concurrent
      // copies of the right code each count an attempt, so the sixth sees
      // "too many" and a late one sees no row at all. Re-read before
      // answering — a verified row is "already verified", never a refusal.
      const settled = await settledState(user.id);
      if (settled.verified) return res.json({ user: settled.verified, alreadyVerified: true });
      if (outcome.reason === 'none') {
        // No code row on a row still pending. Rare — sendCode writes the row
        // before it mails, so a mail failure still leaves a code; this takes
        // a failed INSERT or a hand-deleted row — but it is an account that
        // is alive, and a 401 here logged it out (review). Ask for a code.
        // Only a row that is GONE, retired underneath this session, means
        // the session is dead.
        if (settled.pending) return res.status(400).json({ error: CODE_ERRORS.none });
        return res.status(401).json({ error: 'Oturumunuz geçersiz, lütfen tekrar giriş yapın' });
      }
    }
    if (!outcome.ok) {
      const status = outcome.reason === 'attempts' ? 429 : 400;
      let suffix = '';
      if (outcome.reason === 'wrong') {
        // The fifth wrong guess retires the code; saying so here spares the
        // user a correct code answered with "ask for a new one".
        suffix =
          outcome.remaining > 0
            ? ` (${outcome.remaining} deneme kaldı)`
            : '; deneme hakkın bitti, yeni kod iste';
      }
      return res.status(status).json({ error: `${CODE_ERRORS[outcome.reason]}${suffix}` });
    }

    const verified = await verification.markVerified(user.id, USER_COLUMNS);
    if (!verified) {
      // The row stopped being a pending one between the check and here.
      // Verified by a concurrent submission → the honest answer is the same
      // as for a double tap (review: a 401 here made mobile wipe the session
      // of a user who had just verified). Retired by a replacement → the
      // session is dead, and 401 makes the client log in again.
      const settled = await settledState(user.id);
      if (settled.verified) return res.json({ user: settled.verified, alreadyVerified: true });
      return res.status(401).json({ error: 'Oturumunuz geçersiz, lütfen tekrar giriş yapın' });
    }
    res.json({ user: verified });
  } catch (err) {
    next(err);
  }
}

/**
 * Re-reads the row after a verification step matched nothing: `verified` is
 * the row when it is no longer pending, `pending` says it still exists and
 * is; both false means it is gone (retired by a replacement).
 */
async function settledState(userId) {
  const again = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
  const row = again.rows[0];
  if (!row) return { verified: null, pending: false };
  return row.email_verification_pending
    ? { verified: null, pending: true }
    : { verified: row, pending: false };
}

/**
 * The resend cooldown, as a middleware mounted BEFORE the hourly limiter: a
 * double tap must cost one 429, not two of the six resends an hour the
 * limiter allows (review finding).
 */
async function resendCooldown(req, res, next) {
  try {
    const wait = await verification.cooldownRemaining(req.user.userId);
    if (wait > 0) {
      return res.status(429).json({ error: `Yeni kod için ${wait} saniye bekle`, retryAfter: wait });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/verify-email/resend. A cooldown per account on top of the
 * per-user limiter: the first stops a double tap from sending two mails, the
 * second bounds what a stolen pending session can make us send in an hour.
 */
async function resendVerification(req, res, next) {
  try {
    if (!verification.isEnabled()) {
      return res.status(503).json({ error: 'E-posta doğrulama şu anda kullanılamıyor' });
    }
    const current = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
      req.user.userId,
    ]);
    const user = current.rows[0];
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (!user.email_verification_pending) {
      return res.status(400).json({ error: 'E-posta adresin zaten doğrulanmış' });
    }

    // The cooldown itself is resendCooldown, mounted ahead of the limiter.
    try {
      await verification.sendCode(user);
    } catch (err) {
      console.error(`verification mail to user ${user.id} failed:`, err.message);
      return res
        .status(502)
        .json({ error: 'Doğrulama e-postası gönderilemedi; biraz sonra tekrar dene' });
    }
    res.json({ codeSent: true, email: user.email });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email ve password zorunludur' });
    }
    // Same boundary as register: a non-string password reaches bcrypt, which
    // throws, and the error handler would echo its English message.
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email ve password metin olmalıdır' });
    }

    // Matched case-insensitively, but the row stored EXACTLY as typed wins.
    // Where a pre-normalisation pair exists (`Ali@x.com` and `ali@x.com` are
    // both legal — users_email_key is case-sensitive), preferring the
    // normalised row would check the wrong password hash and lock the owner
    // of the capitalised address out silently (review finding).
    const typed = typeof email === 'string' ? email.trim() : '';
    const result = await pool.query(
      `SELECT ${USER_COLUMNS}, password_hash
         FROM users
        WHERE lower(email) = $1
        ORDER BY (email = $2) DESC, (email = $1) DESC, id
        LIMIT 1`,
      [normalizeEmail(email), typed]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Geçersiz e-posta veya şifre' });
    }

    if (!user.password_hash) {
      // Social-only account: bcrypt.compare would throw on a NULL hash, and
      // "wrong password" would send the user hunting for a password that has
      // never existed. Name the provider instead — registration already
      // discloses that an address is taken, so this leaks nothing new.
      const linked = await pool.query(
        'SELECT provider FROM user_identities WHERE user_id = $1 ORDER BY id',
        [user.id]
      );
      const label = linked.rows
        .map((r) => (r.provider === 'apple' ? 'Apple' : 'Google'))
        .join(' / ');
      return res.status(401).json({
        error: label
          ? `Bu hesap ${label} ile açılmış; ${label} ile giriş yapın`
          : 'Geçersiz e-posta veya şifre',
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Geçersiz e-posta veya şifre' });
    }

    const token = signToken({ userId: user.id, role: user.role });
    delete user.password_hash;
    // A pending account may log in — that is how someone who closed the app
    // gets back to the code screen — but the client is told to show nothing
    // else. No code is sent here: the screen has a resend button, and an
    // automatic mail per login would let anyone holding the password fill
    // the address's inbox.
    res.json(pendingResponse(user, token));
  } catch (err) {
    next(err);
  }
}

const PROVIDER_LABELS = { apple: 'Apple', google: 'Google' };

/**
 * A display name for an account created through a provider. Apple only reveals
 * the real name during the FIRST authorization, and only to the client, which
 * forwards it here; every later sign-in arrives nameless. So: the provider's
 * own claim, then whatever the client forwarded, then the local part of the
 * e-mail, and finally a neutral Turkish placeholder — never an empty name,
 * because the whole app renders names.
 */
function displayName(identity, forwarded) {
  const candidates = [identity.name, typeof forwarded === 'string' ? forwarded.trim() : null];
  const local = identity.email ? identity.email.split('@')[0] : null;
  if (local && !local.includes('privaterelay')) candidates.push(local);
  const picked = candidates.find((c) => c && c.length > 0) || 'Pati Dostu';
  return picked.slice(0, 120);
}

async function findUserByIdentity(provider, subject) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar_url, u.email_verified,
            u.suspended_at, u.suspended_reason
       FROM user_identities i
       JOIN users u ON u.id = i.user_id
      WHERE i.provider = $1 AND i.subject = $2`,
    [provider, subject]
  );
  return result.rows[0] || null;
}

/**
 * The account an address belongs to, matched case-insensitively: providers
 * hand us a lower-cased e-mail while `users.email` may carry any case an
 * older registration typed. Matching exactly here would send those people to
 * a brand-new empty account instead of the 409 that tells them to use their
 * password (review finding).
 *
 * If a pre-existing pair of case variants exists, the PROVEN row wins:
 * ordering by id alone would hand back the older password account and refuse
 * a user who already signs in with one provider and is adding a second.
 */
async function findByEmail(email) {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS}, email_verified, password_hash, suspended_at, suspended_reason
       FROM users WHERE lower(email) = lower($1)
       ORDER BY email_verified DESC, id
       LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

/**
 * The address belongs to a grandfathered account — registered before e-mail
 * verification existed, so nobody ever proved it owns the address. Linking
 * into it on the strength of the e-mail alone would be the takeover ADR-0003
 * describes, so the caller is asked for the account's password instead; the
 * `code` lets both clients open the "enter your password to link" dialog
 * rather than show a dead end. Owner decision, 2026-09-04: link with
 * password confirmation, not automatically. Accounts verified by code
 * (ADR-0004) never reach this — they are proven and link directly.
 */
function requirePasswordToLink(res) {
  return res.status(409).json({
    error: 'Bu e-postayla bir pati hesabın var; bağlamak için şifreni gir',
    code: 'linkRequiresPassword',
  });
}

/**
 * Answers for a grandfathered row: 409 when no password came, 403 when the
 * wrong one did, null when the caller proved the account. Marking the row
 * proven is NOT done here — that write belongs after the suspension check,
 * so a refused sign-in leaves no trace (see the link block below).
 */
async function checkLinkPassword(row, linkPassword, res) {
  if (!linkPassword) return requirePasswordToLink(res);
  if (!row.password_hash || !(await bcrypt.compare(linkPassword, row.password_hash))) {
    // 403, not 401: both clients read a 401 as an expired session.
    return res.status(403).json({ error: 'Şifre hatalı' });
  }
  return null;
}

/**
 * Sign in with Apple / Google.
 *
 * Resolution order — identity first, e-mail second, new account last:
 *   1. (provider, subject) already linked → that account, always. Subjects are
 *      stable; e-mails are not.
 *   2. a VERIFIED provider e-mail matching an account whose own address is
 *      PROVEN (users.email_verified) → link the identity to it, so a second
 *      provider lands in the same account instead of a duplicate.
 *   3. otherwise a new account, with no password at all.
 *
 * Both "verified" clauses in step 2 are load-bearing, and both were found
 * missing by review:
 *   - an UNVERIFIED provider e-mail gets neither 2 nor 3. Refusing the link
 *     is obvious. Refusing the *creation* matters just as much: an account
 *     created from an unverified address owns that address afterwards, so
 *     the real owner would be merged into the squatter's account by step 2.
 *   - an account whose address was never proven is not linkable either.
 *     `POST /auth/register` confirms nothing, so anyone can register on
 *     someone else's address; linking into it would put the victim inside an
 *     account the squatter holds a password for. Those users are told to sign
 *     in with their password instead. Merging the two would need a real
 *     e-mail-confirmation flow, which the app does not have (ROADMAP).
 */
async function socialLogin(provider, req, res, next) {
  try {
    if (!isEnabled(provider)) {
      return res
        .status(503)
        .json({ error: `${PROVIDER_LABELS[provider]} ile giriş şu anda kullanılamıyor` });
    }

    const submitted = req.body?.identityToken ?? req.body?.idToken;
    if (typeof submitted !== 'string' || submitted.length === 0) {
      return res.status(400).json({ error: 'Kimlik doğrulama anahtarı eksik' });
    }
    const forwardedName = typeof req.body?.name === 'string' ? req.body.name : undefined;
    // Only meaningful for a grandfathered password account; see
    // requirePasswordToLink. Type-checked here, compared below.
    const linkPassword = typeof req.body?.password === 'string' ? req.body.password : null;

    let identity;
    try {
      identity = await verifyIdentityToken(provider, submitted);
    } catch (err) {
      if (err instanceof AuthTokenError) return res.status(401).json({ error: err.message });
      throw err;
    }

    let user = await findUserByIdentity(provider, identity.subject);
    let created = false;
    // A grandfathered row whose password the caller just typed.
    let provenByPassword = false;
    // Known identities are already linked; only a freshly resolved account
    // needs the row, and only after the suspension check below.
    const needsLink = !user;

    if (!user) {
      if (!identity.email) {
        return res.status(400).json({
          error: `${PROVIDER_LABELS[provider]} hesabınızdan e-posta alınamadı; e-posta paylaşımına izin verip tekrar deneyin`,
        });
      }
      if (!identity.emailVerified) {
        return res.status(403).json({
          error: `${PROVIDER_LABELS[provider]} hesabınızın e-posta adresi doğrulanmamış; doğruladıktan sonra tekrar deneyin`,
        });
      }

      const existing = await findByEmail(identity.email);
      // Three kinds of row can hold the address. Proven → link (below).
      // Grandfathered, never proven → refuse, the password is the way in.
      // PENDING → the provider's verified e-mail is mailbox proof the
      // pending registrant never produced, so it takes the address over at
      // once, hold or no hold — otherwise a squatted address would stay
      // closed to its owner's Apple/Google sign-in forever (review finding).
      if (existing && !existing.email_verified && !existing.email_verification_pending) {
        const refused = await checkLinkPassword(existing, linkPassword, res);
        if (refused) return refused;
        // The password proves the account, the provider proves the address;
        // the row is marked proven together with the identity write below.
        provenByPassword = true;
      }
      const pendingRow = existing && !existing.email_verified ? existing : null;
      user = pendingRow ? null : existing;

      if (!user) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          if (pendingRow) {
            await verification.retirePendingAccount(client, pendingRow.id, {
              requireHoldExpired: false,
            });
          }
          const inserted = await client.query(
            `INSERT INTO users (name, email, avatar_url, email_verified)
             VALUES ($1, $2, $3, true)
             RETURNING ${USER_COLUMNS}, email_verified, suspended_at, suspended_reason`,
            [displayName(identity, forwardedName), identity.email, randomAvatarValue()]
          );
          await client.query('COMMIT');
          user = inserted.rows[0];
          created = true;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          // Two sign-ins racing on the same fresh e-mail: the unique index is
          // the arbiter and the loser reads the winner's row. The winner may
          // also have been a plain registration, so the same proof check
          // applies to what we read back.
          if (err.code !== '23505') throw err;
          user = await findByEmail(identity.email);
          if (!user) throw err;
          if (user.email_verification_pending) {
            // A registration replaced the pending row between our read and
            // our insert. Its row is takeover material too; a retry does
            // it, and "use your password" would be the wrong instruction.
            return res.status(409).json({ error: 'Adres az önce değişti; tekrar dene' });
          }
          if (!user.email_verified) {
            // The winner was a grandfathered row: the same password rule
            // applies to what we read back, including a password that came
            // with this very request.
            const refused = await checkLinkPassword(user, linkPassword, res);
            if (refused) return refused;
            provenByPassword = true;
          }
        } finally {
          client.release();
        }
      }
    }

    // Password login leaves this to requireAuth, but here it is worth saying
    // out loud: a suspended user who taps a provider button gets the reason,
    // not a token that fails on every screen afterwards. Checked BEFORE the
    // identity is written, so a refused sign-in leaves no trace behind.
    if (user.suspended_at) {
      return res.status(403).json({
        error: user.suspended_reason
          ? `Hesabınız askıya alındı: ${user.suspended_reason}`
          : 'Hesabınız askıya alındı.',
        suspended: true,
      });
    }

    if (needsLink) {
      if (provenByPassword) {
        // Written only now, after the suspension check: the password was
        // right, but a suspended account must not be touched by a refused
        // sign-in. From here a second provider links without asking.
        await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);
      }
      await pool.query(
        `INSERT INTO user_identities (user_id, provider, subject, email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider, subject) DO NOTHING`,
        [user.id, provider, identity.subject, identity.email]
      );
    }

    const token = signToken({ userId: user.id, role: user.role });
    delete user.suspended_at;
    delete user.suspended_reason;
    delete user.email_verified;
    delete user.password_hash;
    res.status(created ? 201 : 200).json({ user, token, created });
  } catch (err) {
    next(err);
  }
}

const appleLogin = (req, res, next) => socialLogin('apple', req, res, next);
const googleLogin = (req, res, next) => socialLogin('google', req, res, next);

/**
 * Which sign-in providers this deployment actually has credentials for. The
 * clients hide the buttons they are not told about, so an unconfigured
 * environment shows the plain e-mail form rather than a button that can only
 * fail. Public, unauthenticated, and free of secrets.
 */
function providers(req, res) {
  res.json(publicConfig());
}

module.exports = {
  register,
  login,
  verifyEmail,
  resendCooldown,
  resendVerification,
  appleLogin,
  googleLogin,
  providers,
};
