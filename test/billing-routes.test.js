/* Integration tests — the billing/account HTTP surface, against the real
 * Express app. These run with NO Firebase project and NO Stripe secrets set, so
 * they prove the SaaS layer ships dark: /v1/config reports it off, checkout 503s,
 * /v1/me degrades to anonymous, and the webhook rejects a bad signature.
 *
 * The webhook test with a Stripe-signed payload proves the raw-body mount
 * ordering in server.js — if express.json ran first, signature verification
 * would fail on the restringified body. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Stripe test secrets BEFORE requiring the server, so config captures them and
// the webhook path can actually verify a signature (test mode, no network: the
// SDK's constructEvent + generateTestHeaderString are pure crypto).
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
// No FIREBASE_PROJECT_ID / price ids — billing stays "dark" for the other paths.
delete process.env.FIREBASE_PROJECT_ID;
delete process.env.GOOGLE_CLOUD_PROJECT;

const { app } = require('../src/server');
const Stripe = require('stripe');

let server; let base;
before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server && server.close());

async function req(method, path, { body, headers, raw } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: Object.assign(
      raw ? {} : (body ? { 'Content-Type': 'application/json' } : {}),
      headers || {}),
    body: raw ? raw : (body ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
}

test('GET /v1/config: reports the dark state (no project / no prices)', async () => {
  const r = await req('GET', '/v1/config');
  assert.equal(r.status, 200);
  assert.equal(r.json.authEnabled, false);     // no Firebase project configured
  assert.equal(r.json.billingEnabled, false);  // needs both Stripe key AND a project
  assert.equal(r.json.launchMode, false);
  assert.equal(typeof r.json.freeDaily, 'number');
});

test('GET /v1/me: anonymous without a token', async () => {
  const r = await req('GET', '/v1/me');
  assert.equal(r.status, 200);
  assert.equal(r.json.signedIn, false);
});

test('POST /v1/billing/checkout: 503 while billing is dark', async () => {
  const r = await req('POST', '/v1/billing/checkout', { body: { plan: 'annual' } });
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'billing_unavailable');
});

test('POST /v1/billing/webhook: rejects a missing/bad signature with 400', async () => {
  const r = await req('POST', '/v1/billing/webhook', {
    raw: JSON.stringify({ id: 'evt_1', type: 'ping' }),
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 'bad' },
  });
  assert.equal(r.status, 400);
});

test('POST /v1/billing/webhook: accepts a correctly-signed payload (raw-body proof)', async () => {
  // An event we handle by no-op (no uid) — it should still verify and 200.
  const payload = JSON.stringify({
    id: 'evt_test', object: 'event', type: 'customer.subscription.updated',
    data: { object: { status: 'past_due' } },   // statusAction -> 'none'
  });
  const stripe = new Stripe('sk_test_dummy');
  const header = stripe.webhooks.generateTestHeaderString({
    payload, secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const r = await req('POST', '/v1/billing/webhook', {
    raw: payload,
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.received, true);
});

test('/v1/chat contract is unchanged for the trusted gateway tier', async () => {
  // Without ADEL_API_KEY configured the request is untrusted; with no message it
  // should 400 from the guard, proving the chat route still mounts and the new
  // auth/tier middleware never blocks an anonymous caller before the guard.
  const r = await req('POST', '/v1/chat', { body: { message: '' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'message_required');
});
