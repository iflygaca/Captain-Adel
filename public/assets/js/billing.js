/* ============================================================================
 * Captain Adel — Pro checkout (ES module).
 *
 * startProCheckout(plan) takes a signed-in pilot to Stripe Checkout:
 *   - signed out  → account.html?next=<here>#pricing so they sign in first.
 *   - signed in   → POST /v1/billing/checkout with their ID token, then redirect
 *                   to the Stripe-hosted page the service returns.
 *
 * Mirrors the Fly GACA web-billing flow, minus the callable (captadel speaks
 * plain HTTP to its own service). The button calling this lives on index.html's
 * pricing section and on account.html.
 * ==========================================================================*/

import { getIdToken, isEnabled } from './auth.js';

const API = (window.ADEL_API_BASE || '');

function ar() { return document.documentElement.lang === 'ar'; }
function t(en, arr) { return ar() ? arr : en; }

export async function startProCheckout(plan) {
  const wanted = plan === 'monthly' ? 'monthly' : 'annual';

  if (!isEnabled()) {
    alert(t('Accounts open soon — Captain Adel is free during launch.',
            'الحسابات تُفتح قريباً — كابتن عادل مجاني خلال الإطلاق.'));
    return;
  }

  const token = await getIdToken().catch(() => null);
  if (!token) {
    const here = location.pathname.split('/').pop() + '#pricing';
    location.href = 'account.html?next=' + encodeURIComponent(here);
    return;
  }

  try {
    const res = await fetch(API + '/v1/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ plan: wanted }),
    });
    if (res.status === 503) {
      alert(t('Billing isn\'t open yet — Captain Adel is free during launch.',
              'الاشتراك غير مُفعّل بعد — كابتن عادل مجاني خلال الإطلاق.'));
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) { location.href = data.url; return; }
    throw new Error(data.error || 'checkout_failed');
  } catch (_) {
    alert(t('Could not start checkout. Please try again in a moment.',
            'تعذّر بدء الدفع. حاول مرة أخرى بعد قليل.'));
  }
}

/* Open the Stripe customer portal (manage / cancel) for a signed-in subscriber. */
export async function openBillingPortal() {
  const token = await getIdToken().catch(() => null);
  if (!token) return;
  try {
    const res = await fetch(API + '/v1/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) { location.href = data.url; return; }
  } catch (_) { /* fall through */ }
  alert(t('Could not open the billing portal. Please try again.',
          'تعذّر فتح بوابة الاشتراك. حاول مرة أخرى.'));
}

window.CaptadelBilling = { startProCheckout, openBillingPortal };
