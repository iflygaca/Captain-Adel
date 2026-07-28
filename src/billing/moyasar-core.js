/* ============================================================================
 * Captain Adel — Moyasar billing: pure logic (no Firebase, no network).
 *
 * Ported from Fly GACA's functions/src/billing-core.ts so the two products
 * share one pricing/renewal vocabulary. Everything here is deterministic and
 * unit-tested in test/moyasar-core.test.js; the Express/Firestore wrappers in
 * routes.js stay thin.
 *
 * Moyasar has no subscription object — "recurring" means a saved card token is
 * re-charged by the renewals route before the entitlement expires. Renewal math
 * (extendExpiry, nextChargeAt) therefore works from the CURRENT expiry, never
 * from "now", so an early charge can't shave paid time.
 * ==========================================================================*/

'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

/* ---- pricing ------------------------------------------------------------- */

/* SAR string from env -> integer halalas. Returns null on missing/invalid so
 * callers can 503 price_unconfigured instead of selling at a broken price. */
function sarToHalalas(sar) {
  const n = Number(sar);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/* 'monthly' | 'annual' (anything else -> annual, matching the old handler). */
function planToCadence(plan) {
  return plan === 'monthly' ? 'monthly' : 'annual';
}

function cadenceDays(cadence) {
  return cadence === 'monthly' ? 30 : 365;
}

/* Price a checkout in halalas from server env only — the browser never sends
 * an amount. env = { priceMonthlySar, priceAnnualSar }. */
function amountForPlan(plan, env) {
  const cadence = planToCadence(plan);
  return sarToHalalas(cadence === 'monthly' ? env.priceMonthlySar : env.priceAnnualSar);
}

/* ---- renewal math -------------------------------------------------------- */

const RENEWAL_LEAD_DAYS = 3;
const MAX_RENEWAL_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/* When to re-charge: RENEWAL_LEAD_DAYS before the entitlement lapses. */
function nextChargeAt(expiresAtMs, leadDays) {
  const lead = leadDays == null ? RENEWAL_LEAD_DAYS : leadDays;
  return expiresAtMs - lead * DAY_MS;
}

/* Extend FROM the current expiry (never from now). */
function extendExpiry(expiresAtMs, cadence) {
  return expiresAtMs + cadenceDays(cadence) * DAY_MS;
}

/* Entitlement window for a fresh purchase (or a renewal, passing the old
 * expiry as `fromMs`). Shape feeds ent.grantSubscription(). */
function entitlementFromCheckout(cadence, fromMs) {
  return {
    source: cadence === 'monthly' ? 'monthly' : 'annual',
    startedAtMs: fromMs,
    expiresAtMs: fromMs + cadenceDays(cadence) * DAY_MS,
  };
}

/* ---- payment interpretation ---------------------------------------------- */

/* Only a settled payment grants — 'authorized'/'initiated'/'failed' never do. */
function isPaid(payment) {
  return !!payment && payment.status === 'paid';
}

/* Does a fetched payment match the server-priced intent? The browser widget is
 * handed the amount, so it must be re-checked against the stored intent. */
function paymentMatchesIntent(payment, intent) {
  return !!payment && !!intent
    && payment.amount === intent.amountHalalas
    && payment.currency === intent.currency;
}

/* Reusable card token from a payment source (Apple Pay / STC Pay are
 * single-use — no token, renewal impossible, and that's fine). */
function tokenOf(payment) {
  const src = payment && payment.source;
  return (src && src.type === 'creditcard' && src.token) ? src.token : null;
}

/* ---- webhook signature --------------------------------------------------- */

/* HMAC-SHA256 hex over the RAW body vs the x-moyasar-signature header.
 * NOTE: this recipe is defence-in-depth only and must be validated against a
 * Moyasar dashboard test event before the webhook is relied on — the trusted
 * fulfilment path is the server-side payment re-fetch in settlePayment(). */
function verifyMoyasarSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

module.exports = {
  sarToHalalas,
  planToCadence,
  cadenceDays,
  amountForPlan,
  RENEWAL_LEAD_DAYS,
  MAX_RENEWAL_ATTEMPTS,
  nextChargeAt,
  extendExpiry,
  entitlementFromCheckout,
  isPaid,
  paymentMatchesIntent,
  tokenOf,
  verifyMoyasarSignature,
};
