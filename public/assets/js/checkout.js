/* Captain Adel — Moyasar checkout page (ES module, bilingual).
 *
 * Two legs on one page, split on the query string (mirrors Fly GACA):
 *   Start  (?plan=annual|monthly): ask the server to price the checkout
 *          (POST /v1/billing/checkout — the browser never chooses an amount),
 *          stash the opaque checkoutId in sessionStorage, then mount Moyasar's
 *          hosted widget. Card data goes browser -> Moyasar (PCI SAQ-A).
 *   Return (?id=<payment_id>, appended by Moyasar to callback_url): confirm
 *          server-to-server (POST /v1/billing/confirm) and land on the account
 *          page. The server re-fetches and re-verifies everything — nothing in
 *          this file is trusted. */

'use strict';

import { getIdToken, isEnabled } from './auth.js';

const API = (window.ADEL_API_BASE || '');
const WIDGET_BASE = 'https://cdn.moyasar.com/mpf/1.16.0';
const INTENT_KEY = 'captadel:checkoutId';

const statusEl = document.getElementById('checkout-status');
const summaryEl = document.getElementById('checkout-summary');

function isArabic() {
  return (document.documentElement.lang || 'ar').startsWith('ar');
}
function setStatus(ar, en) {
  if (statusEl) { statusEl.hidden = false; statusEl.textContent = isArabic() ? ar : en; }
}
function hideStatus() { if (statusEl) statusEl.hidden = true; }

function loadWidgetAssets() {
  return new Promise((resolve, reject) => {
    if (window.Moyasar) { resolve(); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = WIDGET_BASE + '/moyasar.css';
    css.integrity = 'sha384-xi7T53rMqpdqL0IHHVRtmK8FTK07ngNwx8hHDl86cq+qHRy/tRcHezKNMJKYV/0J';
    css.crossOrigin = 'anonymous';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = WIDGET_BASE + '/moyasar.js';
    s.integrity = 'sha384-464kRf7qKZwwwkZHkhNjNWdPwx0yTYFpOndxh46T2nSMe1vPfYBndPpNhQV2sYXk';
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('widget_load_failed'));
    document.head.appendChild(s);
  });
}

async function startLeg(plan) {
  const token = await getIdToken();
  if (!token) {
    location.href = 'account.html?next=' + encodeURIComponent('checkout.html?plan=' + plan);
    return;
  }
  const res = await fetch(API + '/v1/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ plan }),
  });
  if (res.status === 503) {
    setStatus('الدفع غير متاح بعد — الخدمة مجانية حالياً.',
      'Billing is not open yet — the service is currently free.');
    return;
  }
  if (!res.ok) throw new Error('checkout_failed');
  const cfg = await res.json();
  if (!cfg.publishableKey) {
    setStatus('الدفع غير مهيأ بعد.', 'Billing is not configured yet.');
    return;
  }

  try { sessionStorage.setItem(INTENT_KEY, cfg.checkoutId); } catch (_) { /* private mode */ }

  if (summaryEl) {
    const sar = (cfg.amount / 100).toFixed(0);
    summaryEl.hidden = false;
    summaryEl.textContent = isArabic()
      ? 'كابتن عادل برو — ' + sar + ' ريال (' + (cfg.description.includes('monthly') ? 'شهري' : 'سنوي') + ')، شامل الضريبة.'
      : 'Captain Adel Pro — SAR ' + sar + ', VAT inclusive.';
  }

  await loadWidgetAssets();
  hideStatus();
  window.Moyasar.init({
    element: '#moyasar-checkout-form',
    amount: cfg.amount,
    currency: cfg.currency,
    description: cfg.description,
    publishable_api_key: cfg.publishableKey,
    callback_url: cfg.callbackUrl,
    methods: cfg.methods,
    supported_networks: cfg.supportedNetworks,
    save_card: cfg.saveCard,
    metadata: { checkoutId: cfg.checkoutId },
    apple_pay: {
      country: 'SA',
      label: 'Captain Adel',
      validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate',
    },
  });
}

async function returnLeg(paymentId) {
  setStatus('جارٍ تأكيد عملية الدفع…', 'Confirming your payment…');
  const token = await getIdToken();
  if (!token) {
    location.href = 'account.html?next=' + encodeURIComponent('checkout.html?id=' + paymentId);
    return;
  }
  const res = await fetch(API + '/v1/billing/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ paymentId }),
  });
  if (res.ok) {
    try { sessionStorage.removeItem(INTENT_KEY); } catch (_) { /* ignore */ }
    location.replace('account.html?checkout=success');
    return;
  }
  if (res.status === 409) {
    setStatus('لم تكتمل عملية الدفع. لم يُخصم أي مبلغ — يمكنك المحاولة مرة أخرى.',
      'The payment did not complete. Nothing was charged — you can try again.');
  } else {
    setStatus('تعذّر تأكيد الدفع. تواصل معنا على hello@captadel.com إن خُصم المبلغ.',
      'Could not confirm the payment. Contact hello@captadel.com if you were charged.');
  }
}

async function main() {
  const params = new URLSearchParams(location.search);
  if (!isEnabled()) {
    setStatus('الخدمة مجانية أثناء الإطلاق — لا حاجة للدفع الآن.',
      'The service is free during launch — no payment needed yet.');
    return;
  }
  try {
    const paymentId = params.get('id');
    if (paymentId) await returnLeg(paymentId);
    else await startLeg(params.get('plan') === 'monthly' ? 'monthly' : 'annual');
  } catch (err) {
    setStatus('تعذّر بدء الدفع. حاول مرة أخرى لاحقاً.',
      'Could not start checkout. Please try again later.');
    // eslint-disable-next-line no-console
    console.error('checkout error', err);
  }
}

main();
