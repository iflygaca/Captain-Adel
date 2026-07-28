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

const firebase = require('../firebase');
const core = require('./entitlements-core');

/** Run `mutate(currentEntitlement) -> nextEntitlement` atomically. */
async function applyEntitlement(uid, mutate, extraFields) {
  if (!uid) throw new Error('applyEntitlement: missing uid');
  const db = firebase.db();
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() || {};
    const e = core.normalize(cur.entitlement);
    const patch = Object.assign(
      { entitlement: mutate(e), updatedAt: firebase.serverTimestamp() },
      extraFields || {},
    );
    tx.set(ref, patch, { merge: true });
  });
}

/** Read a user's entitlement map (or null). */
async function readEntitlement(uid) {
  if (!uid) return null;
  const snap = await firebase.db().collection('users').doc(uid).get();
  return snap.exists ? ((snap.data() || {}).entitlement || null) : null;
}

module.exports = {
  applyEntitlement,
  readEntitlement,
  grantSubscription: core.grantSubscription,
  revoke: core.revoke,
  isActive: core.isActive,
};
