/* Unit tests — src/brain/providers/index.js (the provider registry). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const providers = require('../src/brain/providers');

test('get: returns the named provider', () => {
  assert.equal(providers.get('allam'), providers.allam);
  assert.equal(providers.get('gemini'), providers.gemini);
  assert.equal(providers.get('commandr'), providers.commandr);
});

test('get: an unknown / missing name falls back to gemini', () => {
  assert.equal(providers.get('nope'), providers.gemini);
  assert.equal(providers.get(undefined), providers.gemini);
  assert.equal(providers.get(''), providers.gemini);
});

test('ARABIC_PROVIDERS: in-Kingdom models in preference order, ALLaM first', () => {
  assert.deepEqual(providers.ARABIC_PROVIDERS, ['allam', 'jais', 'fanar', 'qwen', 'commandr']);
});

test('every ARABIC_PROVIDERS entry resolves to a real provider exposing complete()', () => {
  for (const name of providers.ARABIC_PROVIDERS) {
    const p = providers.get(name);
    assert.equal(p.name, name);
    assert.equal(typeof p.complete, 'function');
    assert.equal(typeof p.configured, 'function');
  }
});
