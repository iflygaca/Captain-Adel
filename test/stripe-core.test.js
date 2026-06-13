/* Unit tests — src/billing/stripe-core.js
 *
 * The Stripe webhook's pure mappings: uid extraction, interval -> source, and
 * subscription-status -> action. No Stripe SDK. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const sc = require('../src/billing/stripe-core');

test('uidOf: prefers metadata.firebaseUID', () => {
  assert.equal(sc.uidOf({ metadata: { firebaseUID: 'u1' }, client_reference_id: 'u2' }), 'u1');
});

test('uidOf: falls back to client_reference_id', () => {
  assert.equal(sc.uidOf({ client_reference_id: 'u2' }), 'u2');
});

test('uidOf: null when neither present', () => {
  assert.equal(sc.uidOf({}), null);
  assert.equal(sc.uidOf(null), null);
});

test('sourceForInterval: month => monthly, anything else => annual', () => {
  assert.equal(sc.sourceForInterval('month'), 'monthly');
  assert.equal(sc.sourceForInterval('year'), 'annual');
  assert.equal(sc.sourceForInterval(null), 'annual');
});

test('intervalOf: reads the first line item recurring interval', () => {
  const sub = { items: { data: [{ price: { recurring: { interval: 'month' } } }] } };
  assert.equal(sc.intervalOf(sub), 'month');
});

test('intervalOf: null when shape is missing', () => {
  assert.equal(sc.intervalOf({}), null);
  assert.equal(sc.intervalOf({ items: { data: [] } }), null);
  assert.equal(sc.intervalOf(null), null);
});

test('statusAction: active/trialing grant', () => {
  assert.equal(sc.statusAction('active'), 'grant');
  assert.equal(sc.statusAction('trialing'), 'grant');
});

test('statusAction: ended states revoke', () => {
  assert.equal(sc.statusAction('canceled'), 'revoke');
  assert.equal(sc.statusAction('unpaid'), 'revoke');
  assert.equal(sc.statusAction('incomplete_expired'), 'revoke');
});

test('statusAction: transient states do nothing (keep current entitlement)', () => {
  assert.equal(sc.statusAction('past_due'), 'none');
  assert.equal(sc.statusAction('incomplete'), 'none');
  assert.equal(sc.statusAction('paused'), 'none');
});
