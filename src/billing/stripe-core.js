/* ============================================================================
 * Captain Adel — Stripe webhook mapping (pure, dependency-free).
 *
 * The signature-verified Stripe event still has to be mapped to an entitlement
 * action. Those mappings are pure functions of the event payload, so they live
 * here for unit testing without the Stripe SDK or Firestore. Ported from the
 * Fly GACA gateway's stripe-core.js — the two products intentionally share one
 * webhook vocabulary.
 * ==========================================================================*/

'use strict';

// A Stripe subscription / session stamps the Firebase uid in metadata
// (subscription_data.metadata.firebaseUID), falling back to client_reference_id
// on the Checkout session.
function uidOf(obj) {
  return (obj && obj.metadata && obj.metadata.firebaseUID)
    || (obj && obj.client_reference_id) || null;
}

// Stripe's recurring interval -> our entitlement source.
function sourceForInterval(interval) {
  return interval === 'month' ? 'monthly' : 'annual';
}

// Pull the recurring interval off a subscription's first line item, if present.
function intervalOf(sub) {
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  return (item && item.price && item.price.recurring && item.price.recurring.interval) || null;
}

const ACTIVE = ['active', 'trialing'];
const ENDED = ['canceled', 'unpaid', 'incomplete_expired'];

// What a customer.subscription.created/updated status should drive.
function statusAction(status) {
  if (ACTIVE.includes(status)) return 'grant';
  if (ENDED.includes(status)) return 'revoke';
  return 'none';
}

module.exports = { uidOf, sourceForInterval, intervalOf, statusAction, ACTIVE, ENDED };
