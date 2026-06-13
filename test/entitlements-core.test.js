/* Unit tests — src/billing/entitlements-core.js
 *
 * The entitlement record's pure logic: isActive across every expiresAt shape,
 * the subscription-grace clamp (a subscription must never become perpetual),
 * and the grant/revoke mutators. No Firestore. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ec = require('../src/billing/entitlements-core');

const HOUR = 3600 * 1000;
const NOW = Date.UTC(2026, 5, 12, 12, 0, 0);

/* ---- isActive ---- */

test('isActive: false for null / non-objects / free plan', () => {
  assert.equal(ec.isActive(null), false);
  assert.equal(ec.isActive('pro'), false);
  assert.equal(ec.isActive({ plan: 'free' }), false);
  assert.equal(ec.isActive({}), false);
});

test('isActive: pro with null expiry is perpetual', () => {
  assert.equal(ec.isActive({ plan: 'pro', expiresAt: null }), true);
});

test('isActive: ISO string expiry — future active, past not', () => {
  assert.equal(ec.isActive({ plan: 'pro', expiresAt: new Date(NOW + HOUR).toISOString() }, NOW), true);
  assert.equal(ec.isActive({ plan: 'pro', expiresAt: new Date(NOW - HOUR).toISOString() }, NOW), false);
});

test('isActive: Firestore Timestamp-like (toDate) expiry', () => {
  const ts = (ms) => ({ toDate: () => new Date(ms) });
  assert.equal(ec.isActive({ plan: 'pro', expiresAt: ts(NOW + HOUR) }, NOW), true);
  assert.equal(ec.isActive({ plan: 'pro', expiresAt: ts(NOW - HOUR) }, NOW), false);
});

test('isActive: {seconds} expiry shape', () => {
  assert.equal(ec.isActive({ plan: 'pro', expiresAt: { seconds: (NOW + HOUR) / 1000 } }, NOW), true);
  assert.equal(ec.isActive({ plan: 'pro', expiresAt: { seconds: (NOW - HOUR) / 1000 } }, NOW), false);
});

test('isActive: unparseable expiry is not active', () => {
  assert.equal(ec.isActive({ plan: 'pro', expiresAt: 'not-a-date' }, NOW), false);
  assert.equal(ec.isActive({ plan: 'pro', expiresAt: {} }, NOW), false);
});

/* ---- safeSubscriptionExpiry (the grace clamp) ---- */

test('safeSubscriptionExpiry: a future expiry passes through', () => {
  assert.equal(ec.safeSubscriptionExpiry(NOW + HOUR, NOW), NOW + HOUR);
});

test('safeSubscriptionExpiry: missing/invalid/past expiry clamps to the grace window', () => {
  const grace = NOW + ec.SUBSCRIPTION_GRACE_MS;
  assert.equal(ec.safeSubscriptionExpiry(null, NOW), grace);
  assert.equal(ec.safeSubscriptionExpiry(undefined, NOW), grace);
  assert.equal(ec.safeSubscriptionExpiry(NaN, NOW), grace);
  assert.equal(ec.safeSubscriptionExpiry(NOW - HOUR, NOW), grace);
});

/* ---- mutators ---- */

test('grantSubscription: writes a pro record with the given source and dates', () => {
  // A genuinely future expiry passes the grace clamp untouched (the clamp reads
  // the real clock, so a future date relative to "now" is what's under test).
  const future = Date.now() + 365 * 24 * HOUR;
  const next = ec.grantSubscription({
    source: 'annual', startedAtMs: NOW - HOUR, expiresAtMs: future,
    extra: { store: 'STRIPE' },
  })(ec.normalize(null));
  assert.equal(next.plan, 'pro');
  assert.equal(next.source, 'annual');
  assert.equal(next.startedAt, new Date(NOW - HOUR).toISOString());
  assert.equal(next.expiresAt, new Date(future).toISOString());
  assert.equal(next.store, 'STRIPE');
});

test('grantSubscription: a subscription never becomes perpetual (no null expiry)', () => {
  const next = ec.grantSubscription({ source: 'monthly', startedAtMs: NOW, expiresAtMs: null })({});
  assert.notEqual(next.expiresAt, null);
  assert.ok(Date.parse(next.expiresAt) > Date.now());
});

test('revoke: drops to free/expired with cleared dates', () => {
  const next = ec.revoke()({ plan: 'pro', source: 'annual', expiresAt: 'whatever' });
  assert.deepEqual(next, { plan: 'free', source: 'expired', startedAt: null, expiresAt: null });
});

test('normalize: non-objects become a fresh empty record', () => {
  assert.deepEqual(ec.normalize(null), {});
  assert.deepEqual(ec.normalize('x'), {});
  const raw = { plan: 'pro' };
  const norm = ec.normalize(raw);
  assert.deepEqual(norm, raw);
  assert.notEqual(norm, raw);            // a copy, never the stored reference
});
