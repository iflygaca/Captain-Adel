/* Unit tests — captadel/src/brain/route.js
 *
 * Provider routing: arabicRatio scoring and the auto-routing rule. ALLaM is not
 * configured in the test environment, so auto always resolves to gemini here —
 * which is exactly the production fallback we want to pin. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arabicRatio, pickProvider } = require('../src/brain/route');

test('arabicRatio: pure-English is 0', () => {
  assert.equal(arabicRatio('What is the AIRAC cycle?'), 0);
});

test('arabicRatio: pure-Arabic scores well above the 0.4 routing threshold', () => {
  // Note: the Arabic-block regex also matches diacritics/marks that \p{L} does
  // not count as letters, so the ratio can slightly exceed 1.0 — harmless, since
  // routing only compares against the 0.4 threshold.
  const r = arabicRatio('ما هي دورة الإيراك؟');
  assert.ok(r >= 0.9, `expected >= 0.9, got ${r}`);
});

test('arabicRatio: no letters -> 0 (no divide-by-zero)', () => {
  assert.equal(arabicRatio(''), 0);
  assert.equal(arabicRatio('12345 !!! ...'), 0);
  assert.equal(arabicRatio(null), 0);
});

test('arabicRatio: mixed script is a fraction strictly between 0 and 1', () => {
  const r = arabicRatio('GACAR طيران rules');
  assert.ok(r > 0 && r < 1, `got ${r}`);
});

test('pickProvider: explicit provider is honoured as-is', () => {
  assert.equal(pickProvider('anything', { provider: 'gemini' }), 'gemini');
  assert.equal(pickProvider('anything', { provider: 'allam' }), 'allam');
});

test('pickProvider: auto falls back to gemini when ALLaM is unconfigured', () => {
  // No ALLAM_BASE_URL in the test env -> allam.configured() is false.
  delete process.env.ALLAM_BASE_URL;
  assert.equal(pickProvider('ما هي متطلبات الرخصة؟', { provider: 'auto' }), 'gemini');
  assert.equal(pickProvider('English question', { provider: 'auto' }), 'gemini');
});

test('pickProvider: defaults to gemini when no provider and no MODEL_PROVIDER', () => {
  const saved = process.env.MODEL_PROVIDER;
  delete process.env.MODEL_PROVIDER;
  assert.equal(pickProvider('hello'), 'gemini');
  if (saved !== undefined) process.env.MODEL_PROVIDER = saved;
});

test('pickProvider: MODEL_PROVIDER env sets the default', () => {
  const saved = process.env.MODEL_PROVIDER;
  process.env.MODEL_PROVIDER = 'allam';
  assert.equal(pickProvider('hello'), 'allam');
  if (saved === undefined) delete process.env.MODEL_PROVIDER;
  else process.env.MODEL_PROVIDER = saved;
});
