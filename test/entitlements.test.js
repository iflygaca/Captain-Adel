/* Unit tests — src/billing/entitlements.js (the Admin-SDK entitlement writer).
 *
 * applyEntitlement runs a transaction that reads the current entitlement and
 * stores a pure mutator's result; readEntitlement reads the map back. The
 * Firestore Admin SDK is faked by overriding firebase.db()/serverTimestamp()
 * (assign-and-restore) — no emulator, no network. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('../src/firebase');
const ent = require('../src/billing/entitlements');

/* In-memory users collection with a transactional set, matching the slice of
 * the Admin SDK that entitlements.js uses. */
function fakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  const ref = (id) => ({ id });
  const snap = (id) => ({ exists: store.has(id), data: () => store.get(id) });
  return {
    store,
    collection() {
      return {
        doc(id) {
          return {
            id,
            async get() { return snap(id); },
          };
        },
      };
    },
    async runTransaction(fn) {
      const tx = {
        async get(r) { return snap(r.id); },
        set(r, value, opts) {
          const prev = (opts && opts.merge && store.get(r.id)) || {};
          store.set(r.id, Object.assign({}, prev, value));
        },
      };
      return fn(tx);
    },
  };
}

async function withDb(db, fn) {
  const realDb = firebase.db;
  const realTs = firebase.serverTimestamp;
  firebase.db = () => db;
  firebase.serverTimestamp = () => 'TS';
  try { return await fn(); } finally {
    firebase.db = realDb;
    firebase.serverTimestamp = realTs;
  }
}

test('applyEntitlement: rejects a missing uid', async () => {
  await assert.rejects(() => ent.applyEntitlement('', () => ({})), /missing uid/);
});

test('applyEntitlement: stores the mutator result under entitlement + a server timestamp', async () => {
  const db = fakeDb();
  await withDb(db, () => ent.applyEntitlement('uid1', () => ({ status: 'pro', source: 'stripe' })));
  const saved = db.store.get('uid1');
  assert.deepEqual(saved.entitlement, { status: 'pro', source: 'stripe' });
  assert.equal(saved.updatedAt, 'TS');
});

test('applyEntitlement: passes the normalized current entitlement to the mutator and merges extraFields', async () => {
  const db = fakeDb({ uid2: { entitlement: { status: 'pro' }, name: 'Adel' } });
  let seenCurrent;
  await withDb(db, () => ent.applyEntitlement('uid2', (cur) => {
    seenCurrent = cur;
    return { status: 'free' };
  }, { stripeCustomerId: 'cus_123' }));
  assert.equal(seenCurrent.status, 'pro');         // current entitlement read in
  const saved = db.store.get('uid2');
  assert.equal(saved.entitlement.status, 'free');  // mutator result written
  assert.equal(saved.stripeCustomerId, 'cus_123'); // extraFields merged
  assert.equal(saved.name, 'Adel');                // existing fields preserved (merge)
});

test('readEntitlement: returns null for a missing uid or a missing doc', async () => {
  assert.equal(await ent.readEntitlement(''), null);
  await withDb(fakeDb(), async () => {
    assert.equal(await ent.readEntitlement('nobody'), null);
  });
});

test('readEntitlement: returns the stored entitlement map', async () => {
  const db = fakeDb({ uid3: { entitlement: { status: 'pro', expiresAt: '2099-01-01' } } });
  await withDb(db, async () => {
    const e = await ent.readEntitlement('uid3');
    assert.deepEqual(e, { status: 'pro', expiresAt: '2099-01-01' });
  });
});

test('readEntitlement: a doc without an entitlement field reads as null', async () => {
  const db = fakeDb({ uid4: { name: 'no-ent' } });
  await withDb(db, async () => {
    assert.equal(await ent.readEntitlement('uid4'), null);
  });
});
