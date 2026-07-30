/* Unit tests — captadel/src/brain/history.js
 *
 * normalizeHistory is the one home of the history-shaping rules shared by
 * answer.js (read paths) and providers/gemini.js (agentic paths): drop the
 * duplicate trailing user turn chat clients push before POSTing, trim to the
 * last MAX_HISTORY_TURNS, skip blank turns, coerce roles to 'user'|'model'. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHistory, MAX_HISTORY_TURNS } = require('../src/brain/history');

test('normalizeHistory: drops the duplicate trailing user turn', () => {
  const out = normalizeHistory('what about VFR?', [
    { role: 'user', text: 'hello' },
    { role: 'model', text: 'hi Captain' },
    { role: 'user', text: 'what about VFR?' },
  ]);
  assert.deepEqual(out, [
    { role: 'user', text: 'hello' },
    { role: 'model', text: 'hi Captain' },
  ]);
});

test('normalizeHistory: keeps a trailing user turn that differs from the message', () => {
  const out = normalizeHistory('another question', [
    { role: 'user', text: 'first question' },
  ]);
  assert.deepEqual(out, [{ role: 'user', text: 'first question' }]);
});

test('normalizeHistory: coerces unknown roles to user, keeps model', () => {
  const out = normalizeHistory('q', [
    { role: 'assistant', text: 'a' },
    { role: 'model', text: 'b' },
    { role: 'system', text: 'c' },
  ]);
  assert.deepEqual(out.map((h) => h.role), ['user', 'model', 'user']);
});

test('normalizeHistory: skips blank and text-less turns', () => {
  const out = normalizeHistory('q', [
    { role: 'user', text: '   ' },
    { role: 'model' },
    { role: 'user', text: 'kept' },
    null,
  ]);
  assert.deepEqual(out, [{ role: 'user', text: 'kept' }]);
});

test('normalizeHistory: trims to the last MAX_HISTORY_TURNS turns', () => {
  const long = [];
  for (let i = 0; i < MAX_HISTORY_TURNS + 5; i++) {
    long.push({ role: i % 2 ? 'model' : 'user', text: `turn ${i}` });
  }
  const out = normalizeHistory('q', long);
  assert.equal(out.length, MAX_HISTORY_TURNS);
  assert.equal(out[0].text, `turn 5`);
  assert.equal(out[out.length - 1].text, `turn ${MAX_HISTORY_TURNS + 4}`);
});

test('normalizeHistory: honours a custom maxTurns', () => {
  const out = normalizeHistory('q', [
    { role: 'user', text: 'a' },
    { role: 'model', text: 'b' },
    { role: 'user', text: 'c' },
  ], 2);
  assert.deepEqual(out.map((h) => h.text), ['b', 'c']);
});

test('normalizeHistory: non-array history yields []', () => {
  assert.deepEqual(normalizeHistory('q', null), []);
  assert.deepEqual(normalizeHistory('q', 'not an array'), []);
  assert.deepEqual(normalizeHistory('q', undefined), []);
});
