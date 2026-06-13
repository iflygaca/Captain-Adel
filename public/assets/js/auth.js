/* ============================================================================
 * Captain Adel — client authentication (ES module, Auth only).
 *
 * captadel.com signs pilots in with Firebase Authentication and nothing else:
 * the client NEVER opens Firestore. A pilot's plan and remaining quota come from
 * the service's GET /v1/me (Admin SDK, server-mediated), so there is no client
 * Firestore SDK, no entitlement logic in the browser, and a tiny CSP surface.
 *
 * Two consumers:
 *   - account.js / billing.js import the named exports directly (ES modules).
 *   - chat.js / exam.js are classic scripts; they read window.CaptadelAuth, the
 *     small bridge set at the bottom, to attach an ID token to /v1/chat.
 *
 * Ships dark: if firebase-config.js still holds placeholders (no project yet),
 * initialisation is skipped, isEnabled() is false, and the bridge resolves no
 * token — chat keeps working anonymously and the account page shows its
 * signed-out state.
 * ==========================================================================*/

import { firebaseConfig, hasFirebaseConfig } from './firebase-config.js';

let _auth = null;
let _mod = null;

async function ensureAuth() {
  if (_auth) return _auth;
  if (!hasFirebaseConfig()) return null;
  const [{ initializeApp }, authMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
  ]);
  _mod = authMod;
  const app = initializeApp(firebaseConfig);
  _auth = authMod.getAuth(app);
  return _auth;
}

export function isEnabled() { return hasFirebaseConfig(); }

/* ---- observers ---- */
export async function watchUser(callback) {
  const auth = await ensureAuth();
  if (!auth) { callback(null); return () => {}; }
  return _mod.onAuthStateChanged(auth, callback);
}

export async function getIdToken() {
  const auth = await ensureAuth();
  const u = auth && auth.currentUser;
  return u ? u.getIdToken() : null;
}

/* ---- actions ---- */
export async function signUp(email, password, displayName) {
  const auth = await ensureAuth();
  const cred = await _mod.createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName) {
    try { await _mod.updateProfile(cred.user, { displayName: displayName.trim() }); }
    catch (_) { /* non-fatal */ }
  }
  return cred.user;
}

export async function signIn(email, password) {
  const auth = await ensureAuth();
  const cred = await _mod.signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function signInWithGoogle() {
  const auth = await ensureAuth();
  const cred = await _mod.signInWithPopup(auth, new _mod.GoogleAuthProvider());
  return cred.user;
}

export async function resetPassword(email) {
  const auth = await ensureAuth();
  return _mod.sendPasswordResetEmail(auth, email.trim());
}

export async function signOutUser() {
  const auth = await ensureAuth();
  if (auth) await _mod.signOut(auth);
}

/* ---- errors (calm, plain language; EN/AR) ---- */
export function friendlyError(err) {
  const code = (err && err.code) || '';
  const ar = document.documentElement.lang === 'ar';
  const en = {
    'auth/invalid-email': 'That email address does not look right.',
    'auth/user-not-found': 'No account found for that email.',
    'auth/wrong-password': 'That password is not correct.',
    'auth/invalid-credential': 'Email or password is not correct.',
    'auth/email-already-in-use': 'An account already exists for that email — try signing in instead.',
    'auth/weak-password': 'Choose a longer password — at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'Network problem — check your connection and try again.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before it finished.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window — allow pop-ups, then try again.',
    'auth/operation-not-allowed': 'That sign-in method is not enabled for this project yet.',
    'auth/unauthorized-domain': 'This site is not yet authorised for sign-in — add the domain in the Firebase Console.',
  };
  const arMap = {
    'auth/invalid-email': 'عنوان البريد الإلكتروني لا يبدو صحيحاً.',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني.',
    'auth/wrong-password': 'كلمة المرور غير صحيحة.',
    'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'auth/email-already-in-use': 'يوجد حساب بالفعل بهذا البريد — جرّب تسجيل الدخول بدلاً من ذلك.',
    'auth/weak-password': 'اختر كلمة مرور أطول — ٨ أحرف على الأقل.',
    'auth/too-many-requests': 'محاولات كثيرة جداً. انتظر بضع دقائق ثم حاول مرة أخرى.',
    'auth/network-request-failed': 'مشكلة في الشبكة — تحقّق من اتصالك وحاول مرة أخرى.',
    'auth/popup-closed-by-user': 'أُغلقت نافذة تسجيل الدخول قبل اكتمالها.',
    'auth/popup-blocked': 'حظر متصفّحك نافذة تسجيل الدخول — اسمح بالنوافذ المنبثقة ثم حاول.',
    'auth/operation-not-allowed': 'طريقة تسجيل الدخول هذه غير مُفعّلة بعد.',
    'auth/unauthorized-domain': 'هذا الموقع غير مُصرَّح له بعد بتسجيل الدخول — أضِف النطاق في Firebase Console.',
  };
  if (ar) return arMap[code] || 'حدث خطأ ما. حاول مرة أخرى.';
  return en[code] || 'Something went wrong. Please try again.';
}

/* ---- bridge for classic (non-module) scripts: chat.js, exam.js ---- */
window.CaptadelAuth = {
  isEnabled,
  getIdToken,
  signOutUser,
  watchUser,
};
