/* ============================================================================
 * Captain Adel — billing & account API (Moyasar + Firebase).
 *
 * Self-contained inside the Express service (no Cloud Functions): the brain,
 * the site and billing all run in one Cloud Run process against the
 * surrounding project's Firestore via ADC. Mirrors Fly GACA's Moyasar design
 * (server-priced intents, opaque checkoutId, settle-once idempotency) so the
 * entitlement shape matches across products.
 *
 *   POST /v1/billing/checkout          (auth) -> priced intent for the widget
 *   POST /v1/billing/confirm           (auth) -> settle a returned payment
 *   POST /v1/billing/webhook           (raw)  -> settle via payment_paid
 *   POST /v1/billing/cancel-auto-renew (auth) -> stop future charges
 *   POST /v1/billing/renewals/run      (cron) -> charge due saved-card tokens
 *   GET  /v1/me                        (auth) -> { signedIn, plan, quota, ... }
 *   GET  /v1/config                           -> { launchMode, billingEnabled, ... }
 *
 * Everything ships dark: with no Moyasar secrets, checkout/confirm return 503
 * and /v1/config reports billingEnabled:false so the site renders a "free
 * during launch" state instead of a buy button.
 *
 * Trust model (ported from Fly GACA, two upstream defects fixed):
 *  - The browser never chooses a price: checkout writes a server-priced
 *    checkoutIntents/{uuid} and hands back only the opaque id; settle
 *    re-fetches the payment with the secret key and cross-checks
 *    amount+currency against the stored intent.
 *  - The moyasarPayments/{id} idempotency marker is claimed only AFTER the
 *    payment is verified paid and matching, so an early not-yet-paid
 *    observation can't burn the marker before the webhook lands.
 *  - Renewals charge subscriptions/{uid}.amountHalalas (the price actually
 *    sold), never the current env price.
 * ==========================================================================*/

'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const config = require('../config');
const firebase = require('../firebase');
const ent = require('./entitlements');
const mc = require('./moyasar-core');
const quota = require('../quota/quota');
const tierCore = require('./tier-core');
const authMiddleware = require('../middleware/auth');

const MOYASAR_API = 'https://api.moyasar.com/v1';

/* Resolved at call time so tests can stub the global fetch (the same
 * lazy-resolution test seam the old provider require() provided). */
async function moyasarRequest(path, init) {
  const auth = 'Basic ' + Buffer.from(config.moyasarSecretKey + ':').toString('base64');
  const res = await fetch(MOYASAR_API + path, {
    ...init,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(init && init.headers),
    },
  });
  if (!res.ok) throw new Error('moyasar_http_' + res.status);
  return res.json();
}

function billingEnabled() {
  return !!(config.moyasarSecretKey && firebase.available());
}

function priceEnv() {
  return {
    priceMonthlySar: config.moyasarPriceMonthlySar,
    priceAnnualSar: config.moyasarPriceAnnualSar,
  };
}

