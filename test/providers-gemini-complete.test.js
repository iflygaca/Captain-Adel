/* Unit tests — src/brain/providers/gemini.js complete() / completeStream()
 * (the tool-less read-strategy paths).
 *
 * Unlike the agentic loop (which takes the client via the opts._ai seam),
 * these construct their own GoogleGenAI — so the SDK is swapped in the require
 * cache BEFORE gemini.js loads in this process. providers-gemini.test.js keeps
 * the real SDK; test files run in separate processes, so the two never clash.
 * No network, no real key. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Load the real SDK once, then hand gemini.js a fake in its place.
require('@google/genai');
const GENAI_PATH = require.resolve('@google/genai');

let lastRequest = null;
let nextResponseParts = [];

class FakeGoogleGenAI {
  constructor({ apiKey }) {
    this.apiKey = apiKey;
    this.models = {
      generateContent: async (req) => {
        lastRequest = { ...req, apiKey };
        return { candidates: [{ content: { parts: nextResponseParts } }] };
      },
      generateContentStream: async (req) => {
        lastRequest = { ...req, apiKey };
        const parts = nextResponseParts;
        return (async function* stream() {
          // One part per chunk, plus a no-content keep-alive chunk to skip.
          for (const p of parts) yield { candidates: [{ content: { parts: [p] } }] };
          yield { candidates: [{}] };
        })();
      },
    };
  }
}

require.cache[GENAI_PATH].exports = { GoogleGenAI: FakeGoogleGenAI };
const gemini = require('../src/brain/providers/gemini');

const CONTENTS = [
  { role: 'user', text: 'What are the VFR minimums?' },
  { role: 'model', text: 'Which airspace, Captain?' },
  { role: 'anything-else', text: 'Class G, by day.' },   // non-model roles map to user
];

test('completeStream: yields text parts in order and skips non-text chunks', async () => {
  nextResponseParts = [{ text: 'Three statute ' }, { notText: true }, { text: 'miles.' }];
  const out = [];
  for await (const delta of gemini.completeStream(
    { systemInstruction: 'SYS', contents: CONTENTS, opts: { apiKey: 'k1', model: 'test-model' } })) {
    out.push(delta);
  }
  assert.deepEqual(out, ['Three statute ', 'miles.']);
  assert.equal(lastRequest.apiKey, 'k1');
  assert.equal(lastRequest.model, 'test-model');
  assert.equal(lastRequest.config.systemInstruction, 'SYS');
  assert.deepEqual(lastRequest.contents.map((c) => c.role), ['user', 'model', 'user'],
    'only "model" survives as model; every other role becomes user');
});

test('complete: joins the text parts and trims the result', async () => {
  nextResponseParts = [{ text: '  Three statute miles' }, { noText: 1 }, { text: ' (§91.155).  ' }];
  const out = await gemini.complete(
    { systemInstruction: 'SYS', contents: CONTENTS, opts: { apiKey: 'k2' } });
  assert.equal(out, 'Three statute miles (§91.155).');
  assert.equal(lastRequest.model, gemini.DEFAULT_MODEL, 'model defaults when opts.model is unset');
});

test('complete / completeStream: no API key anywhere throws the configuration error', async () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(
      () => gemini.complete({ systemInstruction: 'S', contents: [], opts: {} }),
      /GEMINI_API_KEY is not configured/);
    await assert.rejects(async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of gemini.completeStream({ systemInstruction: 'S', contents: [], opts: {} })) { /* drain */ }
    }, /GEMINI_API_KEY is not configured/);
  } finally {
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
  }
});

test('complete: an empty candidate list returns the empty string, never a throw', async () => {
  nextResponseParts = [];
  const out = await gemini.complete({ systemInstruction: 'S', contents: [], opts: { apiKey: 'k' } });
  assert.equal(out, '');
});
