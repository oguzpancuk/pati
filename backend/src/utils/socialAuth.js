/**
 * Apple and Google sign-in: identity-token verification.
 *
 * Both providers hand the client an OpenID Connect identity token — a JWT the
 * provider signed. The client posts it here and this module decides whether to
 * believe it. That decision IS the security boundary: an unverified token is
 * just a string the caller typed, so all four checks are mandatory and none of
 * them is optional in any environment:
 *
 *   1. signature, against the provider's published JWKS (RS256 only),
 *   2. issuer, so a token minted by someone else is rejected,
 *   3. audience, so a token issued for a *different app* is rejected — this is
 *      the check that stops "sign in to my app, I'll replay your Google token
 *      to pati",
 *   4. expiry (jsonwebtoken enforces exp/iat).
 *
 * No new dependency: jsonwebtoken already ships with the backend and Node 20's
 * crypto turns a JWK into a public key natively.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const PROVIDERS = {
  apple: {
    issuers: ['https://appleid.apple.com'],
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    // iOS bundle id (native sign-in) and the Service ID (web sign-in). Both
    // appear as "aud" depending on which client produced the token, so the
    // variable holds a comma-separated list.
    clientIdsEnv: 'APPLE_CLIENT_IDS',
  },
  google: {
    // Google still stamps both spellings; accepting only one breaks sign-in
    // for whichever half of the fleet gets the other.
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    // iOS client id, web client id (and Android's, when that ships).
    clientIdsEnv: 'GOOGLE_CLIENT_IDS',
  },
};

const PROVIDER_NAMES = Object.keys(PROVIDERS);

/** Comma-separated env list → array, empty when unset. */
function listEnv(name) {
  return (process.env[name] || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function clientIds(provider) {
  return listEnv(PROVIDERS[provider].clientIdsEnv);
}

/**
 * A provider is "enabled" exactly when it has client ids configured. Nothing
 * else gates it: the clients ask for this and hide the button, so a half-
 * configured deploy shows no button instead of a button that always fails.
 */
function isEnabled(provider) {
  return clientIds(provider).length > 0;
}

/**
 * Test seam. Pointing the verifier at a local issuer is how the flow gets an
 * end-to-end check without Apple's and Google's real servers (the backend has
 * no test suite; see docs/NOTES.md). Refused in production — a settable issuer
 * in production would mean anyone able to set env vars can mint identities,
 * and silently ignoring the variable would be worse than refusing to boot.
 */
function overrides(provider) {
  const jwksUrl = process.env[`${provider.toUpperCase()}_JWKS_URL`];
  const issuer = process.env[`${provider.toUpperCase()}_ISSUER`];
  if (!jwksUrl && !issuer) return null;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${provider.toUpperCase()}_JWKS_URL/_ISSUER are development-only overrides ` +
        'and must not be set in production'
    );
  }
  return { jwksUrl, issuer };
}

function endpoint(provider) {
  const base = PROVIDERS[provider];
  const dev = overrides(provider);
  return {
    jwksUrl: (dev && dev.jwksUrl) || base.jwksUrl,
    issuers: dev && dev.issuer ? [dev.issuer] : base.issuers,
  };
}

// Provider → { keys, fetchedAt }. Signing keys rotate on the provider's
// schedule, so the cache is short; an unknown kid forces an early refetch, but
// no more often than REFETCH_FLOOR_MS so a bogus-kid flood cannot turn us into
// a traffic amplifier against Apple.
const CACHE_TTL_MS = 60 * 60 * 1000;
const REFETCH_FLOOR_MS = 5 * 60 * 1000;
const jwksCache = new Map();

async function fetchJwks(provider) {
  const { jwksUrl } = endpoint(provider);
  const res = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`JWKS fetch failed for ${provider}: HTTP ${res.status}`);
  const body = await res.json();
  if (!body || !Array.isArray(body.keys)) throw new Error(`Malformed JWKS for ${provider}`);
  jwksCache.set(provider, { keys: body.keys, fetchedAt: Date.now() });
  return body.keys;
}

async function keyForKid(provider, kid) {
  const cached = jwksCache.get(provider);
  const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  let keys = fresh ? cached.keys : await fetchJwks(provider);

  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk && cached && Date.now() - cached.fetchedAt > REFETCH_FLOOR_MS) {
    keys = await fetchJwks(provider);
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new AuthTokenError('İmza anahtarı doğrulanamadı');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

/** Anything the caller could have caused: a bad, stale or foreign token. */
class AuthTokenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthTokenError';
  }
}

/** Apple sends email_verified as the string "true" as often as a boolean. */
function asBoolean(value) {
  return value === true || value === 'true';
}

/**
 * Verifies an identity token and returns the normalized identity.
 * Throws AuthTokenError for anything the client can fix by signing in again,
 * and a plain Error for our own misconfiguration (which must reach the logs,
 * not the user).
 */
async function verifyIdentityToken(provider, token) {
  if (!PROVIDERS[provider]) throw new Error(`Unknown provider: ${provider}`);
  const audience = clientIds(provider);
  if (audience.length === 0) {
    throw new Error(`${PROVIDERS[provider].clientIdsEnv} is not configured`);
  }
  if (!token || typeof token !== 'string') {
    throw new AuthTokenError('Kimlik doğrulama anahtarı eksik');
  }

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header) throw new AuthTokenError('Kimlik doğrulama anahtarı geçersiz');
  if (decoded.header.alg !== 'RS256') {
    // Refusing anything else here is what makes the "alg: none" and HS256
    // key-confusion attacks impossible, whatever jsonwebtoken defaults to.
    throw new AuthTokenError('Kimlik doğrulama anahtarı geçersiz');
  }

  const key = await keyForKid(provider, decoded.header.kid);
  let payload;
  try {
    payload = jwt.verify(token, key, {
      algorithms: ['RS256'],
      audience,
      issuer: endpoint(provider).issuers,
    });
  } catch (err) {
    throw new AuthTokenError('Kimlik doğrulama anahtarı geçersiz veya süresi dolmuş');
  }

  if (!payload.sub) throw new AuthTokenError('Kimlik doğrulama anahtarı geçersiz');
  return {
    provider,
    subject: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    // Google omits email_verified for some workspace accounts; Apple always
    // sends it. A missing value counts as unverified, because the claim is
    // what lets a provider identity take over an existing password account.
    emailVerified: asBoolean(payload.email_verified),
    name: typeof payload.name === 'string' ? payload.name.trim() : null,
  };
}

/** What the clients need to decide which buttons to draw. */
function publicConfig() {
  return {
    apple: {
      enabled: isEnabled('apple'),
      // Web sign-in runs through a Service ID and a redirect URI registered
      // with Apple; the native app uses its bundle id and needs neither. Both
      // are public values that appear in the page anyway.
      serviceId: listEnv('APPLE_SERVICE_ID')[0] || null,
      redirectUri: listEnv('APPLE_WEB_REDIRECT_URI')[0] || null,
    },
    google: {
      enabled: isEnabled('google'),
      // Public by design (it ends up in the page source of every Google
      // sign-in button); serving it keeps the web build free of secrets and
      // lets mobile configure its SDK at runtime.
      webClientId: listEnv('GOOGLE_WEB_CLIENT_ID')[0] || null,
      iosClientId: listEnv('GOOGLE_IOS_CLIENT_ID')[0] || null,
    },
  };
}

module.exports = {
  AuthTokenError,
  PROVIDER_NAMES,
  isEnabled,
  publicConfig,
  verifyIdentityToken,
};
