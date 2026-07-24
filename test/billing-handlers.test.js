/* Unit tests — src/billing/routes.js handlers (the failure/edge branches).
 *
 * The handlers are exported directly, so they're driven with fake req/res and
 * the Firebase/Stripe collaborators overridden (assign-and-restore). These
 * cover the branches that don't require a live Stripe call — the 401/503/409
 * guards, /v1/me shaping, /v1/config — plus a signature-verified webhook that
 * revokes (Stripe test-mode crypto, no network). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');

const routes = require('../src/billing/routes');
const config = require('../src/config');
const firebase = require('../src/firebase');
const ent = require('../src/billing/entitlements');
const quota = require('../src/quota/quota');
const authMiddleware = require('../src/middleware/auth');

function fakeRes() {
  return {
    statusCode: 200, body: undefined, sent: undefined,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    send(s) { this.sent = s; return this; },
  };
}

/* Overlay config fields + collaborator methods, run fn(), then restore. */
async function withOverrides(over, fn) {
  const savedConfig = {};
  for (const k of Object.keys(over.config || {})) {
    savedConfig[k] = config[k];
    config[k] = over.config[k];
  }
  const saved = {
    available: firebase.available, db: firebase.db,
    applyEntitlement: ent.applyEntitlement, revoke: ent.revoke,
    peek: quota.peek, invalidate: authMiddleware.invalidate,
  };
  if (over.available !== undefined) firebase.available = () => over.available;
  if (over.db) firebase.db = over.db;
  if (over.applyEntitlement) ent.applyEntitlement = over.applyEntitlement;
  if (over.peek) quota.peek = over.peek;
  if (over.invalidate) authMiddleware.invalidate = over.invalidate;
  try { return await fn(); } finally {
    for (const k of Object.keys(savedConfig)) config[k] = savedConfig[k];
    Object.assign(firebase, { available: saved.available, db: saved.db });
    Object.assign(ent, { applyEntitlement: saved.applyEntitlement, revoke: saved.revoke });
    quota.peek = saved.peek;
    authMiddleware.invalidate = saved.invalidate;
  }
}

/* A firebase.db() whose users/{uid} doc returns the given data. */
function dbWithUser(data) {
  return () => ({ collection() { return { doc() { return { async get() { return { exists: data !== undefined, data: () => data }; } }; } }; } });
}

/* ---- checkout -------------------------------------------------------------*/

