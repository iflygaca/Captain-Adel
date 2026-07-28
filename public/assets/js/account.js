/* ============================================================================
 * Captain Adel — account page (ES module).
 *
 * Renders one of three states into #account-card:
 *   - dark      : no Firebase project configured yet → "accounts open soon".
 *   - signed out: sign-in / sign-up / reset forms (one card, mode-switched).
 *   - signed in : plan badge, remaining quota (from /v1/me), upgrade / manage,
 *                 sign out.
 *
 * Bilingual: every injected node carries a data-en with the Arabic baseline as
 * its text, then we re-run the i18n engine so the current language sticks. The
 * ?next= param returns the pilot to where they came from after sign-in; a
 * ?checkout=success param shows a thank-you.
 * ==========================================================================*/

import {
  isEnabled, watchUser, signIn, signUp, resetPassword, signInWithGoogle,
  signOutUser, getIdToken, friendlyError,
} from './auth.js';
import { startProCheckout, cancelAutoRenew } from './billing.js';

const API = (window.ADEL_API_BASE || '');
const card = document.getElementById('account-card');
const params = new URLSearchParams(location.search);

function reI18n() {
  if (window.CaptadelI18n) window.CaptadelI18n.apply(window.CaptadelI18n.lang);
}
function ar() { return document.documentElement.lang === 'ar'; }

/* Escape any value that originates from a user (a display name, an email) before
   it lands in innerHTML. The rest of the injected markup is our own static copy. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* A node carries Arabic as its text and English in data-en (the engine's
   authoring model). Helper to build one inline. */
function nextDest() {
  const n = params.get('next');
  return (n && /^[A-Za-z0-9._#/?=&%-]+$/.test(n)) ? n : '';
}

/* ---- signed-out: auth forms ---- */
let mode = 'signin';   // 'signin' | 'signup' | 'reset'

function renderDark() {
  card.innerHTML = `
    <h1 data-en="Accounts open soon">الحسابات تُفتح قريباً</h1>
    <p class="account-sub" data-en="Captain Adel is free during launch — no account needed yet. Subscriptions open shortly; the founding price is locked in when they do.">كابتن عادل مجاني خلال الإطلاق — لا حاجة لحساب بعد. الاشتراكات تُفتح قريباً، وسعر التأسيس محفوظ عند فتحها.</p>
    <div class="acct-actions">
      <a class="btn btn-primary" href="chat.html" data-en="Ask Captain Adel">اسأل كابتن عادل</a>
    </div>`;
  reI18n();
}

function authFormHtml(msg) {
  const msgHtml = msg ? `<div class="acct-msg ${msg.kind}">${msg.text}</div>` : '';
  const title = mode === 'signup'
    ? '<h1 data-en="Create your account">أنشئ حسابك</h1>'
    : mode === 'reset'
      ? '<h1 data-en="Reset your password">إعادة تعيين كلمة المرور</h1>'
      : '<h1 data-en="Sign in">تسجيل الدخول</h1>';
  const sub = mode === 'signup'
    ? '<p class="account-sub" data-en="Free forever — go Pro whenever you like.">مجاني للأبد — ارتقِ إلى برو متى شئت.</p>'
    : mode === 'reset'
      ? '<p class="account-sub" data-en="We\'ll email you a reset link.">سنرسل لك رابط إعادة التعيين عبر البريد.</p>'
      : '<p class="account-sub" data-en="Welcome back, Captain.">أهلاً بعودتك يا كابتن.</p>';

  const nameField = mode === 'signup' ? `
    <div class="acct-field">
      <label for="acct-name" data-en="Name (optional)">الاسم (اختياري)</label>
      <input id="acct-name" type="text" autocomplete="name">
    </div>` : '';
  const passField = mode !== 'reset' ? `
    <div class="acct-field">
      <label for="acct-pass" data-en="Password">كلمة المرور</label>
      <input id="acct-pass" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}">
    </div>` : '';

  const submitLabel = mode === 'signup'
    ? '<span data-en="Create account">إنشاء الحساب</span>'
    : mode === 'reset'
      ? '<span data-en="Send reset link">إرسال رابط التعيين</span>'
      : '<span data-en="Sign in">تسجيل الدخول</span>';

  const google = mode !== 'reset' ? `
    <div class="acct-divider"><span data-en="or">أو</span></div>
    <div class="acct-actions">
      <button type="button" class="btn btn-ghost" id="acct-google" data-en="Continue with Google">المتابعة عبر Google</button>
    </div>` : '';

  const switcher = mode === 'signin' ? `
    <p class="acct-switch">
      <span data-en="New here?">جديد هنا؟</span>
      <button type="button" data-mode="signup" data-en="Create an account">أنشئ حساباً</button>
      ·
      <button type="button" data-mode="reset" data-en="Forgot password?">نسيت كلمة المرور؟</button>
    </p>`
    : `<p class="acct-switch">
      <button type="button" data-mode="signin" data-en="← Back to sign in">→ العودة لتسجيل الدخول</button>
    </p>`;

  return `${title}${sub}${msgHtml}
    <form id="acct-form" novalidate>
      ${nameField}
      <div class="acct-field">
        <label for="acct-email" data-en="Email">البريد الإلكتروني</label>
        <input id="acct-email" type="email" autocomplete="email" required>
      </div>
      ${passField}
      <div class="acct-actions">
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>
    ${google}
    ${switcher}`;
}

function renderAuth(msg) {
  card.innerHTML = authFormHtml(msg);
  reI18n();

  card.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => { mode = b.dataset.mode; renderAuth(); });
  });
  const g = document.getElementById('acct-google');
  if (g) g.addEventListener('click', () => doGoogle());
  const form = document.getElementById('acct-form');
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); doSubmit(); });
}

