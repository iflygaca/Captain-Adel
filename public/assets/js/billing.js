/* ============================================================================
 * Captain Adel — Pro checkout (ES module).
 *
 * startProCheckout(plan) takes a pilot to the in-site Moyasar checkout page:
 *   - accounts disabled → bilingual "free during launch" notice.
 *   - otherwise         → checkout.html?plan=…  (that page requires sign-in,
 *                         prices server-side and mounts the Moyasar widget —
 *                         card data goes browser -> Moyasar, PCI SAQ-A).
 *
 * Moyasar has no hosted customer portal — cancelAutoRenew() is our own: it
 * stops future charges; access runs to the paid expiry. The
 * buttons calling these live on index.html's pricing section and account.html.
 * ==========================================================================*/

import { getIdToken, isEnabled } from './auth.js';

const API = (window.ADEL_API_BASE || '');

function ar() { return document.documentElement.lang === 'ar'; }
function t(en, arr) { return ar() ? arr : en; }

export function startProCheckout(plan) {
  const wanted = plan === 'monthly' ? 'monthly' : 'annual';

  if (!isEnabled()) {
    alert(t('Accounts open soon — Captain Adel is free during launch.',
            'الحسابات تُفتح قريباً — كابتن عادل مجاني خلال الإطلاق.'));
    return;
  }

  location.href = 'checkout.html?plan=' + wanted;
}

/* Stop auto-renewal for a signed-in subscriber. The entitlement is untouched —
 * access continues to the end of the already-paid period. */
export async function cancelAutoRenew() {
  const token = await getIdToken().catch(() => null);
  if (!token) return;

  const sure = confirm(t(
    'Turn off auto-renewal? Your Pro access continues until the end of the paid period.',
    'إيقاف التجديد التلقائي؟ يستمر وصولك إلى برو حتى نهاية الفترة المدفوعة.'));
  if (!sure) return;

  try {
    const res = await fetch(API + '/v1/billing/cancel-auto-renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    });
    if (res.ok) {
      alert(t('Auto-renewal is off. Your access continues until the paid period ends.',
              'تم إيقاف التجديد التلقائي. يستمر وصولك حتى نهاية الفترة المدفوعة.'));
      return;
    }
  } catch (_) { /* fall through */ }
  alert(t('Could not update the subscription. Please try again.',
          'تعذّر تحديث الاشتراك. حاول مرة أخرى.'));
}

window.CaptadelBilling = { startProCheckout, cancelAutoRenew };
