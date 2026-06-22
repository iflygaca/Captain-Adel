/* Unit tests — src/brain/index.js public seam.
 *
 * index.js is the single import surface the host (server.js) and the evals
 * compose against. It is a thin re-export module, but precisely because nothing
 * else imports these names directly, a silent break (a renamed export, a moved
 * file) would only surface at runtime in production or in a live eval. This
 * cheap structural test pins the contract so the secret-less PR gate catches it. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const brain = require('../src/brain');

test('index: exposes the public functions the host composes against', () => {
  for (const name of ['answer', 'answerStream', 'warmUp', 'pickProvider']) {
    assert.equal(typeof brain[name], 'function', `brain.${name} must be a function`);
  }
});

test('index: re-exports the portable edge helpers and retriever', () => {
  assert.ok(brain.guards && typeof brain.guards.inspectMessage === 'function',
    'guards.inspectMessage is the input-guard entry point');
  assert.ok(brain.ratelimit && typeof brain.ratelimit.check === 'function',
    'ratelimit.check is the rate-limit entry point');
  assert.ok(brain.bm25 && typeof brain.bm25.searchLibrary === 'function',
    'bm25.searchLibrary is the retriever entry point');
});

test('index: warmUp builds the BM25 index without throwing (offline, no keys)', () => {
  assert.doesNotThrow(() => brain.warmUp());
  // After warmUp the bundled corpus is queryable.
  const hits = brain.bm25.searchLibrary('visibility', 3);
  assert.ok(Array.isArray(hits), 'searchLibrary returns an array of hits');
});
