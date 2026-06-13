/* ============================================================================
 * Captain Adel — billing & account API (Stripe + Firebase).
 *
 * Self-contained inside the Express service (no Cloud Functions): the brain, the
 * site and billing all run in one Cloud Run process against the surrounding
 * project's Firestore via ADC. Ported from the Fly GACA gateway's stripe.js so
 * the webhook vocabulary and entitlement shape match across products.
 *
 *   POST /v1/billing/checkout   (auth) -> { url }          Stripe Checkout
 *   POST /v1/billing/portal     (auth) -> { url }          Stripe customer portal
 *   POST /v1/billing/webhook    (raw)  -> { received }      signature-verified
 *   GET  /v1/me                 (auth) -> { signedIn, plan, quota, ... }
 *   GET  /v1/config                    -> { launchMode, billingEnabled, ... }
 *
 * Everything ships dark: with no Stripe secrets, checkout/portal return 503 and
 * /v1/config reports billingEnabled:false so the site renders a "free during
 * launch" state instead of a buy button.
 * ==========================================================================*/

'use strict';

const express = require('express');
const config = require('../config');
const firebase = require('../firebase');
const ent = require('./entitlements');
const sc = require('./stripe-core');
const quota = require('../quota/quota');
const tierCore = require('./tier-core');
const authMiddleware = require('../middleware/auth');

// Lazy require so module load never depends on the package being installed
// (keeps `npm run smoke` and the eval harness credential/dependency-free).
function stripe() { return require('stripe')(config.stripeSecretKey); }

function billingEnabled() {
  return !!(config.stripeSecretKey && firebase.available());
}

/* ---- Stripe Checkout ----------------------------------------------------- */
async function checkoutHandler(req, res) {
  if (!billingEnabled()) { res.status(503).json({ error: 'billing_unavailable' }); return; }
  const uid = req.user && req.user.uid;
  if (!uid) { res.status(401).json({ error: 'sign_in_required' }); return; }

  const plan = (req.body && req.body.plan) === 'monthly' ? 'monthly' : 'annual';
  const price = plan === 'monthly' ? config.stripePriceMonthly : config.stripePriceAnnual;
  if (!price) { res.status(503).json({ error: 'price_unconfigured' }); return; }

  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: uid,
      customer_email: (req.user && req.user.email) || undefined,
      // Stamp the uid on the subscription so renewal/cancel webhooks map back.
      subscription_data: { metadata: { firebaseUID: uid } },
      metadata: { firebaseUID: uid },
      allow_promotion_codes: true,
      success_url: config.siteUrl + '/account.html?checkout=success',
      cancel_url: config.siteUrl + '/?checkout=cancel#pricing',
    });
    res.json({ url: session.url });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('checkout failed', String((err && err.message) || err));
    res.status(502).json({ error: 'checkout_failed' });
  }
}

/* ---- Stripe customer portal (manage / cancel) ---------------------------- */
async function portalHandler(req, res) {
  if (!billingEnabled()) { res.status(503).json({ error: 'billing_unavailable' }); return; }
  const uid = req.user && req.user.uid;
  if (!uid) { res.status(401).json({ error: 'sign_in_required' }); return; }
  try {
    const snap = await firebase.db().collection('users').doc(uid).get();
    const customer = snap.exists ? (snap.data() || {}).stripeCustomerId : null;
    if (!customer) { res.status(409).json({ error: 'no_subscription' }); return; }
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: config.siteUrl + '/account.html',
    });
    res.json({ url: session.url });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('portal failed', String((err && err.message) || err));
    res.status(502).json({ error: 'portal_failed' });
  }
}

/* ---- Stripe webhook (mounted with express.raw in server.js) -------------- */
async function grantFromSubscription(sub, uid, extra) {
  await ent.applyEntitlement(uid, ent.grantSubscription({
    source: sc.sourceForInterval(sc.intervalOf(sub)),
    startedAtMs: (sub.start_date || sub.created) ? (sub.start_date || sub.created) * 1000 : null,
    expiresAtMs: sub.current_period_end ? sub.current_period_end * 1000 : null,
    extra: { store: 'STRIPE' },
  }), extra);
  authMiddleware.invalidate(uid);   // buyer sees Pro now, not after the cache TTL
}

async function webhookHandler(req, res) {
  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    res.status(503).send('billing_unavailable');
    return;
  }
  let evt;
  try {
    evt = stripe().webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], config.stripeWebhookSecret);
  } catch (_) {
    res.status(400).send('signature verification failed');
    return;
  }

  try {
    const obj = evt.data.object;
    if (evt.type === 'checkout.session.completed') {
      const uid = sc.uidOf(obj);
      if (uid && obj.subscription) {
        const sub = await stripe().subscriptions.retrieve(obj.subscription);
        // Remember the customer so the portal can find them later.
        await grantFromSubscription(sub, uid, obj.customer ? { stripeCustomerId: obj.customer } : null);
      }
    } else if (evt.type === 'customer.subscription.created'
            || evt.type === 'customer.subscription.updated') {
      const uid = sc.uidOf(obj);
      if (uid) {
        const action = sc.statusAction(obj.status);
        if (action === 'grant') await grantFromSubscription(obj, uid);
        else if (action === 'revoke') {
          await ent.applyEntitlement(uid, ent.revoke());
          authMiddleware.invalidate(uid);
        }
      }
    } else if (evt.type === 'customer.subscription.deleted') {
      const uid = sc.uidOf(obj);
      if (uid) {
        await ent.applyEntitlement(uid, ent.revoke());
        authMiddleware.invalidate(uid);
      }
    }
    res.json({ received: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('webhook handler failed', evt && evt.type, String((err && err.message) || err));
    res.status(500).send('handler error');   // Stripe will retry
  }
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
    freeDaily: config.freeDaily,
    anonDaily: config.anonDaily,
    period: config.freePeriod,
  });
}

/* The router for the JSON-parsed routes. The webhook is exported separately and
 * mounted with express.raw BEFORE the global express.json in server.js. */
const router = express.Router();
router.post('/billing/checkout', express.json({ limit: 16 * 1024 }), authMiddleware, checkoutHandler);
router.post('/billing/portal', express.json({ limit: 16 * 1024 }), authMiddleware, portalHandler);
router.get('/me', authMiddleware, meHandler);
router.get('/config', configHandler);

module.exports = {
  router,
  webhookHandler,
  // exported for tests
  checkoutHandler, portalHandler, meHandler, configHandler, billingEnabled,
  _tierCore: tierCore,
};
