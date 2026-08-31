/* ============================================================================
 * Captain Adel — entitlement writer (Admin SDK).
 *
 * users/{uid}.entitlement is written ONLY here (the Admin SDK bypasses the
 * deny-all firestore.rules). Every change is a transaction that reads the
 * current entitlement and applies a pure mutator from entitlements-core, so the
 * decision logic stays unit-testable without Firestore.
 *
 * Used by the Moyasar billing routes (billing/routes.js).
 * ==========================================================================*/

'use strict';

const core = require('./entitlements-core');

let _db = null;
let _serverTimestamp = () => new Date().toISOString();

function setDb(db, serverTimestamp) {
  _db = db;
  if (serverTimestamp) _serverTimestamp = serverTimestamp;
}

function getDb() {
  if (!_db) return null;
  if (typeof _db === 'function') return _db();
  if (typeof _db.db === 'function') return _db.db();
  return _db;
}

/** Run `mutate(currentEntitlement) -> nextEntitlement` atomically. */
async function applyEntitlement(uid, mutate, extraFields) {
  if (!uid) throw new Error('applyEntitlement: missing uid');
  const db = getDb();
  if (!db) return;
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = (snap && typeof snap.data === 'function' ? snap.data() : snap) || {};
    const e = core.normalize(cur.entitlement);
    const patch = Object.assign(
      { entitlement: mutate(e), updatedAt: _serverTimestamp() },
      extraFields || {},
    );
    tx.set(ref, patch, { merge: true });
  });
}

/** Read a user's entitlement map (or null). */
async function readEntitlement(uid) {
  const db = getDb();
  if (!uid || !db) return null;
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? ((snap.data() || {}).entitlement || null) : null;
}

module.exports = {
  applyEntitlement,
  readEntitlement,
  grantSubscription: core.grantSubscription,
  revoke: core.revoke,
  isActive: core.isActive,
  setDb,
};
