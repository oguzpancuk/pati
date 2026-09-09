/**
 * The per-user write ceilings (src/middleware/rateLimit.middleware.js) are
 * an abuse control nothing exercised: every one of them is a number in a
 * catalogue, and a mis-wired route would only show up in production as junk
 * nobody stopped. These tests mount a limiter on a throwaway express app —
 * no database, no auth — and prove the bucket is per user, that it bites at
 * the documented count, and that the refusal is the Turkish 429 the clients
 * are written against.
 *
 * The ad ceilings are the ones that carry money: impressions are what an
 * advertiser is billed for, and the client reports them.
 */
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const { limits, userRateLimit } = require('../src/middleware/rateLimit.middleware');

/** An app that trusts a header for the user id, so a test can switch users. */
function appWith(limiter) {
  const app = express();
  app.use((req, res, next) => {
    req.user = { userId: Number(req.get('x-user') || 1) };
    next();
  });
  app.post('/thing', limiter, (req, res) => res.status(201).json({ ok: true }));
  return app;
}

/** Starts the app on an ephemeral port and returns { post, close }. */
async function serve(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/thing`;
  return {
    post: (user = 1) => fetch(base, { method: 'POST', headers: { 'x-user': String(user) } }),
    close: () => server.close(),
  };
}

test('a bucket bites exactly at its limit, and only for that user', async () => {
  const { post, close } = await serve(appWith(userRateLimit({ windowMs: 60_000, limit: 3, action: 'deneme' })));
  try {
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await post(1)).status, 201, `request ${i + 1} should pass`);
    }
    const refused = await post(1);
    assert.equal(refused.status, 429);

    const body = await refused.json();
    assert.match(body.error, /Kısa sürede çok fazla deneme/);
    assert.ok(body.retryAfter > 0, 'the client needs a countdown');

    // The bucket is keyed on the user, not the address: a second account
    // from the same IP is untouched. This is the CGNAT rule the module's
    // docblock is built around.
    assert.equal((await post(2)).status, 201);
  } finally {
    close();
  }
});

test('ad impressions are capped, because they are the billing metric', async () => {
  const { post, close } = await serve(appWith(limits.adImpressions));
  try {
    for (let i = 0; i < 200; i += 1) {
      const res = await post(1);
      assert.equal(res.status, 201, `impression ${i + 1} should pass`);
    }
    const refused = await post(1);
    assert.equal(refused.status, 429);
    assert.match((await refused.json()).error, /reklam gösterimi/);
  } finally {
    close();
  }
});

test('ad clicks have their own, tighter bucket', async () => {
  const { post, close } = await serve(appWith(limits.adClicks));
  try {
    for (let i = 0; i < 60; i += 1) {
      assert.equal((await post(7)).status, 201, `click ${i + 1} should pass`);
    }
    assert.equal((await post(7)).status, 429);
  } finally {
    close();
  }
});

test('the catalogue is all middleware, and has not lost entries', () => {
  // A typo in the catalogue (`limits.adImpresions`) mounts `undefined`,
  // which express accepts as "no middleware" — the route stays uncapped and
  // nothing complains. The route files are pinned by their own e2e runs;
  // this pins the shape of what they mount.
  for (const [name, limiter] of Object.entries(limits)) {
    assert.equal(typeof limiter, 'function', `${name} should be middleware`);
  }
  assert.ok(Object.keys(limits).length >= 21, 'the catalogue should not have shrunk');
});
