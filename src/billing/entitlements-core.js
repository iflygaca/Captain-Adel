/* ============================================================================
 * Captain Adel — entitlement logic (pure, dependency-free).
 *
 * users/{uid}.entitlement is the single record of a pilot's plan on
 * captadel.com. The shape intentionally matches Fly GACA's:
 *   { plan: 'free'|'pro', source: 'monthly'|'annual'|'expired',
 *     startedAt: ISO|null, expiresAt: ISO|null }
 * Captadel v1 has no packs and no school seats, so the mutators here are the
 * subscription pair only. The transactional writer lives in entitlements.js
 * (it needs the Admin SDK); everything below is a pure function of the current
 * value so it can be unit-tested without Firestore.
 * ==========================================================================*/

'use strict';

const iso = (ms) => (ms ? new Date(Number(ms)).toISOString() : null);

/** Read side: does this entitlement map represent a live paid plan right now?
 *  The single source of truth for "is this user Pro", shared by the chat tier
 *  gate and /v1/me so they can never drift. Accepts expiresAt as an ISO string,
 *  a Firestore Timestamp, or a {seconds} shape. expiresAt == null means a
 *  perpetual grant (manual only — subscriptions always carry a date). */
function isActive(e, now) {
  if (!e || typeof e !== 'object') return false;
  if (e.plan !== 'pro') return false;
  if (e.expiresAt == null) return true;
  let t = NaN;
  const v = e.expiresAt;
  if (typeof v === 'string') t = Date.parse(v);
  else if (v && typeof v.toDate === 'function') t = v.toDate().getTime();
  else if (v && typeof v.seconds === 'number') t = v.seconds * 1000;
  return Number.isFinite(t) && t > (now != null ? now : Date.now());
}

// A subscription that loses its expiry must NOT become perpetual: storing
// expiresAt:null would read as an always-active plan that no revoke event can
// ever age out. Some upstream events omit a usable expiry; clamp a missing/
// invalid/past expiry to a short grace window so the next renewal (which does
// carry a date) extends it. Perpetual (null) expiry is reserved for explicit
// manual grants written outside these mutators.
const SUBSCRIPTION_GRACE_MS = 48 * 60 * 60 * 1000;

function safeSubscriptionExpiry(expiresAtMs, now) {
  const at = now != null ? now : Date.now();
  const ms = Number(expiresAtMs);
  return (Number.isFinite(ms) && ms > at) ? ms : at + SUBSCRIPTION_GRACE_MS;
}

/** Grant / renew a Pro subscription. `source` is 'monthly' | 'annual';
 *  `extra` carries source-specific fields (e.g. store). */
function grantSubscription({ source, startedAtMs, expiresAtMs, extra }) {
  return () => Object.assign({
    plan: 'pro',
    source,
    startedAt: iso(startedAtMs) || new Date().toISOString(),
    expiresAt: iso(safeSubscriptionExpiry(expiresAtMs)),  // never null for a subscription
  }, extra || {});
}

/** Drop to free (expiry / cancellation). */
function revoke() {
  return () => ({ plan: 'free', source: 'expired', startedAt: null, expiresAt: null });
}

/** Normalise a raw entitlement to a plain object. The writer passes the result
 *  to a mutator; exported so tests can mirror the writer. */
function normalize(raw) {
  return (raw && typeof raw === 'object') ? Object.assign({}, raw) : {};
}

module.exports = {
  iso, isActive, safeSubscriptionExpiry, SUBSCRIPTION_GRACE_MS,
  grantSubscription, revoke, normalize,
};
