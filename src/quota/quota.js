/* ============================================================================
 * Captain Adel — free-tier usage quota (Firestore-backed).
 *
 * The abuse rate limiter (src/brain/ratelimit.js) stops hammering; this module
 * enforces the *product* limit — how many questions a metered (free / anonymous)
 * visitor gets per KSA calendar period. Pro and trusted callers never reach here
 * (tier-core resolves them as unmetered).
 *
 * Why Firestore and not memory: the count must survive Cloud Run instance
 * cycling and be shared across replicas, so it's a document incremented inside a
 * transaction. The calendar math is the pure quota-core helpers.
 *
 *   check(db, { key, limit, period }) ->
 *       { ok: true,  remaining, limit }
 *     | { ok: false, retryAfter, used, limit }       // retryAfter in seconds
 *
 * Fails OPEN: any Firestore error returns { ok: true }. A visitor must never be
 * blocked because of our infrastructure.
 * ==========================================================================*/

'use strict';

const qc = require('./quota-core');

async function check(db, id) {
  const limit = id && Number.isFinite(id.limit) ? id.limit : 0;
  const key = id && id.key ? String(id.key) : '';
  const period = qc.normalizePeriod(id && id.period);
  if (limit <= 0 || !db || !key) return { ok: true };   // nothing to meter

  const now = Date.now();
  const stamp = qc.periodStamp(period, now);
  const ref = db.collection('adelQuota').doc(stamp + '__' + key);
  // Keep the counter a little past its window, then let a Firestore TTL policy
  // on `expireAt` purge it: ~3 days (day mode), ~40 days (month mode).
  const ttlMs = (period === 'day' ? 3 : 40) * 24 * 60 * 60 * 1000;

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = (snap.exists && typeof snap.data().count === 'number')
        ? snap.data().count : 0;
      if (used >= limit) return { ok: false, used };
      tx.set(ref, {
        count: used + 1,
        period: stamp,
        updatedAt: new Date(now).toISOString(),
        expireAt: new Date(now + ttlMs),
      }, { merge: true });
      return { ok: true, used: used + 1 };
    });

    if (!result.ok) {
      return { ok: false, retryAfter: qc.periodReset(period, now), used: result.used, limit };
    }
    return { ok: true, remaining: Math.max(0, limit - result.used), limit };
  } catch (err) {
    return { ok: true, error: String((err && err.message) || err) };
  }
}

/* Read-only peek (no increment) — used by /v1/me to show "N left today"
 * without spending one. Fails open to the full allowance. */
async function peek(db, id) {
  const limit = id && Number.isFinite(id.limit) ? id.limit : 0;
  const key = id && id.key ? String(id.key) : '';
  const period = qc.normalizePeriod(id && id.period);
  if (limit <= 0 || !db || !key) return { remaining: null, limit };
  try {
    const now = Date.now();
    const stamp = qc.periodStamp(period, now);
    const snap = await db.collection('adelQuota').doc(stamp + '__' + key).get();
    const used = (snap.exists && typeof snap.data().count === 'number') ? snap.data().count : 0;
    return { remaining: Math.max(0, limit - used), limit };
  } catch (_) {
    return { remaining: limit, limit };
  }
}

module.exports = { check, peek };
