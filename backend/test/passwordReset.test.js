/**
 * The password-reset flow (migrations/013, utils/passwordReset.js, the three
 * /auth endpoints). These tests run WITHOUT a database, like every other file
 * here, so they cover the three parts that do not need one:
 *
 *   - the code and hash helpers, where a rewrite silently loses the salting
 *     or the zero-padding and nobody notices until codes stop matching;
 *   - the password rule, which must be ONE rule shared by registration, the
 *     reset and the change — a second rule produces an account whose own
 *     login refuses its password;
 *   - the limiter catalogue, where a typo mounts `undefined` and express
 *     accepts it as "no middleware", leaving the endpoint uncapped;
 *   - and the neutral answer's shape, the whole security property of
 *     forgot-password.
 *
 * What is deliberately NOT here: the round trip itself. Issuing a code,
 * typing it and getting a session needs a database and a mail transport, and
 * that is the curl check the commit runs (CLAUDE.md, Verification) — a fake
 * pool pretending to be Postgres would pin our fake, not our SQL.
 */
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const passwordReset = require('../src/utils/passwordReset');
const { passwordComplaint, MIN_PASSWORD_LENGTH } = require('../src/controllers/auth.controller');
const { limits } = require('../src/middleware/rateLimit.middleware');

test('a code is six digits, and a leading zero is a digit like any other', () => {
  let sawLeadingZero = false;
  for (let i = 0; i < 500; i += 1) {
    const code = passwordReset.newCode();
    assert.match(code, /^\d{6}$/, `"${code}" should be six digits`);
    if (code[0] === '0') sawLeadingZero = true;
  }
  // ~10% of codes start with a zero. Dropping the padding (String(randomInt)
  // alone) makes those five digits long, and the client's /^\d{6}$/ refuses
  // a code we ourselves mailed.
  assert.ok(sawLeadingZero, '500 codes should include one starting with 0');
});

test('the hash is salted, and a code is never stored in the clear', () => {
  const code = '123456';
  const a = passwordReset.hashCode('saltone', code);
  const b = passwordReset.hashCode('salttwo', code);

  assert.match(a, /^[0-9a-f]{64}$/, 'sha256 hex, the width CHAR(64) reserves');
  assert.equal(a, passwordReset.hashCode('saltone', code), 'same salt + code, same hash');
  assert.notEqual(a, b, 'the per-row salt must reach the digest');
  assert.notEqual(a, passwordReset.hashCode('saltone', '123457'), 'a different code differs');
  assert.ok(!a.includes(code), 'the code itself must not survive into the row');
});

test('the neutral answer names no address and no account', () => {
  const answer = passwordReset.NEUTRAL_ANSWER;
  // Frozen so no handler can decorate it with something that varies — the
  // moment one address gets a different body, the endpoint is an
  // account-enumeration oracle.
  assert.ok(Object.isFrozen(answer), 'the neutral answer must not be mutable');
  assert.deepEqual(Object.keys(answer).sort(), ['message', 'ok']);
  assert.equal(answer.ok, true);
  assert.match(answer.message, /varsa/, 'the wording stays conditional ("if there is an account")');
  // No count, no id, no "gönderildi/gönderilemedi" — nothing that could
  // differ between an address that exists and one that does not.
  assert.equal(JSON.stringify(answer), JSON.stringify({ ...answer }));
});

test('one password rule, and it is the one register already enforced', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8, 'register has always said 8 characters');
  assert.equal(passwordComplaint('a'.repeat(MIN_PASSWORD_LENGTH)), null);
  assert.equal(passwordComplaint('çğıöşü12'), null, 'Turkish characters count as characters');

  assert.match(passwordComplaint('a'.repeat(MIN_PASSWORD_LENGTH - 1)), /en az 8 karakter/);
  // The message registration has been answering with since it existed; both
  // clients show it verbatim.
  assert.equal(passwordComplaint('kisa'), 'Şifre en az 8 karakter olmalıdır');

  // A non-string reaches bcrypt, which throws, and the error handler would
  // echo its English message at a Turkish user.
  for (const value of [undefined, null, 12345678, {}, ['a'.repeat(8)]]) {
    assert.match(passwordComplaint(value), /metin olmalıdır/, `${JSON.stringify(value)} refused`);
  }
});

test('the three password limiters are mounted middleware, not undefined', () => {
  for (const name of ['forgotPassword', 'resetPassword', 'changePassword']) {
    assert.equal(typeof limits[name], 'function', `limits.${name} should be middleware`);
  }
});

test('the forgot-password bucket bites, in Turkish, with a countdown', async () => {
  const app = express();
  // Unauthenticated, like the real route: no req.user, so the limiter falls
  // back to the IP — the behaviour the two signed-out endpoints rely on.
  app.post('/forgot', limits.forgotPassword, (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/forgot`;

  try {
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await fetch(url, { method: 'POST' })).status, 200, `request ${i + 1}`);
    }
    const refused = await fetch(url, { method: 'POST' });
    assert.equal(refused.status, 429);
    const body = await refused.json();
    assert.match(body.error, /Kısa sürede çok fazla şifre sıfırlama isteği/);
    assert.ok(body.retryAfter > 0, 'the sheet counts the wait down');
  } finally {
    server.close();
  }
});
