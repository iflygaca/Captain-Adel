/* Unit tests — src/billing/routes.js handlers (Moyasar).
 *
 * The handlers are exported directly, so they're driven with fake req/res, an
 * in-memory Firestore, and the global fetch stubbed (the moyasarRequest seam).
 * These cover the dark-gate guards, the settle trust model (server re-fetch,
 * amount cross-check, ownership, idempotency ordering), the renewal engine's
 * stored-price charging and failure ladder, and /v1/config shaping. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const routes = require('../src/billing/routes');
const config = require('../src/config');
const ent = require('../src/billing/entitlements');
const authMiddleware = require('../src/middleware/auth');
const qc = require('../src/quota/quota-core');

function fakeRes() {
  return {
    statusCode: 200, body: undefined, sent: undefined,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    send(s) { this.sent = s; return this; },
  };
}

/* Minimal in-memory Firestore honouring the exact surface routes.js uses:
 * doc().get()/set({merge})/create() and where()-chained collection queries. */
function memDb() {
  const store = new Map();   // 'col/id' -> plain object
  function collection(col) {
    return {
      doc(id) {
        const key = col + '/' + id;
        return {
          async get() { const d = store.get(key); return { exists: d !== undefined, data: () => d }; },
          async set(data, opts) {
            const cur = (opts && opts.merge && store.get(key)) || {};
            store.set(key, { ...cur, ...data });
          },
          async create(data) {
            if (store.has(key)) throw new Error('already-exists');
            store.set(key, data);
          },
          async delete() { store.delete(key); },
        };
      },
      where(f, o, v) {
        const filters = [[f, o, v]];
        const q = {
          where(f2, o2, v2) { filters.push([f2, o2, v2]); return q; },
          async get() {
            const docs = [];
            for (const [k, val] of store) {
              if (!k.startsWith(col + '/')) continue;
              const pass = filters.every(([field, op, want]) => {
                const x = val[field];
                if (op === '==') return x === want;
                if (op === 'in') return want.includes(x);
                if (op === '<=') return x <= want;
                return false;
              });
              if (pass) docs.push({ id: k.slice(col.length + 1), data: () => val });
            }
            return { docs, size: docs.length };
          },
        };
        return q;
      },
    };
  }
  return { db: () => ({ collection }), store };
}

/* Overlay config fields + collaborators + global fetch, run fn(), restore. */
async function withOverrides(over, fn) {
  const savedConfig = {};
  for (const k of Object.keys(over.config || {})) {
    savedConfig[k] = config[k];
    config[k] = over.config[k];
  }
  const saved = {
    applyEntitlement: ent.applyEntitlement, readEntitlement: ent.readEntitlement,
    invalidate: authMiddleware.invalidate, fetch: global.fetch,
  };
  const defaultDb = (over.available === false || over.db === null) ? null : (over.db || memDb());
  routes.setDb(defaultDb, () => 'ts', over.deleteUser || (async () => {}));
  routes.setAuthAvailable(over.available !== undefined ? over.available : Boolean(defaultDb));

  if (over.applyEntitlement) ent.applyEntitlement = over.applyEntitlement;
  if (over.readEntitlement) ent.readEntitlement = over.readEntitlement;
  authMiddleware.invalidate = over.invalidate || (() => {});
  if (over.fetch) global.fetch = over.fetch;
  try { return await fn(); } finally {
    for (const k of Object.keys(savedConfig)) config[k] = savedConfig[k];
    routes.setDb(null, null, null);
    routes.setAuthAvailable(false);
    Object.assign(ent, {
      applyEntitlement: saved.applyEntitlement, readEntitlement: saved.readEntitlement,
    });
    authMiddleware.invalidate = saved.invalidate;
    global.fetch = saved.fetch;
  }
}

const LIVE = {
  moyasarSecretKey: 'sk_test_x', moyasarWebhookSecret: 'whsec_x',
  moyasarPublishableKey: 'pk_test_x',
  moyasarPriceMonthlySar: '35', moyasarPriceAnnualSar: '299',
  siteUrl: 'https://captadel.com',
};

