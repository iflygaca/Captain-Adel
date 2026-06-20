/* Unit tests — src/middleware/apikey.js.
 *
 * The optional server-to-server key marks a request `trusted` (skips the
 * browser rate limiter) via a timing-safe comparison. It never blocks. Tests
 * overlay config.apiKey on the shared singleton and invoke the middleware
 * directly with a fake req exposing get(). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const apiKeyMiddleware = require('../src/middleware/apikey');
const config = require('../src/config');

function run({ provided, configured }) {
  const prev = config.apiKey;
  config.apiKey = configured;
  try {
    const req = { get(name) { return name === 'X-Adel-Api-Key' ? provided : undefined; } };
    let nexted = false;
    apiKeyMiddleware(req, {}, () => { nexted = true; });
    return { trusted: req.trusted, nexted };
  } finally {
    config.apiKey = prev;
  }
}

test('a matching key marks the request trusted and continues', () => {
  const { trusted, nexted } = run({ provided: 's3cret-key', configured: 's3cret-key' });
  assert.equal(trusted, true);
  assert.equal(nexted, true);
});

test('a wrong key leaves the request untrusted (never blocks)', () => {
  const { trusted, nexted } = run({ provided: 'wrong', configured: 's3cret-key' });
  assert.equal(trusted, false);
  assert.equal(nexted, true);
});

test('a key of a different length is untrusted (no timingSafeEqual throw)', () => {
  const { trusted } = run({ provided: 'short', configured: 'a-much-longer-configured-key' });
  assert.equal(trusted, false);
});

test('an absent provided key is untrusted', () => {
  const { trusted, nexted } = run({ provided: undefined, configured: 's3cret-key' });
  assert.equal(trusted, false);
  assert.equal(nexted, true);
});

test('the feature is dormant when ADEL_API_KEY is unset — even a blank provided key is untrusted', () => {
  assert.equal(run({ provided: '', configured: '' }).trusted, false);
  assert.equal(run({ provided: 'anything', configured: '' }).trusted, false);
});
