/* Unit tests — src/brain/answer.js pure helpers.
 *
 * buildContents (history normalization), looksLikeCompute (compute-intent
 * detection) and the routing helpers routeTurn / pickFallback. These are pure
 * given env (provider configuration) and opts; the network paths (answer /
 * answerStream) are not exercised here. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const answer = require('../src/brain/answer');

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/* ---- buildContents --------------------------------------------------------*/

test('buildContents: drops the duplicate trailing user turn equal to the message', () => {
  const out = answer.buildContents('hello', [
    { role: 'user', text: 'earlier' },
    { role: 'model', text: 'reply' },
    { role: 'user', text: 'hello' },   // the echoed current turn — must be removed
  ]);
  assert.deepEqual(out, [
    { role: 'user', text: 'earlier' },
    { role: 'model', text: 'reply' },
  ]);
});

test('buildContents: normalizes roles and skips empty/whitespace turns', () => {
  const out = answer.buildContents('q', [
    { role: 'assistant', text: 'a' },   // any non-"model" role -> user
    { role: 'model', text: '  ' },       // blank -> dropped
    { role: 'model', text: ' grounded ' },
  ]);
  assert.deepEqual(out, [
    { role: 'user', text: 'a' },
    { role: 'model', text: 'grounded' },
  ]);
});

test('buildContents: keeps only the last 12 turns', () => {
  const history = [];
  for (let i = 0; i < 20; i++) history.push({ role: 'user', text: `m${i}` });
  const out = answer.buildContents('q', history);
  assert.equal(out.length, 12);
  assert.equal(out[0].text, 'm8');     // 20 turns -> last 12 start at m8
  assert.equal(out[11].text, 'm19');
});

test('buildContents: non-array history yields an empty list', () => {
  assert.deepEqual(answer.buildContents('q', undefined), []);
  assert.deepEqual(answer.buildContents('q', null), []);
});

/* ---- looksLikeCompute -----------------------------------------------------*/

test('looksLikeCompute: requires BOTH a digit and a compute keyword', () => {
  assert.equal(answer.looksLikeCompute('crosswind for runway 18 at 15 knots'), true);
  assert.equal(answer.looksLikeCompute('explain the crosswind component'), false); // no digit
  assert.equal(answer.looksLikeCompute('what are the 5 freedoms of the air'), false); // no keyword
  assert.equal(answer.looksLikeCompute(''), false);
});

test('looksLikeCompute: matches Arabic compute keywords with a number', () => {
  assert.equal(answer.looksLikeCompute('احسب الوقود لرحلة 90 دقيقة'), true);
  assert.equal(answer.looksLikeCompute('اشرح الوزن والاتزان'), false); // no digit
});

/* ---- routeTurn ------------------------------------------------------------*/

test('routeTurn: an explicit provider is honoured as-is, with no compute note', () => {
  withEnv({ ALLAM_BASE_URL: 'http://allam', MODEL_PROVIDER: undefined }, () => {
    const opts = { provider: 'allam' };
    const r = answer.routeTurn('crosswind at 12 knots', opts);
    assert.equal(r.name, 'allam');
    assert.equal(r.opts.systemSuffix, undefined); // explicit -> untouched
  });
});

test('routeTurn: auto compute question goes to Gemini when Gemini is usable', () => {
  withEnv({ GEMINI_API_KEY: undefined, MODEL_PROVIDER: undefined }, () => {
    // Arabic message would otherwise route to ALLaM, but a usable Gemini wins
    // for compute (it has the flight-computer tools).
    const r = answer.routeTurn('احسب الوقود لـ 90 دقيقة', { apiKey: 'g-key', provider: 'auto' });
    assert.equal(r.name, 'gemini');
  });
});

test('routeTurn: auto compute on a read-mode provider gets the no-compute note appended', () => {
  withEnv({ GEMINI_API_KEY: undefined, ALLAM_BASE_URL: 'http://allam', ARABIC_PROVIDER: undefined, MODEL_PROVIDER: undefined }, () => {
    // Arabic compute question, ALLaM configured, no Gemini -> routes to ALLaM
    // (read mode) and the system suffix tells it to defer arithmetic to a tool.
    const r = answer.routeTurn('احسب الوقود لـ 90 دقيقة', { provider: 'auto' });
    assert.equal(r.name, 'allam');
    assert.match(r.opts.systemSuffix, /calculation tools are unavailable/);
  });
});

test('routeTurn: a non-compute question is left untouched', () => {
  withEnv({ GEMINI_API_KEY: undefined, MODEL_PROVIDER: undefined }, () => {
    const r = answer.routeTurn('what is GACAR Part 91 about?', { apiKey: 'g-key' });
    assert.equal(r.name, 'gemini');
    assert.equal(r.opts.systemSuffix, undefined);
  });
});

/* ---- pickFallback ---------------------------------------------------------*/

test('pickFallback: an Arabic provider falls back to Gemini when usable, else null', () => {
  withEnv({ GEMINI_API_KEY: undefined }, () => {
    assert.equal(answer.pickFallback('allam', { apiKey: 'g-key' }), 'gemini');
    assert.equal(answer.pickFallback('allam', {}), null);
  });
});

test('pickFallback: Gemini falls back to the first configured Arabic provider', () => {
  withEnv({ ALLAM_BASE_URL: 'http://allam', JAIS_BASE_URL: undefined }, () => {
    assert.equal(answer.pickFallback('gemini', {}), 'allam');
  });
});

test('pickFallback: Gemini with no Arabic provider configured returns null', () => {
  withEnv({
    ALLAM_BASE_URL: undefined, JAIS_BASE_URL: undefined, FANAR_BASE_URL: undefined,
    QWEN_BASE_URL: undefined, COMMANDR_BASE_URL: undefined,
  }, () => {
    assert.equal(answer.pickFallback('gemini', {}), null);
  });
});
