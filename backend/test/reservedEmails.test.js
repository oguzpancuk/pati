/**
 * The domains no LIVE account may wear, and the rule both doors that create
 * a user share. Two of the three are the bot worlds' — an account there
 * would be flagged as a bot by the next seed and deleted by the next purge.
 * The third is the tombstone domain a deleted account is renamed into: an
 * account there is one the admin panel refuses to delete (409) and no
 * longer offers a button for, so it could never be removed at all.
 *
 * `socialLogin` used to skip this check entirely, which left the invariant
 * enforced at one door of two (second review of the fix).
 */
const test = require('node:test');
const assert = require('node:assert');

const { isReservedEmail, RESERVED_EMAIL_DOMAINS } = require('../src/controllers/auth.controller');

test('the three reserved domains are refused', () => {
  assert.deepEqual(RESERVED_EMAIL_DOMAINS, [
    '@pati.demo',
    '@stray.test',
    '@deleted.pati-app.com',
  ]);
  for (const domain of RESERVED_EMAIL_DOMAINS) {
    assert.equal(isReservedEmail(`birisi${domain}`), true, domain);
  }
});

test('it normalises before deciding, so case and spacing cannot slip past', () => {
  assert.equal(isReservedEmail('  Birisi@Deleted.Pati-App.Com  '), true);
  assert.equal(isReservedEmail('SILINMIS-42@DELETED.PATI-APP.COM'), true);
  assert.equal(isReservedEmail('Bot@Pati.Demo'), true);
});

test('an ordinary address is not refused', () => {
  for (const email of [
    'birisi@example.com',
    'birisi@gmail.com',
    // Not a subdomain match: the '@' is inside the pattern.
    'birisi@sub.deleted.pati-app.com.example.com',
    'deleted.pati-app.com@example.com',
    'birisi@pati-app.com',
  ]) {
    assert.equal(isReservedEmail(email), false, email);
  }
});

test('a missing or non-string address is not a crash', () => {
  for (const value of [undefined, null, '', '   ', 42, {}]) {
    assert.equal(isReservedEmail(value), false, String(value));
  }
});
