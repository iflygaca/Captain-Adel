/* ============================================================================
 * Captain Adel — Firebase Admin SDK singleton (lazy).
 *
 * The SaaS layer (auth, entitlements, quota) needs the Admin SDK; the brain and
 * the eval harness do not. So firebase-admin is required lazily, inside the
 * getters — `npm run smoke` and the pure-core unit tests load this module with
 * zero credentials and never touch the network. On Cloud Run, initializeApp()
 * with no args uses the service's own ADC and the surrounding GCP project's
 * Firestore; locally, FIREBASE_PROJECT_ID + `gcloud auth application-default
 * login` provide the same.
 *
 * available() lets callers (the billing routes, the auth middleware) degrade
 * gracefully when no project is configured — the layer stays dark rather than
 * throwing.
 * ==========================================================================*/

'use strict';

const config = require('./config');

let _admin = null;
let _app = null;

function admin() {
  if (!_admin) _admin = require('firebase-admin');
  return _admin;
}

/* Is an Admin SDK app usable in this environment? True once a project id is
 * resolvable (Cloud Run sets GOOGLE_CLOUD_PROJECT automatically). */
function available() {
  return !!config.firebaseProjectId;
}

function app() {
  if (_app) return _app;
  const a = admin();
  if (a.apps.length) { _app = a.apps[0]; return _app; }
  _app = config.firebaseProjectId
    ? a.initializeApp({ projectId: config.firebaseProjectId })
    : a.initializeApp();
  return _app;
}

function db() {
  app();
  return admin().firestore();
}

function serverTimestamp() {
  return admin().firestore.FieldValue.serverTimestamp();
}

/* Verify a Firebase ID token; resolves to the decoded token or rejects. */
async function verifyIdToken(token) {
  app();
  return admin().auth().verifyIdToken(token);
}

/* Delete a Firebase Auth user (account deletion, Apple 5.1.1(v)). */
async function deleteUser(uid) {
  app();
  return admin().auth().deleteUser(uid);
}

module.exports = { available, app, db, serverTimestamp, verifyIdToken, deleteUser };
