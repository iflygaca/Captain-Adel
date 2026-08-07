/* Unit tests — src/firebase.js (the lazy Firebase Admin SDK singleton).
 *
 * app()/db()/verifyIdToken() memoize into module-level `_app`/`_admin`, so each
 * scenario needs a fresh module instance: the require-cache entry for
 * src/firebase.js is evicted per test (same pattern as test/config.test.js and
 * test/embeddings-dense.test.js), and firebase-admin itself is swapped in the
 * require cache for a fake (same pattern as test/providers-gemini-complete.test.js
 * swaps @google/genai) so no real credentials/network are touched.
 * config.firebaseProjectId is mutated directly (assign-and-restore, as
 * test/auth.test.js does for config.launchMode) since firebase.js and this test
 * share the same config singleton. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');

const FIREBASE_PATH = require.resolve('../src/firebase');

// Load the real SDK once so it's in the require cache, then hand firebase.js a
// fake in its place for the duration of each test.
require('firebase-admin');
const ADMIN_PATH = require.resolve('firebase-admin');

/* Run `fn(firebase, fake)` against a fresh src/firebase.js module wired to a
 * fake firebase-admin. `fake.apps` seeds admin().apps; `fake.initializeApp`
 * calls are recorded on `fake.initializeAppCalls`. `projectId` sets
 * config.firebaseProjectId for the duration of the run. */
function withFirebase({ projectId = '', existingApps = [] } = {}, fn) {
  const savedAdminExports = require.cache[ADMIN_PATH].exports;
  const savedProjectId = config.firebaseProjectId;
  config.firebaseProjectId = projectId;
  delete require.cache[FIREBASE_PATH];

  const initializeAppCalls = [];
  const deleteUserCalls = [];
  const newApp = { name: 'new-app' };
  const fakeAdmin = {
    apps: existingApps,
    initializeApp: (...args) => { initializeAppCalls.push(args); return newApp; },
    firestore: Object.assign(() => ({ fake: 'firestore' }), {
      FieldValue: { serverTimestamp: () => 'SENTINEL_TIMESTAMP' },
    }),
    auth: () => ({
      verifyIdToken: async (token) => ({ uid: `uid-${token}` }),
      deleteUser: async (uid) => { deleteUserCalls.push(uid); },
    }),
  };
  require.cache[ADMIN_PATH].exports = fakeAdmin;

  try {
    const firebase = require(FIREBASE_PATH);
    return fn(firebase, { fakeAdmin, initializeAppCalls, newApp, deleteUserCalls });
  } finally {
    require.cache[ADMIN_PATH].exports = savedAdminExports;
    config.firebaseProjectId = savedProjectId;
    delete require.cache[FIREBASE_PATH];
  }
}

/* ---- available() -----------------------------------------------------*/

test('available(): true once config.firebaseProjectId is set', () => {
  withFirebase({ projectId: 'my-project' }, (firebase) => {
    assert.equal(firebase.available(), true);
  });
});

test('available(): false when config.firebaseProjectId is empty', () => {
  withFirebase({ projectId: '' }, (firebase) => {
    assert.equal(firebase.available(), false);
  });
});

/* ---- app(): reuse vs. initializeApp() --------------------------------*/

test('app(): reuses admin().apps[0] when an app already exists, never calls initializeApp', () => {
  const existingApp = { name: 'already-initialized' };
  withFirebase({ projectId: 'my-project', existingApps: [existingApp] }, (firebase, { initializeAppCalls }) => {
    const got = firebase.app();
    assert.equal(got, existingApp);
    assert.equal(initializeAppCalls.length, 0);
  });
});

test('app(): calls initializeApp({projectId}) when no app exists and a project id is configured', () => {
  withFirebase({ projectId: 'my-project', existingApps: [] }, (firebase, { initializeAppCalls, newApp }) => {
    const got = firebase.app();
    assert.equal(got, newApp);
    assert.equal(initializeAppCalls.length, 1);
    assert.deepEqual(initializeAppCalls[0], [{ projectId: 'my-project' }]);
  });
});

test('app(): calls initializeApp() with no args when no app exists and no project id is configured', () => {
  withFirebase({ projectId: '', existingApps: [] }, (firebase, { initializeAppCalls, newApp }) => {
    const got = firebase.app();
    assert.equal(got, newApp);
    assert.equal(initializeAppCalls.length, 1);
    assert.deepEqual(initializeAppCalls[0], []);
  });
});

test('app(): memoizes — a second call returns the same instance without calling initializeApp again', () => {
  withFirebase({ projectId: 'my-project', existingApps: [] }, (firebase, { initializeAppCalls }) => {
    const first = firebase.app();
    const second = firebase.app();
    assert.equal(second, first);
    assert.equal(initializeAppCalls.length, 1, 'initializeApp must only run once');
  });
});

test('app(): memoizes even the "reuse existing app" path — apps.length is only consulted once', () => {
  const existingApp = { name: 'already-initialized' };
  withFirebase({ projectId: 'my-project', existingApps: [existingApp] }, (firebase, { fakeAdmin, initializeAppCalls }) => {
    const first = firebase.app();
    // Mutate the fake admin's apps list after the first call: if app() were not
    // memoized it would notice the change on a second call.
    fakeAdmin.apps = [];
    const second = firebase.app();
    assert.equal(second, first);
    assert.equal(initializeAppCalls.length, 0);
  });
});

/* ---- db() / serverTimestamp() / verifyIdToken() -----------------------*/

test('db(): calls app() first, then returns admin().firestore()', () => {
  withFirebase({ projectId: 'my-project', existingApps: [] }, (firebase, { initializeAppCalls }) => {
    const result = firebase.db();
    assert.deepEqual(result, { fake: 'firestore' });
    assert.equal(initializeAppCalls.length, 1, 'db() must have triggered app() init');
  });
});

test('serverTimestamp(): delegates to admin().firestore.FieldValue.serverTimestamp()', () => {
  withFirebase({}, (firebase) => {
    assert.equal(firebase.serverTimestamp(), 'SENTINEL_TIMESTAMP');
  });
});

test('verifyIdToken(): calls app() first, then resolves via admin().auth().verifyIdToken()', async () => {
  await withFirebase({ projectId: 'my-project', existingApps: [] }, async (firebase, { initializeAppCalls }) => {
    const decoded = await firebase.verifyIdToken('sometoken');
    assert.deepEqual(decoded, { uid: 'uid-sometoken' });
    assert.equal(initializeAppCalls.length, 1, 'verifyIdToken() must have triggered app() init');
  });
});

test('deleteUser(): calls app() first, then delegates to admin().auth().deleteUser()', async () => {
  await withFirebase({ projectId: 'my-project', existingApps: [] }, async (firebase, { initializeAppCalls, deleteUserCalls }) => {
    await firebase.deleteUser('u-gone');
    assert.deepEqual(deleteUserCalls, ['u-gone']);
    assert.equal(initializeAppCalls.length, 1, 'deleteUser() must have triggered app() init');
  });
});
