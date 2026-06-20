/* Unit tests — src/quota/quota.js.
 *
 * The free-tier quota counter is a Firestore document mutated inside a
 * transaction. These tests drive it with a minimal in-memory Firestore fake
 * (collection().doc(), get(), runTransaction()) — no emulator, no network. The
 * load-bearing invariant is FAIL-OPEN: any Firestore error must return ok:true
 * so a visitor is never blocked by our infrastructure. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const quota = require('../src/quota/quota');

/* In-memory Firestore fake. Docs live in a Map keyed by their path; a
 * transaction reads + writes against that Map. `failOn` lets a test force an
 * error from get/transaction to exercise the fail-open path. */
function fakeDb(initial = {}, failOn = null) {
  const store = new Map(Object.entries(initial));
  const docRef = (pathKey) => ({
    pathKey,
    async get() {
      if (failOn === 'get') throw new Error('firestore down');
      const data = store.get(pathKey);
      return { exists: data !== undefined, data: () => data };
    },
  });
  return {
    store,
    collection(name) {
      return { doc(id) { return docRef(`${name}/${id}`); } };
    },
    async runTransaction(fn) {
      if (failOn === 'tx') throw new Error('transaction failed');
      const tx = {
        async get(ref) {
          const data = store.get(ref.pathKey);
          return { exists: data !== undefined, data: () => data };
        },
        set(ref, value, opts) {
          const prev = (opts && opts.merge && store.get(ref.pathKey)) || {};
          store.set(ref.pathKey, Object.assign({}, prev, value));
        },
      };
      return fn(tx);
    },
  };
}

/* ---- check() --------------------------------------------------------------*/

test('check: a zero/negative limit, missing key, or missing db is a no-op (ok, unmetered)', async () => {
  assert.deepEqual(await quota.check(fakeDb(), { key: 'k', limit: 0, period: 'day' }), { ok: true });
  assert.deepEqual(await quota.check(fakeDb(), { key: '', limit: 5, period: 'day' }), { ok: true });
  assert.deepEqual(await quota.check(null, { key: 'k', limit: 5, period: 'day' }), { ok: true });
});

test('check: under the limit increments and reports remaining', async () => {
  const db = fakeDb();
  const r1 = await quota.check(db, { key: 'u1', limit: 3, period: 'day' });
  assert.equal(r1.ok, true);
  assert.equal(r1.limit, 3);
  assert.equal(r1.remaining, 2);   // used 1 of 3
  const r2 = await quota.check(db, { key: 'u1', limit: 3, period: 'day' });
  assert.equal(r2.remaining, 1);   // used 2 of 3 — counter persisted across calls
});

test('check: at the limit rejects with retryAfter and the used count', async () => {
  const db = fakeDb();
  for (let i = 0; i < 3; i++) await quota.check(db, { key: 'u2', limit: 3, period: 'day' });
  const blocked = await quota.check(db, { key: 'u2', limit: 3, period: 'day' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.used, 3);
  assert.equal(blocked.limit, 3);
  assert.ok(typeof blocked.retryAfter === 'number' && blocked.retryAfter > 0);
});

test('check: FAILS OPEN when the transaction throws', async () => {
  const r = await quota.check(fakeDb({}, 'tx'), { key: 'u3', limit: 2, period: 'day' });
  assert.equal(r.ok, true);
  assert.match(r.error, /transaction failed/);
});

/* ---- peek() ---------------------------------------------------------------*/

test('peek: read-only — reports remaining without incrementing', async () => {
  const db = fakeDb();
  await quota.check(db, { key: 'u4', limit: 5, period: 'day' });   // used 1
  const p1 = await quota.peek(db, { key: 'u4', limit: 5, period: 'day' });
  const p2 = await quota.peek(db, { key: 'u4', limit: 5, period: 'day' });
  assert.equal(p1.remaining, 4);
  assert.deepEqual(p1, p2);   // peeking twice does not move the counter
});

test('peek: a zero limit reports remaining:null (unmetered)', async () => {
  assert.deepEqual(await quota.peek(fakeDb(), { key: 'k', limit: 0, period: 'day' }), { remaining: null, limit: 0 });
});

test('peek: FAILS OPEN to the full allowance when Firestore read throws', async () => {
  const r = await quota.peek(fakeDb({}, 'get'), { key: 'u5', limit: 7, period: 'day' });
  assert.deepEqual(r, { remaining: 7, limit: 7 });
});
