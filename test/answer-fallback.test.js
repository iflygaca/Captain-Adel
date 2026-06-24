/* Unit tests — src/brain/answer.js provider fallback + error annotation.
 *
 * The pure routing helpers are covered in answer.test.js. This file exercises
 * the orchestrator's failure handling: when a provider throws, answer() retries
 * once on the cross-provider fallback (Gemini <-> first Arabic provider), and
 * any error that ultimately propagates is annotated (provider / brainStage /
 * primaryProvider) so server.js logs can attribute the outage.
 *
 * Providers are swapped in the shared registry object (providers.PROVIDERS is
 * the very object get() reads), so no network or API key is touched. The
 * fallback path runs real BM25 retrieval against the bundled corpus — that is
 * offline and deterministic, like the other brain unit tests. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const answer = require('../src/brain/answer');
const providers = require('../src/brain/providers');

async function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function withProviders(overrides, fn) {
  const saved = {};
  for (const [name, impl] of Object.entries(overrides)) {
    saved[name] = providers.PROVIDERS[name];
    providers.PROVIDERS[name] = impl;
  }
  try { return await fn(); } finally {
    for (const name of Object.keys(overrides)) providers.PROVIDERS[name] = saved[name];
  }
}

const throwingGemini = (msg) => ({
  answerAgentic: async () => { throw new Error(msg); },
  // eslint-disable-next-line require-yield
  answerAgenticStream: async function* () { throw new Error(msg); },
  complete: async () => { throw new Error(msg); },
  configured: () => true,
});

test('answer: a primary provider error falls back to the configured Arabic provider', async () => {
  await withEnv(
    { ALLAM_BASE_URL: 'http://allam', JAIS_BASE_URL: undefined, MODEL_PROVIDER: undefined, ARABIC_PROVIDER: undefined },
    () => withProviders(
      {
        gemini: throwingGemini('primary down'),
        allam: { complete: async () => 'A PPL applicant must be at least 17 (§61.133).', configured: () => true },
      },
      async () => {
        const out = await answer.answer('How old must a PPL applicant be?', [],
          { apiKey: 'g-key', provider: 'gemini' });
        assert.equal(out.meta.provider, 'allam', 'fallback provider answered');
        assert.match(out.answer, /at least 17/);
      }));
});

test('answer: when the fallback also fails, the error is annotated for logs', async () => {
  await withEnv(
    { ALLAM_BASE_URL: 'http://allam', JAIS_BASE_URL: undefined, MODEL_PROVIDER: undefined, ARABIC_PROVIDER: undefined },
    () => withProviders(
      {
        gemini: throwingGemini('primary down'),
        allam: { complete: async () => { throw new Error('fallback down'); }, configured: () => true },
      },
      async () => {
        await assert.rejects(
          answer.answer('What is the VFR visibility minimum in §91.155?', [],
            { apiKey: 'g-key', provider: 'gemini' }),
          (err) => {
            assert.equal(err.provider, 'allam');
            assert.equal(err.brainStage, 'fallback');
            assert.equal(err.primaryProvider, 'gemini');
            return true;
          });
      }));
});

test('answer: with no fallback available, the primary error is annotated', async () => {
  await withEnv(
    {
      GEMINI_API_KEY: undefined, MODEL_PROVIDER: undefined,
      ALLAM_BASE_URL: undefined, JAIS_BASE_URL: undefined, FANAR_BASE_URL: undefined,
      QWEN_BASE_URL: undefined, COMMANDR_BASE_URL: undefined,
    },
    () => withProviders(
      { gemini: throwingGemini('down') },
      async () => {
        await assert.rejects(
          answer.answer('any question', [], { apiKey: 'g-key', provider: 'gemini' }),
          (err) => {
            assert.equal(err.provider, 'gemini');
            assert.equal(err.brainStage, 'provider');
            assert.equal(err.primaryProvider, undefined, 'no fallback was attempted');
            return true;
          });
      }));
});
