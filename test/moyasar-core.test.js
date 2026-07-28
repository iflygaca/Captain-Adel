/* Unit tests — src/billing/moyasar-core.js (pure logic, no network). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const mc = require('../src/billing/moyasar-core');

const DAY_MS = 24 * 60 * 60 * 1000;

/* ---- pricing --------------------------------------------------------------*/

test('sarToHalalas: converts SAR strings to integer halalas', () => {
  assert.equal(mc.sarToHalalas('35'), 3500);
  assert.equal(mc.sarToHalalas('299'), 29900);
  assert.equal(mc.sarToHalalas('34.99'), 3499);
});

test('sarToHalalas: null on missing/zero/negative/garbage', () => {
  assert.equal(mc.sarToHalalas(''), null);
  assert.equal(mc.sarToHalalas(undefined), null);
  assert.equal(mc.sarToHalalas('0'), null);
  assert.equal(mc.sarToHalalas('-5'), null);
  assert.equal(mc.sarToHalalas('abc'), null);
});

test('planToCadence: monthly stays monthly, everything else is annual', () => {
  assert.equal(mc.planToCadence('monthly'), 'monthly');
  assert.equal(mc.planToCadence('annual'), 'annual');
  assert.equal(mc.planToCadence('weird'), 'annual');
  assert.equal(mc.planToCadence(undefined), 'annual');
});

test('amountForPlan: prices from env only, null when unset', () => {
  const env = { priceMonthlySar: '35', priceAnnualSar: '299' };
  assert.equal(mc.amountForPlan('monthly', env), 3500);
  assert.equal(mc.amountForPlan('annual', env), 29900);
  assert.equal(mc.amountForPlan('annual', { priceMonthlySar: '35', priceAnnualSar: '' }), null);
});

/* ---- renewal math ---------------------------------------------------------*/

test('cadenceDays: 30 monthly, 365 annual', () => {
  assert.equal(mc.cadenceDays('monthly'), 30);
  assert.equal(mc.cadenceDays('annual'), 365);
});

test('nextChargeAt: RENEWAL_LEAD_DAYS before expiry', () => {
  const expiry = Date.UTC(2027, 0, 31);
  assert.equal(mc.nextChargeAt(expiry), expiry - 3 * DAY_MS);
});

test('extendExpiry: extends from the CURRENT expiry, not from now', () => {
  const expiry = Date.UTC(2027, 0, 1);
  assert.equal(mc.extendExpiry(expiry, 'monthly'), expiry + 30 * DAY_MS);
  assert.equal(mc.extendExpiry(expiry, 'annual'), expiry + 365 * DAY_MS);
});

test('entitlementFromCheckout: window and source per cadence', () => {
  const now = Date.UTC(2026, 6, 27);
  const m = mc.entitlementFromCheckout('monthly', now);
  assert.deepEqual(m, { source: 'monthly', startedAtMs: now, expiresAtMs: now + 30 * DAY_MS });
  const a = mc.entitlementFromCheckout('annual', now);
  assert.equal(a.source, 'annual');
  assert.equal(a.expiresAtMs, now + 365 * DAY_MS);
});

/* ---- payment interpretation ----------------------------------------------*/

test('isPaid: only status paid settles', () => {
  assert.equal(mc.isPaid({ status: 'paid' }), true);
  assert.equal(mc.isPaid({ status: 'authorized' }), false);
  assert.equal(mc.isPaid({ status: 'initiated' }), false);
  assert.equal(mc.isPaid({ status: 'failed' }), false);
  assert.equal(mc.isPaid(null), false);
});

test('paymentMatchesIntent: amount AND currency must match', () => {
  const intent = { amountHalalas: 29900, currency: 'SAR' };
  assert.equal(mc.paymentMatchesIntent({ amount: 29900, currency: 'SAR' }, intent), true);
  assert.equal(mc.paymentMatchesIntent({ amount: 100, currency: 'SAR' }, intent), false);
  assert.equal(mc.paymentMatchesIntent({ amount: 29900, currency: 'USD' }, intent), false);
  assert.equal(mc.paymentMatchesIntent(null, intent), false);
});

test('tokenOf: creditcard token only; Apple Pay / STC Pay are single-use', () => {
  assert.equal(mc.tokenOf({ source: { type: 'creditcard', token: 'tok_1' } }), 'tok_1');
  assert.equal(mc.tokenOf({ source: { type: 'applepay' } }), null);
  assert.equal(mc.tokenOf({ source: { type: 'stcpay' } }), null);
  assert.equal(mc.tokenOf({}), null);
});

/* ---- webhook signature ----------------------------------------------------*/

test('verifyMoyasarSignature: accepts a correctly signed raw body', () => {
  const body = Buffer.from('{"id":"pay_1","status":"paid"}', 'utf8');
  const sig = createHmac('sha256', 'whsec').update(body).digest('hex');
  assert.equal(mc.verifyMoyasarSignature(body, sig, 'whsec'), true);
});

test('verifyMoyasarSignature: rejects a tampered body', () => {
  const body = Buffer.from('{"id":"pay_1","status":"paid"}', 'utf8');
  const sig = createHmac('sha256', 'whsec').update(body).digest('hex');
  const tampered = Buffer.from('{"id":"pay_1","status":"PAID"}', 'utf8');
  assert.equal(mc.verifyMoyasarSignature(tampered, sig, 'whsec'), false);
});

test('verifyMoyasarSignature: rejects wrong secret / missing pieces', () => {
  const body = Buffer.from('{}', 'utf8');
  const sig = createHmac('sha256', 'whsec').update(body).digest('hex');
  assert.equal(mc.verifyMoyasarSignature(body, sig, 'other'), false);
  assert.equal(mc.verifyMoyasarSignature(body, '', 'whsec'), false);
  assert.equal(mc.verifyMoyasarSignature(body, sig, ''), false);
  assert.equal(mc.verifyMoyasarSignature(null, sig, 'whsec'), false);
});