test('checkout: 503 when billing is dark', async () => {
  await withOverrides({ config: { stripeSecretKey: '' }, available: false }, async () => {
    const res = fakeRes();
    await routes.checkoutHandler({ user: { uid: 'u' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'billing_unavailable');
  });
});

test('checkout: 401 when billing is live but the caller is anonymous', async () => {
  await withOverrides({ config: { stripeSecretKey: 'sk_test' }, available: true }, async () => {
    const res = fakeRes();
    await routes.checkoutHandler({ user: { uid: '' } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'sign_in_required');
  });
});

test('checkout: 503 price_unconfigured when the plan has no Stripe price id', async () => {
  await withOverrides({ config: { stripeSecretKey: 'sk_test', stripePriceAnnual: '' }, available: true }, async () => {
    const res = fakeRes();
    await routes.checkoutHandler({ user: { uid: 'u' }, body: { plan: 'annual' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'price_unconfigured');
  });
});

/* ---- portal ---------------------------------------------------------------*/

test('portal: 401 when anonymous', async () => {
  await withOverrides({ config: { stripeSecretKey: 'sk_test' }, available: true }, async () => {
    const res = fakeRes();
    await routes.portalHandler({ user: { uid: '' } }, res);
    assert.equal(res.statusCode, 401);
  });
});

test('portal: 409 no_subscription when the user has no stripeCustomerId', async () => {
  await withOverrides({
    config: { stripeSecretKey: 'sk_test' }, available: true, db: dbWithUser({ name: 'Adel' }),
  }, async () => {
    const res = fakeRes();
    await routes.portalHandler({ user: { uid: 'u' } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'no_subscription');
  });
});

/* ---- /v1/me ---------------------------------------------------------------*/

test('me: anonymous reports signedIn:false with the launch flag', async () => {
  await withOverrides({ config: { launchMode: '' } }, async () => {
    const res = fakeRes();
    await routes.meHandler({ user: { uid: '' } }, res);
    assert.equal(res.body.signedIn, false);
    assert.equal(res.body.launchMode, false);
  });
});

test('me: a Pro user reports plan "pro" and skips the quota peek', async () => {
  let peeked = 0;
  await withOverrides({ config: { launchMode: '' }, available: true, peek: async () => { peeked++; return {}; } }, async () => {
    const res = fakeRes();
    await routes.meHandler({ user: { uid: 'u', isPro: true, email: 'a@x.com' } }, res);
    assert.equal(res.body.signedIn, true);
    assert.equal(res.body.plan, 'pro');
    assert.equal(peeked, 0);
  });
});

test('me: a free user with metering on gets a quota panel from peek()', async () => {
  await withOverrides({
    config: { launchMode: '', freeDaily: 10 }, available: true,
    db: dbWithUser({}), peek: async () => ({ remaining: 7, limit: 10 }),
  }, async () => {
    const res = fakeRes();
    await routes.meHandler({ user: { uid: 'u', isPro: false } }, res);
    assert.equal(res.body.plan, 'free');
    assert.deepEqual(res.body.quota, { remaining: 7, limit: 10 });
  });
});

/* ---- /v1/config -----------------------------------------------------------*/

test('config: reports the dark state when no Stripe/Firebase is configured', async () => {
  await withOverrides({ config: { stripeSecretKey: '', launchMode: '' }, available: false }, async () => {
    const res = fakeRes();
    routes.configHandler({}, res);
    assert.equal(res.body.billingEnabled, false);
    assert.equal(res.body.authEnabled, false);
  });
});

/* ---- Stripe-interaction paths (SDK swapped in the require cache) ----------*/

/* routes.js resolves `require('stripe')` lazily on every call, so swapping the
 * cached exports (assign-and-restore) injects a fake SDK factory — no network.
 * Webhook tests keep the REAL signature verification by lending the fake the
 * real Stripe instance's `webhooks`. */
const STRIPE_PATH = require.resolve('stripe');
async function withStripeSdk(factory, fn) {
  const saved = require.cache[STRIPE_PATH].exports;
  require.cache[STRIPE_PATH].exports = factory;
  try { return await fn(); } finally { require.cache[STRIPE_PATH].exports = saved; }
}

const LIVE_CONFIG = {
  stripeSecretKey: 'sk_test_dummy', stripeWebhookSecret: 'whsec_test_dummy',
  stripePriceMonthly: 'price_m', stripePriceAnnual: 'price_a',
  siteUrl: 'https://captadel.test',
};

test('checkout: a live monthly checkout stamps the uid and returns the session url', async () => {
  let captured; let capturedKey;
  const sdk = (key) => {
    capturedKey = key;
    return { checkout: { sessions: { create: async (p) => { captured = p; return { url: 'https://checkout.stripe.test/s1' }; } } } };
  };
  await withOverrides({ config: LIVE_CONFIG, available: true }, () =>
    withStripeSdk(sdk, async () => {
      const res = fakeRes();
      await routes.checkoutHandler({ user: { uid: 'u1', email: 'a@x.com' }, body: { plan: 'monthly' } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.url, 'https://checkout.stripe.test/s1');
      assert.equal(capturedKey, 'sk_test_dummy');
      assert.equal(captured.line_items[0].price, 'price_m');
      assert.equal(captured.client_reference_id, 'u1');
      assert.equal(captured.customer_email, 'a@x.com');
      // The uid rides BOTH the session and the subscription so renewal/cancel
      // webhooks can map back to the Firebase user.
      assert.equal(captured.metadata.firebaseUID, 'u1');
      assert.equal(captured.subscription_data.metadata.firebaseUID, 'u1');
      assert.ok(captured.success_url.startsWith('https://captadel.test/'));
    }));
});

test('checkout: an unknown plan defaults to annual', async () => {
  let captured;
  const sdk = () => ({ checkout: { sessions: { create: async (p) => { captured = p; return { url: 'u' }; } } } });
  await withOverrides({ config: LIVE_CONFIG, available: true }, () =>
    withStripeSdk(sdk, async () => {
      await routes.checkoutHandler({ user: { uid: 'u1' }, body: { plan: 'weekly' } }, fakeRes());
      assert.equal(captured.line_items[0].price, 'price_a');
    }));
});

test('checkout: a Stripe error surfaces as 502 checkout_failed', async () => {
  const sdk = () => ({ checkout: { sessions: { create: async () => { throw new Error('stripe down'); } } } });
  await withOverrides({ config: LIVE_CONFIG, available: true }, () =>
    withStripeSdk(sdk, async () => {
      const res = fakeRes();
      await routes.checkoutHandler({ user: { uid: 'u1' }, body: {} }, res);
      assert.equal(res.statusCode, 502);
      assert.equal(res.body.error, 'checkout_failed');
    }));
});

test('portal: a subscribed user gets a portal session for their Stripe customer', async () => {
  let captured;
  const sdk = () => ({ billingPortal: { sessions: { create: async (p) => { captured = p; return { url: 'https://portal.stripe.test/p1' }; } } } });
  await withOverrides({
    config: LIVE_CONFIG, available: true, db: dbWithUser({ stripeCustomerId: 'cus_1' }),
  }, () => withStripeSdk(sdk, async () => {
    const res = fakeRes();
    await routes.portalHandler({ user: { uid: 'u1' } }, res);
    assert.equal(res.body.url, 'https://portal.stripe.test/p1');
    assert.equal(captured.customer, 'cus_1');
    assert.equal(captured.return_url, 'https://captadel.test/account.html');
  }));
});

test('portal: a Stripe error surfaces as 502 portal_failed', async () => {
  const sdk = () => ({ billingPortal: { sessions: { create: async () => { throw new Error('stripe down'); } } } });
  await withOverrides({
    config: LIVE_CONFIG, available: true, db: dbWithUser({ stripeCustomerId: 'cus_1' }),
  }, () => withStripeSdk(sdk, async () => {
    const res = fakeRes();
    await routes.portalHandler({ user: { uid: 'u1' } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'portal_failed');
  }));
});

/* ---- webhook --------------------------------------------------------------*/

/* A signed webhook request for the given event payload (real test-mode crypto). */
function signedWebhookReq(payload) {
  const body = JSON.stringify(payload);
  const header = new Stripe('sk_test_dummy').webhooks.generateTestHeaderString({
    payload: body, secret: 'whsec_test_dummy',
  });
  return { headers: { 'stripe-signature': header }, body: Buffer.from(body) };
}

test('webhook: checkout.session.completed retrieves the subscription and grants Pro', async () => {
  let retrievedId; let applied;
  const realWebhooks = new Stripe('sk_test_dummy').webhooks;
  const sdk = () => ({
    webhooks: realWebhooks,
    subscriptions: {
      retrieve: async (id) => {
        retrievedId = id;
        return {
          start_date: 1700000000, current_period_end: 1900000000,
          items: { data: [{ price: { recurring: { interval: 'month' } } }] },
        };
      },
    },
  });
  let invalidatedUid;
  await withOverrides({
    config: LIVE_CONFIG,
    applyEntitlement: async (uid, mutate, extra) => { applied = { uid, mutate, extra }; },
    invalidate: (uid) => { invalidatedUid = uid; },
  }, () => withStripeSdk(sdk, async () => {
    const res = fakeRes();
    await routes.webhookHandler(signedWebhookReq({
      id: 'evt_co', object: 'event', type: 'checkout.session.completed',
      data: { object: { metadata: { firebaseUID: 'uid-1' }, subscription: 'sub_1', customer: 'cus_9' } },
    }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.received, true);
    assert.equal(retrievedId, 'sub_1');
    assert.equal(applied.uid, 'uid-1');
    assert.equal(applied.mutate({}).source, 'monthly', 'the interval maps to the entitlement source');
    assert.deepEqual(applied.extra, { stripeCustomerId: 'cus_9' }, 'the customer id is remembered for the portal');
    assert.equal(invalidatedUid, 'uid-1', 'the buyer sees Pro immediately, not after the cache TTL');
  }));
});

test('webhook: subscription.updated grants on active and revokes on unpaid', async () => {
  const sdk = () => ({ webhooks: new Stripe('sk_test_dummy').webhooks });
  const run = async (status) => {
    const calls = [];
    await withOverrides({
      config: LIVE_CONFIG,
      applyEntitlement: async (uid, mutate) => calls.push({ uid, next: mutate({}) }),
      invalidate: () => {},
    }, () => withStripeSdk(sdk, async () => {
      const res = fakeRes();
      await routes.webhookHandler(signedWebhookReq({
        id: 'evt_up', object: 'event', type: 'customer.subscription.updated',
        data: {
          object: {
            metadata: { firebaseUID: 'uid-2' }, status,
            items: { data: [{ price: { recurring: { interval: 'year' } } }] },
          },
        },
      }), res);
      assert.equal(res.statusCode, 200);
    }));
    return calls;
  };

  const granted = await run('active');
  assert.equal(granted[0].next.plan, 'pro');
  const revoked = await run('unpaid');
  assert.equal(revoked[0].next.plan, 'free');
  const ignored = await run('incomplete');   // statusAction 'none'
  assert.deepEqual(ignored, [], 'in-between statuses drive no entitlement change');
});

test('webhook: a handler failure returns 500 so Stripe retries the event', async () => {
  const sdk = () => ({ webhooks: new Stripe('sk_test_dummy').webhooks });
  await withOverrides({
    config: LIVE_CONFIG,
    applyEntitlement: async () => { throw new Error('firestore unavailable'); },
  }, () => withStripeSdk(sdk, async () => {
    const res = fakeRes();
    await routes.webhookHandler(signedWebhookReq({
      id: 'evt_x', object: 'event', type: 'customer.subscription.deleted',
      data: { object: { metadata: { firebaseUID: 'uid-3' }, status: 'canceled' } },
    }), res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.sent, 'handler error');
  }));
});

test('webhook: 503 when the Stripe secrets are not configured', async () => {
  await withOverrides({ config: { stripeSecretKey: '', stripeWebhookSecret: '' } }, async () => {
    const res = fakeRes();
    await routes.webhookHandler({ headers: {}, body: Buffer.from('{}') }, res);
    assert.equal(res.statusCode, 503);
  });
});

test('webhook: a signed subscription.deleted revokes the entitlement and invalidates the cache', async () => {
  let revokedUid; let invalidatedUid; let revokeBuilt = false;
  await withOverrides({
    config: { stripeSecretKey: 'sk_test_dummy', stripeWebhookSecret: 'whsec_test_dummy' },
    applyEntitlement: async (uid) => { revokedUid = uid; },
    invalidate: (uid) => { invalidatedUid = uid; },
  }, async () => {
    // ent.revoke() is the pure mutator the handler passes to applyEntitlement.
    const savedRevoke = ent.revoke;
    ent.revoke = () => { revokeBuilt = true; return savedRevoke(); };
    try {
      const payload = JSON.stringify({
        id: 'evt_del', object: 'event', type: 'customer.subscription.deleted',
        data: { object: { metadata: { firebaseUID: 'uid-99' }, status: 'canceled' } },
      });
      const header = new Stripe('sk_test_dummy').webhooks.generateTestHeaderString({
        payload, secret: 'whsec_test_dummy',
      });
      const res = fakeRes();
      await routes.webhookHandler(
        { headers: { 'stripe-signature': header }, body: Buffer.from(payload) }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.received, true);
      assert.equal(revokedUid, 'uid-99');
      assert.equal(invalidatedUid, 'uid-99');
      assert.equal(revokeBuilt, true);
    } finally {
      ent.revoke = savedRevoke;
    }
  });
});

test('webhook: a bad signature is rejected with 400', async () => {
  await withOverrides({ config: { stripeSecretKey: 'sk_test_dummy', stripeWebhookSecret: 'whsec_test_dummy' } }, async () => {
    const res = fakeRes();
    await routes.webhookHandler({ headers: { 'stripe-signature': 'nope' }, body: Buffer.from('{}') }, res);
    assert.equal(res.statusCode, 400);
  });
});
