/* ============================================================================
 * Captain Adel — Firebase web config (captadel.com project).
 *
 * This is the CAPTADEL Firebase project — a separate project from Fly GACA, so
 * captadel.com keeps its own user base and billing. Fill these values from the
 * Firebase console (Project settings → Your apps → Web app) after creating the
 * project; see office/RUNBOOK-captadel-saas.md §1.
 *
 * The web API key is PUBLIC by design — it identifies the project, it does not
 * grant access. Access is governed server-side: the client only ever talks to
 * Firebase Auth here; all reads/writes go through the service's /v1 API (Admin
 * SDK), and firestore.rules denies every direct client connection.
 *
 * Until these placeholders are filled, hasFirebaseConfig() returns false and
 * the account/billing UI renders its signed-out, "billing during launch" state
 * instead of attempting to initialise Auth.
 * ==========================================================================*/

export const firebaseConfig = {
  apiKey: 'REPLACE_WITH_CAPTADEL_WEB_API_KEY',
  authDomain: 'REPLACE_WITH_CAPTADEL.firebaseapp.com',
  projectId: 'REPLACE_WITH_CAPTADEL_PROJECT_ID',
  appId: 'REPLACE_WITH_CAPTADEL_APP_ID',
};

/* True once the placeholders above have been replaced with real values. */
export function hasFirebaseConfig() {
  return !String(firebaseConfig.apiKey || '').startsWith('REPLACE_WITH_')
    && !String(firebaseConfig.projectId || '').startsWith('REPLACE_WITH_');
}
