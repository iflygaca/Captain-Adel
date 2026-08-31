/* ============================================================================
 * Captain Adel — client authentication interface.
 * ==========================================================================*/

let _currentUser = null;
const listeners = new Set();

export function isEnabled() { return false; }

/* ---- observers ---- */
export async function watchUser(callback) {
  callback(_currentUser);
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function getIdToken() {
  return null;
}

/* ---- actions ---- */
export async function signUp(_email, _password, _displayName) {
  throw new Error('auth_disabled');
}

export async function signIn(_email, _password) {
  throw new Error('auth_disabled');
}

export async function signInWithGoogle() {
  throw new Error('auth_disabled');
}

export async function resetPassword(_email) {
  throw new Error('auth_disabled');
}

export async function signOutUser() {
  _currentUser = null;
  for (const cb of listeners) cb(null);
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
  };
  if (ar) return arMap[code] || 'حدث خطأ ما. حاول مرة أخرى.';
  return en[code] || 'Something went wrong. Please try again.';
}

/* ---- bridge for classic scripts: chat.js, exam.js ---- */
if (typeof window !== 'undefined') {
  window.CaptadelAuth = {
    isEnabled,
    getIdToken,
    signOutUser,
    watchUser,
  };
}
