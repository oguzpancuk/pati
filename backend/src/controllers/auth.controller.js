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

const SALT_ROUNDS = 10;

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
    if (password.length < 8) {
      return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Bu e-posta ile kayıtlı bir kullanıcı zaten var' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, avatar_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, avatar_url, created_at`,
      [name, email, passwordHash, randomAvatarValue()]
    );

    const user = result.rows[0];
    const token = signToken({ userId: user.id, role: user.role });
    res.status(201).json({ user, token });
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

    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, avatar_url FROM users WHERE email = $1',
      [email]
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
      const label = linked.rows.map((r) => (r.provider === 'apple' ? 'Apple' : 'Google')).join(' / ');
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
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

const PROVIDER_LABELS = { apple: 'Apple', google: 'Google' };

/** users columns every auth response is built from. */
const USER_COLUMNS = 'id, name, email, role, avatar_url';

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

async function findByEmail(email) {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS}, email_verified, suspended_at, suspended_reason
       FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

/**
 * The address belongs to an account nobody ever proved owns it — a plain
 * registration. Linking into it is the takeover this refuses; signing in with
 * the password is the way in.
 */
function refuseUnprovenAccount(res) {
  return res.status(409).json({
    error: 'Bu e-posta şifreli bir pati hesabına ait; şifrenle giriş yap',
  });
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

    let identity;
    try {
      identity = await verifyIdentityToken(provider, submitted);
    } catch (err) {
      if (err instanceof AuthTokenError) return res.status(401).json({ error: err.message });
      throw err;
    }

    let user = await findUserByIdentity(provider, identity.subject);
    let created = false;
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
      if (existing && !existing.email_verified) return refuseUnprovenAccount(res);
      user = existing;

      if (!user) {
        try {
          const inserted = await pool.query(
            `INSERT INTO users (name, email, avatar_url, email_verified)
             VALUES ($1, $2, $3, true)
             RETURNING ${USER_COLUMNS}, email_verified, suspended_at, suspended_reason`,
            [displayName(identity, forwardedName), identity.email, randomAvatarValue()]
          );
          user = inserted.rows[0];
          created = true;
        } catch (err) {
          // Two sign-ins racing on the same fresh e-mail: the unique index is
          // the arbiter and the loser reads the winner's row. The winner may
          // also have been a plain registration, so the same proof check
          // applies to what we read back.
          if (err.code !== '23505') throw err;
          user = await findByEmail(identity.email);
          if (!user) throw err;
          if (!user.email_verified) return refuseUnprovenAccount(res);
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

module.exports = { register, login, appleLogin, googleLogin, providers };