/* A fetch stub serving GET /payments/{id} from a map and recording POSTs. */
function moyasarFetch(payments, posts) {
  return async (url, init) => {
    const method = (init && init.method) || 'GET';
    if (method === 'POST') {
      if (posts) posts.push(JSON.parse(init.body));
      const reply = payments.__postReply || { status: 'paid', amount: 0, currency: 'SAR' };
      return { ok: true, json: async () => reply };
    }
    const id = decodeURIComponent(url.split('/payments/')[1]);
    const p = payments[id];
    if (!p) return { ok: false, status: 404 };
    return { ok: true, json: async () => p };
  };
}

/* ---- checkout -------------------------------------------------------------*/

test('checkout: 503 when billing is dark', async () => {
  await withOverrides({ config: { moyasarSecretKey: '' }, available: false }, async () => {
    const res = fakeRes();
    await routes.checkoutHandler({ user: { uid: 'u' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'billing_unavailable');
  });
});

test('checkout: 401 when billing is live but the caller is anonymous', async () => {
  await withOverrides({ config: LIVE, available: true }, async () => {
    const res = fakeRes();
    await routes.checkoutHandler({ user: { uid: '' } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'sign_in_required');
  });
});

test('checkout: 503 price_unconfigured when the plan has no SAR price', async () => {
  await withOverrides({
    config: { ...LIVE, moyasarPriceAnnualSar: '' }, available: true,
  }, async () => {
    const res = fakeRes();
    await routes.checkoutHandler({ user: { uid: 'u' }, body: { plan: 'annual' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'price_unconfigured');
  });
});

test('checkout: prices server-side, persists the intent, returns an opaque id', async () => {
  const mem = memDb();
  await withOverrides({ config: LIVE, available: true, db: mem.db }, async () => {
    const res = fakeRes();
    await routes.checkoutHandler({ user: { uid: 'u1' }, body: { plan: 'monthly' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.amount, 3500);
    assert.equal(res.body.currency, 'SAR');
    assert.equal(res.body.saveCard, true);
    assert.equal(res.body.publishableKey, 'pk_test_x');
    assert.ok(res.body.checkoutId);
    assert.equal(res.body.uid, undefined);   // uid never leaves the server
    const intent = mem.store.get('checkoutIntents/' + res.body.checkoutId);
    assert.equal(intent.uid, 'u1');
    assert.equal(intent.amountHalalas, 3500);
    assert.equal(intent.status, 'pending');
  });
});

/* ---- confirm / settle -----------------------------------------------------*/

function seedIntent(mem, id, over) {
  mem.store.set('checkoutIntents/' + id, {
    uid: 'u1', plan: 'annual', cadence: 'annual',
    amountHalalas: 29900, currency: 'SAR', status: 'pending', ...over,
  });
}

test('confirm: happy path grants, saves token, writes subscription at the sold price', async () => {
  const mem = memDb();
  seedIntent(mem, 'ci1');
  const grants = [];
  const payments = {
    pay_1: {
      id: 'pay_1', status: 'paid', amount: 29900, currency: 'SAR',
      metadata: { checkoutId: 'ci1' },
      source: { type: 'creditcard', token: 'tok_9', company: 'mada', last_four: '1111' },
    },
  };
  await withOverrides({
    config: LIVE, available: true, db: mem.db, fetch: moyasarFetch(payments),
    applyEntitlement: async (uid, mutate) => grants.push({ uid, next: mutate({}) }),
  }, async () => {
    const res = fakeRes();
    await routes.confirmHandler({ user: { uid: 'u1' }, body: { paymentId: 'pay_1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(grants.length, 1);
    assert.equal(grants[0].uid, 'u1');
    assert.equal(grants[0].next.plan, 'pro');
    assert.equal(grants[0].next.store, 'MOYASAR');
    assert.equal(mem.store.get('moyasarCustomers/u1').token, 'tok_9');
    const sub = mem.store.get('subscriptions/u1');
    assert.equal(sub.amountHalalas, 29900);
    assert.equal(sub.cadence, 'annual');
    assert.equal(sub.autoRenew, true);
    assert.equal(mem.store.get('checkoutIntents/ci1').status, 'fulfilled');
    assert.ok(mem.store.has('moyasarPayments/pay_1'));
  });
});

test('confirm: a not-yet-paid payment does NOT claim the marker — the later webhook still grants', async () => {
  const mem = memDb();
  seedIntent(mem, 'ci2');
  const grants = [];
  const payments = {
    pay_2: { id: 'pay_2', status: 'initiated', amount: 29900, currency: 'SAR', metadata: { checkoutId: 'ci2' } },
  };
  await withOverrides({
    config: LIVE, available: true, db: mem.db, fetch: moyasarFetch(payments),
    applyEntitlement: async (uid, mutate) => grants.push({ uid, next: mutate({}) }),
  }, async () => {
    const res = fakeRes();
    await routes.confirmHandler({ user: { uid: 'u1' }, body: { paymentId: 'pay_2' } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'payment_not_settled');
    assert.equal(mem.store.has('moyasarPayments/pay_2'), false);   // marker untouched
    assert.equal(grants.length, 0);

    // 3DS completes; the webhook observes the paid payment and must grant.
    payments.pay_2.status = 'paid';
    const out = await routes.settlePayment('pay_2');
    assert.equal(out.ok, true);
    assert.equal(grants.length, 1);
  });
});

test('confirm: amount mismatch is rejected without granting', async () => {
  const mem = memDb();
  seedIntent(mem, 'ci3');
  const grants = [];
  const payments = {
    pay_3: { id: 'pay_3', status: 'paid', amount: 100, currency: 'SAR', metadata: { checkoutId: 'ci3' } },
  };
  await withOverrides({
    config: LIVE, available: true, db: mem.db, fetch: moyasarFetch(payments),
    applyEntitlement: async () => grants.push(1),
  }, async () => {
    const res = fakeRes();
    await routes.confirmHandler({ user: { uid: 'u1' }, body: { paymentId: 'pay_3' } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(grants.length, 0);
    assert.equal(mem.store.has('moyasarPayments/pay_3'), false);
  });
});

test('confirm: 403 when the payment belongs to another account', async () => {
  const mem = memDb();
  seedIntent(mem, 'ci4', { uid: 'someone-else' });
  const payments = {
    pay_4: { id: 'pay_4', status: 'paid', amount: 29900, currency: 'SAR', metadata: { checkoutId: 'ci4' } },
  };
  await withOverrides({
    config: LIVE, available: true, db: mem.db, fetch: moyasarFetch(payments),
    applyEntitlement: async () => { throw new Error('must not grant'); },
  }, async () => {
    const res = fakeRes();
    await routes.confirmHandler({ user: { uid: 'u1' }, body: { paymentId: 'pay_4' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'payment_not_yours');
  });
});

test('settle: double-settle is idempotent — exactly one grant', async () => {
  const mem = memDb();
  seedIntent(mem, 'ci5');
  const grants = [];
  const payments = {
    pay_5: { id: 'pay_5', status: 'paid', amount: 29900, currency: 'SAR', metadata: { checkoutId: 'ci5' } },
  };
  await withOverrides({
    config: LIVE, available: true, db: mem.db, fetch: moyasarFetch(payments),
    applyEntitlement: async () => grants.push(1),
  }, async () => {
    const a = await routes.settlePayment('pay_5');
    const b = await routes.settlePayment('pay_5');
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(b.alreadySettled, true);
    assert.equal(grants.length, 1);
  });
});

/* ---- webhook --------------------------------------------------------------*/

test('webhook: 503 without secrets, 400 on a bad signature', async () => {
  await withOverrides({ config: { moyasarSecretKey: '', moyasarWebhookSecret: '' } }, async () => {
    const res = fakeRes();
    await routes.webhookHandler({ headers: {}, body: Buffer.from('{}') }, res);
    assert.equal(res.statusCode, 503);
  });
  await withOverrides({ config: LIVE, available: true }, async () => {
    const res = fakeRes();
    await routes.webhookHandler({
      headers: { 'x-moyasar-signature': 'bad' }, body: Buffer.from('{}'),
    }, res);
    assert.equal(res.statusCode, 400);
  });
});

test('webhook: a correctly signed payment_paid settles', async () => {
  const mem = memDb();
  seedIntent(mem, 'ci6');
  const grants = [];
  const payments = {
    pay_6: { id: 'pay_6', status: 'paid', amount: 29900, currency: 'SAR', metadata: { checkoutId: 'ci6' } },
  };
  const raw = Buffer.from(JSON.stringify({ type: 'payment_paid', data: { id: 'pay_6' } }), 'utf8');
  const sig = createHmac('sha256', 'whsec_x').update(raw).digest('hex');
  await withOverrides({
    config: LIVE, available: true, db: mem.db, fetch: moyasarFetch(payments),
    applyEntitlement: async () => grants.push(1),
  }, async () => {
    const res = fakeRes();
    await routes.webhookHandler({ headers: { 'x-moyasar-signature': sig }, body: raw }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { received: true });
    assert.equal(grants.length, 1);
  });
});

/* ---- cancel auto-renew ----------------------------------------------------*/

test('cancel-auto-renew: flips the flag, leaves the entitlement alone', async () => {
  const mem = memDb();
  mem.store.set('subscriptions/u1', { autoRenew: true, status: 'active' });
  await withOverrides({
    config: LIVE, available: true, db: mem.db,
    applyEntitlement: async () => { throw new Error('entitlement must not change'); },
  }, async () => {
    const res = fakeRes();
    await routes.cancelAutoRenewHandler({ user: { uid: 'u1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(mem.store.get('subscriptions/u1').autoRenew, false);
    assert.equal(mem.store.get('subscriptions/u1').status, 'active');
  });
});

/* ---- renewals -------------------------------------------------------------*/

test('renewals: 401 without the cron key', async () => {
  await withOverrides({ config: { ...LIVE, cronSecret: 's3cret' } }, async () => {
    const res = fakeRes();
    await routes.renewalsHandler({ headers: {} }, res);
    assert.equal(res.statusCode, 401);
  });
});

test('renewals: charges the STORED price, extends from expiry, resets attempts', async () => {
  const mem = memDb();
  const past = new Date(Date.now() - 1000).toISOString();
  mem.store.set('subscriptions/u1', {
    cadence: 'annual', amountHalalas: 12345,   // deliberately != env price
    autoRenew: true, status: 'past_due', failedAttempts: 1, nextChargeAt: past,
  });
  mem.store.set('moyasarCustomers/u1', { token: 'tok_1' });
  const posts = [];
  const payments = { __postReply: { status: 'paid', amount: 12345, currency: 'SAR' } };
  const grants = [];
  const oldExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  await withOverrides({
    config: { ...LIVE, cronSecret: 's3cret' }, available: true, db: mem.db,
    fetch: moyasarFetch(payments, posts),
    readEntitlement: async () => ({ plan: 'pro', expiresAt: oldExpiry }),
    applyEntitlement: async (uid, mutate) => grants.push(mutate({})),
  }, async () => {
    const res = fakeRes();
    await routes.renewalsHandler({ headers: { 'x-cron-key': 's3cret' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.charged, 1);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].amount, 12345);               // stored price, not env
    assert.equal(posts[0].source.token, 'tok_1');
    assert.equal(grants.length, 1);
    const expected = Date.parse(oldExpiry) + 365 * 24 * 60 * 60 * 1000;
    assert.equal(grants[0].expiresAt, new Date(expected).toISOString());
    const sub = mem.store.get('subscriptions/u1');
    assert.equal(sub.status, 'active');
    assert.equal(sub.failedAttempts, 0);
  });
});

test('renewals: failures walk past_due then cancel at the third attempt', async () => {
  const mem = memDb();
  const past = new Date(Date.now() - 1000).toISOString();
  mem.store.set('subscriptions/u1', {
    cadence: 'monthly', amountHalalas: 3500,
    autoRenew: true, status: 'past_due', failedAttempts: 2, nextChargeAt: past,
  });
  mem.store.set('moyasarCustomers/u1', { token: 'tok_1' });
  const payments = { __postReply: { status: 'failed' } };
  await withOverrides({
    config: { ...LIVE, cronSecret: 's3cret' }, available: true, db: mem.db,
    fetch: moyasarFetch(payments),
    applyEntitlement: async () => { throw new Error('must not grant'); },
  }, async () => {
    const res = fakeRes();
    await routes.renewalsHandler({ headers: { 'x-cron-key': 's3cret' } }, res);
    assert.equal(res.body.canceled, 1);
    const sub = mem.store.get('subscriptions/u1');
    assert.equal(sub.status, 'canceled');
    assert.equal(sub.autoRenew, false);
    assert.equal(sub.failedAttempts, 3);
  });
});

test('renewals: a tokenless subscription goes past_due (Apple Pay / STC purchases)', async () => {
  const mem = memDb();
  const past = new Date(Date.now() - 1000).toISOString();
  mem.store.set('subscriptions/u1', {
    cadence: 'monthly', amountHalalas: 3500,
    autoRenew: true, status: 'active', failedAttempts: 0, nextChargeAt: past,
  });
  await withOverrides({
    config: { ...LIVE, cronSecret: 's3cret' }, available: true, db: mem.db,
    fetch: async () => { throw new Error('must not call moyasar'); },
  }, async () => {
    const res = fakeRes();
    await routes.renewalsHandler({ headers: { 'x-cron-key': 's3cret' } }, res);
    assert.equal(res.body.pastDue, 1);
    assert.equal(mem.store.get('subscriptions/u1').status, 'past_due');
  });
});

/* ---- /v1/config -----------------------------------------------------------*/

test('config: exposes the publishable key only when set', async () => {
  await withOverrides({ config: LIVE, available: true }, async () => {
    const res = fakeRes();
    routes.configHandler({}, res);
    assert.equal(res.body.billingEnabled, true);
    assert.equal(res.body.moyasarPublishableKey, 'pk_test_x');
  });
  await withOverrides({ config: { ...LIVE, moyasarPublishableKey: '' } }, async () => {
    const res = fakeRes();
    routes.configHandler({}, res);
    assert.equal(res.body.moyasarPublishableKey, null);
  });
});

/* ---- account delete -------------------------------------------------------*/

/* Wrap a memDb so doc deletes in one collection throw — for the ordering and
 * fail-open cases. */
function failingDeletes(mem, badCol) {
  return () => {
    const real = mem.db();
    return {
      collection(col) {
        const c = real.collection(col);
        if (col !== badCol) return c;
        return {
          ...c,
          doc(id) {
            return { ...c.doc(id), async delete() { throw new Error('firestore down'); } };
          },
        };
      },
    };
  };
}

test('account-delete: 503 account_unavailable when Firebase is dark', async () => {
  await withOverrides({ available: false }, async () => {
    const res = fakeRes();
    await routes.deleteAccountHandler({ user: { uid: 'u1' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'account_unavailable');
  });
});

test('account-delete: 401 when Firebase is live but the caller is anonymous', async () => {
  await withOverrides({ available: true }, async () => {
    const res = fakeRes();
    await routes.deleteAccountHandler({ user: { uid: '' } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'sign_in_required');
  });
});

test('account-delete: purges the uid-keyed set, tombstones settle markers, deletes the Auth user, invalidates', async () => {
  const mem = memDb();
  mem.store.set('users/u1', { entitlement: { plan: 'pro' } });
  mem.store.set('subscriptions/u1', { autoRenew: true });
  mem.store.set('moyasarCustomers/u1', { token: 'tok_9', last4: '1111' });
  mem.store.set('checkoutIntents/ci1', { uid: 'u1', amountHalalas: 29900 });
  mem.store.set('checkoutIntents/ci9', { uid: 'other' });
  mem.store.set('moyasarPayments/pay_1', { uid: 'u1', checkoutId: 'ci1', settledAt: 'x' });
  mem.store.set('moyasarPayments/pay_9', { uid: 'other' });
  const quotaId = 'adelQuota/' + qc.dayStamp(Date.now()) + '__uid:u1';
  mem.store.set(quotaId, { count: 3 });

  const deleted = []; const invalidated = [];
  await withOverrides({
    available: true, db: mem.db,
    deleteUser: async (uid) => { deleted.push(uid); },
    invalidate: (uid) => { invalidated.push(uid); },
  }, async () => {
    const res = fakeRes();
    await routes.deleteAccountHandler({ user: { uid: 'u1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  for (const gone of ['users/u1', 'subscriptions/u1', 'moyasarCustomers/u1', 'checkoutIntents/ci1', quotaId]) {
    assert.equal(mem.store.has(gone), false, gone + ' is purged');
  }
  assert.deepEqual(mem.store.get('checkoutIntents/ci9'), { uid: 'other' }, 'other users untouched');
  assert.deepEqual(mem.store.get('moyasarPayments/pay_9'), { uid: 'other' });
  const marker = mem.store.get('moyasarPayments/pay_1');
  assert.ok(marker, 'the settle marker still exists (replay guard)');
  assert.equal(marker.tombstone, true);
  assert.equal(marker.uid, undefined, 'the uid is erased from the marker');
  assert.deepEqual(deleted, ['u1']);
  assert.deepEqual(invalidated, ['u1']);
});

test('account-delete: a tombstoned marker still blocks a replayed settle', async () => {
  const mem = memDb();
  seedIntent(mem, 'ci1');
  mem.store.set('moyasarPayments/pay_1', { tombstone: true, deletedAt: 'ts' });
  const payments = {
    pay_1: {
      id: 'pay_1', status: 'paid', amount: 29900, currency: 'SAR',
      metadata: { checkoutId: 'ci1' },
    },
  };
  const grants = [];
  await withOverrides({
    config: LIVE, available: true, db: mem.db,
    applyEntitlement: async (...args) => { grants.push(args); },
    fetch: moyasarFetch(payments),
  }, async () => {
    const out = await routes.settlePayment('pay_1');
    assert.deepEqual(out, { ok: true, alreadySettled: true });
    assert.equal(grants.length, 0, 'no entitlement is ever re-granted');
  });
});

test('account-delete: a Firestore failure returns 502 and the Auth user survives', async () => {
  const mem = memDb();
  mem.store.set('moyasarCustomers/u1', { token: 'tok_9' });
  const deleted = [];
  await withOverrides({
    available: true, db: failingDeletes(mem, 'moyasarCustomers'),
    deleteUser: async (uid) => { deleted.push(uid); },
  }, async () => {
    const res = fakeRes();
    await routes.deleteAccountHandler({ user: { uid: 'u1' } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'delete_failed');
  });
  assert.equal(deleted.length, 0, 'the Auth user is only deleted after the purge succeeds');
});

test('account-delete: a retry over already-deleted data is still ok (idempotent)', async () => {
  const mem = memDb();   // empty store — everything already purged
  await withOverrides({
    available: true, db: mem.db,
    deleteUser: async () => {
      const err = new Error('user not found');
      err.code = 'auth/user-not-found';
      throw err;
    },
  }, async () => {
    const res = fakeRes();
    await routes.deleteAccountHandler({ user: { uid: 'u1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
  });
});

test('account-delete: a quota-sweep failure is fail-open', async () => {
  const mem = memDb();
  mem.store.set('users/u1', { entitlement: { plan: 'free' } });
  const deleted = [];
  await withOverrides({
    available: true, db: failingDeletes(mem, 'adelQuota'),
    deleteUser: async (uid) => { deleted.push(uid); },
  }, async () => {
    const res = fakeRes();
    await routes.deleteAccountHandler({ user: { uid: 'u1' } }, res);
    assert.equal(res.statusCode, 200);
  });
  assert.deepEqual(deleted, ['u1'], 'the deletion completes despite the quota sweep failing');
  assert.equal(mem.store.has('users/u1'), false);
});