/* ---- POST /v1/billing/checkout ------------------------------------------- */
/* Price server-side, persist the intent, hand the widget an opaque id. */
async function checkoutHandler(req, res) {
  if (!billingEnabled()) { res.status(503).json({ error: 'billing_unavailable' }); return; }
  const uid = req.user && req.user.uid;
  if (!uid) { res.status(401).json({ error: 'sign_in_required' }); return; }

  const plan = (req.body && req.body.plan) === 'monthly' ? 'monthly' : 'annual';
  const cadence = mc.planToCadence(plan);
  const amount = mc.amountForPlan(plan, priceEnv());
  if (!amount) { res.status(503).json({ error: 'price_unconfigured' }); return; }

  try {
    const checkoutId = randomUUID();
    await firebase.db().collection('checkoutIntents').doc(checkoutId).set({
      uid,
      plan,
      cadence,
      amountHalalas: amount,
      currency: 'SAR',
      status: 'pending',
      createdAt: firebase.serverTimestamp(),
    });
    res.json({
      checkoutId,
      amount,
      currency: 'SAR',
      description: 'Captain Adel Pro (' + cadence + ')',
      callbackUrl: config.siteUrl + '/checkout.html',
      methods: ['creditcard', 'applepay', 'stcpay'],
      supportedNetworks: ['mada', 'visa', 'mastercard'],
      saveCard: true,
      publishableKey: config.moyasarPublishableKey || null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('checkout failed', String((err && err.message) || err));
    res.status(502).json({ error: 'checkout_failed' });
  }
}

/* ---- settle (shared by confirm + webhook) --------------------------------- */
/* Fetch the payment with the secret key, verify it settled and matches the
 * stored intent, claim the idempotency marker, then grant. Ordering is
 * load-bearing: the marker is claimed only after paid+match, so an early
 * observation of a pending payment leaves the marker free for the webhook. */
async function settlePayment(paymentId, { requireUid } = {}) {
  const payment = await moyasarRequest('/payments/' + encodeURIComponent(paymentId));

  const checkoutId = payment && payment.metadata && payment.metadata.checkoutId;
  if (!checkoutId) return { ok: false, code: 'intent_missing' };

  const intentRef = firebase.db().collection('checkoutIntents').doc(String(checkoutId));
  const intentSnap = await intentRef.get();
  if (!intentSnap.exists) return { ok: false, code: 'intent_missing' };
  const intent = intentSnap.data() || {};

  if (requireUid && intent.uid !== requireUid) return { ok: false, code: 'not_yours' };
  if (!mc.isPaid(payment)) return { ok: false, code: 'not_paid' };
  if (!mc.paymentMatchesIntent(payment, intent)) {
    // eslint-disable-next-line no-console
    console.error('moyasar amount mismatch', paymentId, payment.amount, intent.amountHalalas);
    return { ok: false, code: 'amount_mismatch' };
  }

  // Idempotency claim — create() fails if the doc exists (already settled).
  try {
    await firebase.db().collection('moyasarPayments').doc(String(paymentId))
      .create({ uid: intent.uid, checkoutId, settledAt: firebase.serverTimestamp() });
  } catch (_) {
    return { ok: true, alreadySettled: true };
  }

  const nowMs = Date.now();
  const grant = mc.entitlementFromCheckout(intent.cadence, nowMs);
  await ent.applyEntitlement(intent.uid, ent.grantSubscription({
    source: grant.source,
    startedAtMs: grant.startedAtMs,
    expiresAtMs: grant.expiresAtMs,
    extra: { store: 'MOYASAR' },
  }));
  authMiddleware.invalidate(intent.uid);   // buyer sees Pro now, not after the cache TTL

  const token = mc.tokenOf(payment);
  if (token) {
    const src = payment.source || {};
    await firebase.db().collection('moyasarCustomers').doc(intent.uid).set({
      token,
      brand: src.company || null,
      last4: src.last_four || null,
      updatedAt: firebase.serverTimestamp(),
    }, { merge: true });
  }

  await firebase.db().collection('subscriptions').doc(intent.uid).set({
    cadence: intent.cadence,
    amountHalalas: intent.amountHalalas,   // renewals charge THIS, never env price
    autoRenew: true,
    status: 'active',
    failedAttempts: 0,
    nextChargeAt: new Date(mc.nextChargeAt(grant.expiresAtMs)).toISOString(),
    updatedAt: firebase.serverTimestamp(),
  }, { merge: true });

  await intentRef.set({ status: 'fulfilled' }, { merge: true });
  return { ok: true };
}

/* ---- POST /v1/billing/confirm --------------------------------------------- */
/* The browser return leg: untrusted — everything is re-verified server-side. */
async function confirmHandler(req, res) {
  if (!billingEnabled()) { res.status(503).json({ error: 'billing_unavailable' }); return; }
  const uid = req.user && req.user.uid;
  if (!uid) { res.status(401).json({ error: 'sign_in_required' }); return; }
  const paymentId = req.body && req.body.paymentId;
  if (!paymentId || typeof paymentId !== 'string') {
    res.status(400).json({ error: 'payment_id_required' }); return;
  }
  try {
    const out = await settlePayment(paymentId, { requireUid: uid });
    if (out.ok) { res.json({ ok: true }); return; }
    if (out.code === 'not_yours') { res.status(403).json({ error: 'payment_not_yours' }); return; }
    if (out.code === 'not_paid') { res.status(409).json({ error: 'payment_not_settled' }); return; }
    res.status(409).json({ error: out.code });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('confirm failed', String((err && err.message) || err));
    res.status(502).json({ error: 'confirm_failed' });
  }
}

/* ---- POST /v1/billing/webhook (mounted with express.raw in server.js) ----- */
async function webhookHandler(req, res) {
  if (!config.moyasarSecretKey || !config.moyasarWebhookSecret) {
    res.status(503).send('billing_unavailable');
    return;
  }
  const raw = req.body;   // Buffer from express.raw — byte-exact for the HMAC
  const sig = req.headers['x-moyasar-signature'];
  if (!mc.verifyMoyasarSignature(raw, sig, config.moyasarWebhookSecret)) {
    res.status(400).send('signature verification failed');
    return;
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (_) {
    res.status(400).send('invalid payload');
    return;
  }
  const paymentId = (body && body.data && body.data.id) || (body && body.id);
  if (!paymentId) { res.status(400).send('missing payment id'); return; }
  try {
    await settlePayment(String(paymentId));   // not_paid etc. is fine — ack it
    res.json({ received: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('webhook handler failed', String((err && err.message) || err));
    res.status(500).send('handler error');   // Moyasar will retry
  }
}

/* ---- POST /v1/billing/cancel-auto-renew ----------------------------------- */
/* No Moyasar customer portal exists — cancellation is ours. The entitlement is
 * untouched: access runs to the already-granted expiresAt. */
async function cancelAutoRenewHandler(req, res) {
  if (!billingEnabled()) { res.status(503).json({ error: 'billing_unavailable' }); return; }
  const uid = req.user && req.user.uid;
  if (!uid) { res.status(401).json({ error: 'sign_in_required' }); return; }
  try {
    await firebase.db().collection('subscriptions').doc(uid).set({
      autoRenew: false,
      updatedAt: firebase.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('cancel-auto-renew failed', String((err && err.message) || err));
    res.status(502).json({ error: 'cancel_failed' });
  }
}

/* ---- POST /v1/billing/renewals/run (Cloud Scheduler) ---------------------- */
/* Charges due saved-card tokens. Guarded by CRON_SECRET, not user auth. */
async function renewalsHandler(req, res) {
  if (!config.cronSecret || req.headers['x-cron-key'] !== config.cronSecret) {
    res.status(401).json({ error: 'unauthorized' }); return;
  }
  if (!billingEnabled()) { res.status(503).json({ error: 'billing_unavailable' }); return; }

  const nowIso = new Date().toISOString();
  const out = { charged: 0, pastDue: 0, canceled: 0 };
  try {
    const due = await firebase.db().collection('subscriptions')
      .where('autoRenew', '==', true)
      .where('status', 'in', ['active', 'past_due'])
      .where('nextChargeAt', '<=', nowIso)
      .get();

    for (const doc of due.docs) {
      const uid = doc.id;
      const sub = doc.data() || {};
      // eslint-disable-next-line no-await-in-loop
      await renewOne(uid, sub, out);
    }
    res.json({ ok: true, ...out, scanned: due.size });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('renewals run failed', String((err && err.message) || err));
    res.status(502).json({ error: 'renewals_failed', ...out });
  }
}

async function renewOne(uid, sub, out) {
  const failedAttempts = sub.failedAttempts || 0;
  const subRef = firebase.db().collection('subscriptions').doc(uid);

  async function recordFailure() {
    const attempts = failedAttempts + 1;
    if (attempts >= mc.MAX_RENEWAL_ATTEMPTS) {
      out.canceled += 1;
      await subRef.set({ status: 'canceled', autoRenew: false, failedAttempts: attempts,
        updatedAt: firebase.serverTimestamp() }, { merge: true });
    } else {
      out.pastDue += 1;
      await subRef.set({ status: 'past_due', failedAttempts: attempts,
        updatedAt: firebase.serverTimestamp() }, { merge: true });
    }
  }

  const custSnap = await firebase.db().collection('moyasarCustomers').doc(uid).get();
  const token = custSnap.exists ? (custSnap.data() || {}).token : null;
  if (!token) { await recordFailure(); return; }

  let payment = null;
  try {
    payment = await moyasarRequest('/payments', {
      method: 'POST',
      body: JSON.stringify({
        amount: sub.amountHalalas,          // the price actually sold — never env
        currency: 'SAR',
        description: 'Captain Adel Pro renewal (' + sub.cadence + ')',
        callback_url: config.siteUrl + '/account.html',
        source: { type: 'token', token },
        metadata: { uid, renewal: 'true' },
      }),
    });
  } catch (_) { /* fall through to failure */ }

  if (!mc.isPaid(payment)) { await recordFailure(); return; }

  // Extend from the CURRENT expiry so an early charge never shaves paid time.
  const current = await ent.readEntitlement(uid);
  const baseMs = current && current.expiresAt ? Date.parse(current.expiresAt) : Date.now();
  const fromMs = Number.isFinite(baseMs) ? baseMs : Date.now();
  const newExpiryMs = mc.extendExpiry(fromMs, sub.cadence);
  await ent.applyEntitlement(uid, ent.grantSubscription({
    source: sub.cadence === 'monthly' ? 'monthly' : 'annual',
    startedAtMs: fromMs,
    expiresAtMs: newExpiryMs,
    extra: { store: 'MOYASAR' },
  }));
  authMiddleware.invalidate(uid);
  out.charged += 1;
  await subRef.set({
    status: 'active',
    failedAttempts: 0,
    nextChargeAt: new Date(mc.nextChargeAt(newExpiryMs)).toISOString(),
    updatedAt: firebase.serverTimestamp(),
  }, { merge: true });
}

/* ---- GET /v1/me ---------------------------------------------------------- */
async function meHandler(req, res) {
  const uid = req.user && req.user.uid;
  if (!uid) { res.json({ signedIn: false, launchMode: config.launchMode === 'free' }); return; }

  const launch = config.launchMode === 'free';
  const isPro = !!(req.user && req.user.isPro);
  let quotaInfo = null;
  if (!launch && !isPro && config.freeDaily > 0 && firebase.available()) {
    try {
      quotaInfo = await quota.peek(firebase.db(), {
        key: 'uid:' + uid, limit: config.freeDaily, period: config.freePeriod,
      });
    } catch (_) { /* fail open — no quota panel rather than an error */ }
  }
  res.json({
    signedIn: true,
    uid,
    email: (req.user && req.user.email) || '',
    plan: launch || isPro ? 'pro' : 'free',
    launchMode: launch,
    quota: quotaInfo,            // { remaining, limit } | null
    period: config.freePeriod,
  });
}

/* ---- GET /v1/config (public) -------------------------------------------- */
function configHandler(_req, res) {
  res.json({
    launchMode: config.launchMode === 'free',
    billingEnabled: billingEnabled(),
    authEnabled: firebase.available(),
    moyasarPublishableKey: config.moyasarPublishableKey || null,
    freeDaily: config.freeDaily,
    anonDaily: config.anonDaily,
    period: config.freePeriod,
  });
}

/* The router for the JSON-parsed routes. The webhook is exported separately and
 * mounted with express.raw BEFORE the global express.json in server.js. */
const router = express.Router();
router.post('/billing/checkout', express.json({ limit: 16 * 1024 }), authMiddleware, checkoutHandler);
router.post('/billing/confirm', express.json({ limit: 16 * 1024 }), authMiddleware, confirmHandler);
router.post('/billing/cancel-auto-renew', express.json({ limit: 16 * 1024 }), authMiddleware, cancelAutoRenewHandler);
router.post('/billing/renewals/run', express.json({ limit: 16 * 1024 }), renewalsHandler);
router.get('/me', authMiddleware, meHandler);
router.get('/config', configHandler);

module.exports = {
  router,
  webhookHandler,
  // exported for tests
  checkoutHandler, confirmHandler, cancelAutoRenewHandler, renewalsHandler,
  meHandler, configHandler, billingEnabled, settlePayment,
  _tierCore: tierCore,
};
