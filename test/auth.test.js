/* Unit tests — src/middleware/auth.js.
 *
 * Optional Firebase identity that NEVER blocks: an absent/unverifiable token or
 * any Firestore hiccup degrades to an anonymous visitor. A 60s in-memory cache
 * keeps the entitlement read off the hot path. Firebase + entitlements are
 * faked by overriding the required module methods (assign-and-restore); the
 * exported _cache is cleared between tests. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ent = require('../src/billing/entitlements');
const config = require('../src/config');
const authMiddleware = require('../src/middleware/auth');

/* Run the middleware under a set of fakes, then restore everything. `overrides`
 * may set: available (bool), verify (uid|throws), readEntitlement (fn),
 * isActive (fn), launchMode (string). */
async function run(req, overrides = {}) {
  const savedVerifier = authMiddleware.__getVerifier();
  const saved = {
    readEntitlement: ent.readEntitlement, isActive: ent.isActive,
    launchMode: config.launchMode,
  };
  authMiddleware.__setVerifier({
    available: () => overrides.available !== false,
    verifyIdToken: overrides.verify
      || (async (t) => ({ uid: `uid-${t}`, email: `${t}@x.com` })),
  });
  if (overrides.readEntitlement) ent.readEntitlement = overrides.readEntitlement;
  if (overrides.isActive) ent.isActive = overrides.isActive;
  config.launchMode = overrides.launchMode || '';
  let nexted = false;
  try {
    await authMiddleware(req, {}, () => { nexted = true; });
    return { user: req.user, nexted };
  } finally {
    authMiddleware.__setVerifier(savedVerifier);
    Object.assign(ent, { readEntitlement: saved.readEntitlement, isActive: saved.isActive });
    config.launchMode = saved.launchMode;
  }
}

function reqWith(token) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

test.beforeEach(() => authMiddleware._cache.clear());

test('no Authorization header -> anonymous, still calls next', async () => {
  const { user, nexted } = await run(reqWith(null));
  assert.deepEqual(user, { uid: '', isPro: false, email: '' });
  assert.equal(nexted, true);
});

test('Firebase layer dark (available() false) -> anonymous even with a token', async () => {
  const { user } = await run(reqWith('tok'), { available: false });
  assert.equal(user.uid, '');
  assert.equal(user.isPro, false);
});

test('an unverifiable token stays anonymous (never 401)', async () => {
  const { user, nexted } = await run(reqWith('bad'), {
    verify: async () => { throw new Error('invalid token'); },
  });
  assert.equal(user.uid, '');
  assert.equal(user.isPro, false);
  assert.equal(nexted, true);
});

test('launch mode "free" reads every signed-in user as Pro without a Firestore read', async () => {
  let read = 0;
  const { user } = await run(reqWith('alice'), {
    launchMode: 'free',
    readEntitlement: async () => { read++; return null; },
  });
  assert.equal(user.uid, 'uid-alice');
  assert.equal(user.isPro, true);
  assert.equal(read, 0, 'launch-free short-circuits the entitlement read');
});

test('a verified user resolves isPro from the live entitlement', async () => {
  const { user } = await run(reqWith('pro'), {
    readEntitlement: async () => ({ active: true }),
    isActive: (e) => !!(e && e.active),
  });
  assert.equal(user.uid, 'uid-pro');
  assert.equal(user.email, 'pro@x.com');
  assert.equal(user.isPro, true);
});

test('entitlement read is cached: a second turn within the TTL does not re-read', async () => {
  let reads = 0;
  const overrides = {
    readEntitlement: async () => { reads++; return { active: true }; },
    isActive: (e) => !!(e && e.active),
  };
  await run(reqWith('cached'), overrides);
  await run(reqWith('cached'), overrides);   // same uid -> cache hit
  assert.equal(reads, 1);
});

test('cache entry past the 60s TTL is re-read', async () => {
  let reads = 0;
  const overrides = {
    readEntitlement: async () => { reads++; return { active: true }; },
    isActive: (e) => !!(e && e.active),
  };
  await run(reqWith('aging'), overrides);
  // Age the cached entry past ENTITLEMENT_TTL_MS (60s).
  const entry = authMiddleware._cache.get('uid-aging');
  entry.at -= 61 * 1000;
  await run(reqWith('aging'), overrides);
  assert.equal(reads, 2);
});

test('a Firestore outage reads as free and does NOT cache the miss (next turn retries)', async () => {
  let reads = 0;
  const overrides = {
    readEntitlement: async () => { reads++; throw new Error('firestore down'); },
    isActive: (e) => !!(e && e.active),
  };
  const first = await run(reqWith('blip'), overrides);
  assert.equal(first.user.isPro, false);
  assert.equal(authMiddleware._cache.has('uid-blip'), false, 'the miss must not be cached');
  await run(reqWith('blip'), overrides);     // retries rather than serving a cached false
  assert.equal(reads, 2);
});

test('invalidate(uid) drops the cached entry so the next turn re-reads', async () => {
  let reads = 0;
  const overrides = {
    readEntitlement: async () => { reads++; return { active: true }; },
    isActive: (e) => !!(e && e.active),
  };
  await run(reqWith('buyer'), overrides);
  authMiddleware.invalidate('uid-buyer');
  await run(reqWith('buyer'), overrides);
  assert.equal(reads, 2);
});
