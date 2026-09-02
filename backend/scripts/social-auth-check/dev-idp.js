/**
 * A local stand-in for Apple's and Google's OpenID endpoints — DEVELOPMENT
 * ONLY.
 *
 * Sign-in verification (src/utils/socialAuth.js) can only be exercised end to
 * end against an issuer whose signing key we control: the real providers will
 * not mint a token for a test. This server publishes one RSA key as a JWKS
 * and signs whatever claims a test asks for, so run.sh can drive the whole
 * flow — create, link, refuse, delete — through the real HTTP endpoints.
 *
 * The backend only trusts it because APPLE_/GOOGLE_JWKS_URL and _ISSUER point
 * here, and those overrides are refused when NODE_ENV=production.
 *
 *   node scripts/social-auth-check/dev-idp.js [port]
 */
const crypto = require('crypto');
const http = require('http');
const jwt = require('jsonwebtoken');

const PORT = Number(process.argv[2] || 4599);
const KID = 'pati-dev-key';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };

// A second key that is never published: tokens signed with it must be
// rejected, which is how the signature check itself gets tested.
const rogue = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname.endsWith('/keys')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ keys: [jwk] }));
    }
    if (url.pathname === '/mint') {
      const claims = JSON.parse(url.searchParams.get('claims'));
      const key = url.searchParams.get('rogue') ? rogue.privateKey : privateKey;
      const token = jwt.sign(claims, key, {
        algorithm: 'RS256',
        keyid: KID,
        expiresIn: claims.expiresIn || '10m',
      });
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(token);
    }
    res.writeHead(404).end();
  })
  .listen(PORT, () => console.log(`dev idp listening on ${PORT}`));