async function doSubmit() {
  const email = (document.getElementById('acct-email') || {}).value || '';
  const pass = (document.getElementById('acct-pass') || {}).value || '';
  const name = (document.getElementById('acct-name') || {}).value || '';
  try {
    if (mode === 'reset') {
      await resetPassword(email);
      mode = 'signin';
      renderAuth({ kind: 'ok', text: ar() ? 'أرسلنا لك رابط إعادة التعيين. تحقّق من بريدك.' : 'Reset link sent — check your email.' });
      return;
    }
    if (mode === 'signup') await signUp(email, pass, name);
    else await signIn(email, pass);
    // watchUser fires and re-renders the signed-in panel / redirects.
  } catch (err) {
    renderAuth({ kind: 'error', text: friendlyError(err) });
  }
}

async function doGoogle() {
  try { await signInWithGoogle(); }
  catch (err) { renderAuth({ kind: 'error', text: friendlyError(err) }); }
}

/* ---- signed-in panel ---- */
async function fetchMe() {
  try {
    const token = await getIdToken();
    const res = await fetch(API + '/v1/me', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    return res.ok ? res.json() : null;
  } catch (_) { return null; }
}

async function renderSignedIn(user) {
  const checkoutOk = params.get('checkout') === 'success';
  const me = await fetchMe();
  const isPro = me && me.plan === 'pro';
  const launch = me && me.launchMode;

  const badge = isPro
    ? '<span class="acct-plan-badge pro" data-en="Pro">برو</span>'
    : '<span class="acct-plan-badge free" data-en="Free">مجاني</span>';

  let quotaLine = '';
  if (launch) {
    quotaLine = '<p class="acct-quota" data-en="Free for everyone during launch — unlimited questions.">مجاني للجميع خلال الإطلاق — أسئلة بلا حدود.</p>';
  } else if (isPro) {
    quotaLine = '<p class="acct-quota" data-en="Unlimited cited questions. Thank you for supporting Captain Adel.">أسئلة موثّقة بلا حدود. شكراً لدعمك كابتن عادل.</p>';
  } else if (me && me.quota && typeof me.quota.remaining === 'number') {
    quotaLine = `<p class="acct-quota" data-i18n-html data-en="<strong>${me.quota.remaining}</strong> of ${me.quota.limit} free questions left today."><strong>${me.quota.remaining}</strong> من ${me.quota.limit} أسئلة مجانية متبقية اليوم.</p>`;
  }

  const okMsg = checkoutOk
    ? '<div class="acct-msg ok" data-en="You\'re Pro — welcome aboard, Captain. Unlimited questions are live.">أصبحت برو — أهلاً بك يا كابتن. الأسئلة بلا حدود مُفعّلة.</div>'
    : '';

  const proAction = isPro
    ? '<button type="button" class="btn btn-ghost" id="acct-portal" data-en="Turn off auto-renew">إيقاف التجديد التلقائي</button>'
    : '<button type="button" class="btn btn-primary" id="acct-upgrade" data-en="Go Pro">اشترك في برو</button>';

  const name = esc((user && (user.displayName || user.email)) || '');
  card.innerHTML = `
    <h1 data-en="Your account">حسابك</h1>
    <p class="account-sub">${name}</p>
    ${okMsg}
    <div class="acct-plan">
      <span data-en="Plan">الخطة</span> ${badge}
    </div>
    ${quotaLine}
    <div class="acct-actions">
      <a class="btn btn-primary" href="chat.html" data-en="Ask Captain Adel">اسأل كابتن عادل</a>
      ${proAction}
      <button type="button" class="btn btn-ghost" id="acct-signout" data-en="Sign out">تسجيل الخروج</button>
    </div>`;
  reI18n();

  const up = document.getElementById('acct-upgrade');
  if (up) up.addEventListener('click', () => startProCheckout('annual'));
  const portal = document.getElementById('acct-portal');
  if (portal) portal.addEventListener('click', () => cancelAutoRenew());
  document.getElementById('acct-signout').addEventListener('click', async () => {
    await signOutUser();
    renderAuth();
  });
}

/* ---- boot ---- */
if (!isEnabled()) {
  renderDark();
} else {
  watchUser((user) => {
    if (user) {
      const dest = nextDest();
      if (dest && params.get('checkout') !== 'success') { location.href = dest; return; }
      renderSignedIn(user);
    } else {
      renderAuth();
    }
  });
}
