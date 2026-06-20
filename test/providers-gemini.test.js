/* Unit tests — src/brain/providers/gemini.js.
 *
 * The Gemini SDK client is injected via opts._ai (a test-only seam), so the
 * agentic function-calling loop runs deterministically with no network and no
 * API key. The tool calls hit the real bundled BM25 corpus (no network).
 * Covers buildContents, the final-answer path, a tool round, the max-rounds
 * fallback, the empty-message guard, and the streaming reset behavior. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../src/brain/providers/gemini');

/* ---- buildContents --------------------------------------------------------*/

test('buildContents: dedupes the echoed user turn and appends the message last', () => {
  const out = gemini.buildContents('hello', [
    { role: 'user', text: 'prior' },
    { role: 'user', text: 'hello' },   // echoed current turn
  ]);
  assert.deepEqual(out, [
    { role: 'user', parts: [{ text: 'prior' }] },
    { role: 'user', parts: [{ text: 'hello' }] },  // the message, appended once
  ]);
});

test('buildContents: maps non-model roles to user and drops blanks', () => {
  const out = gemini.buildContents('q', [
    { role: 'model', text: 'm' },
    { role: 'assistant', text: '' },
  ]);
  assert.deepEqual(out, [
    { role: 'model', parts: [{ text: 'm' }] },
    { role: 'user', parts: [{ text: 'q' }] },
  ]);
});

/* ---- fake Gemini client ---------------------------------------------------*/

// Each "round" is an array of response parts. A part with `functionCall` drives
// a tool call; a part with `text` is model prose. generateContent pops the next
// round; generateContentStream yields it as a single streamed chunk.
function fakeAi(rounds) {
  const queue = rounds.slice();
  return {
    calls: 0,
    models: {
      generateContent: async function generateContent() {
        const parts = queue.shift() || [{ text: '' }];
        return { candidates: [{ content: { parts } }] };
      },
      // eslint-disable-next-line require-yield
      generateContentStream: async function generateContentStream() {
        const parts = queue.shift() || [{ text: '' }];
        return (async function* gen() {
          yield { candidates: [{ content: { parts } }] };
        })();
      },
    },
  };
}

/* ---- answerAgentic --------------------------------------------------------*/

test('answerAgentic: empty message returns the canned reply without calling the model', async () => {
  const out = await gemini.answerAgentic('   ', [], { apiKey: 'k', _ai: fakeAi([]) });
  assert.match(out.answer, /Say again/);
  assert.deepEqual(out.sources, []);
});

test('answerAgentic: a final text round returns the trimmed answer and no sources', async () => {
  const ai = fakeAi([[{ text: '  Part 91 governs general operating rules.  ' }]]);
  const out = await gemini.answerAgentic('what is Part 91?', [], { apiKey: 'k', _ai: ai });
  assert.equal(out.answer, 'Part 91 governs general operating rules.');
  assert.deepEqual(out.sources, []);
  assert.deepEqual(out.toolCalls, []);
});

test('answerAgentic: a search_library tool round populates sources, then the final text answers', async () => {
  const ai = fakeAi([
    [{ functionCall: { name: 'search_library', args: { query: 'medical certificate requirements' } } }],
    [{ text: 'A Class 1 medical is required for ATPL privileges.' }],
  ]);
  const out = await gemini.answerAgentic('medical certificate?', [], { apiKey: 'k', _ai: ai });
  assert.match(out.answer, /Class 1 medical/);
  assert.ok(out.sources.length >= 1, 'tool round pushed at least one source');
  for (const s of out.sources) assert.ok('citation' in s && 'url' in s);
});

test('answerAgentic: never-final loop hits MAX_TOOL_ROUNDS and returns the fallback message', async () => {
  // Every round is a tool call -> the loop exhausts its 5 rounds.
  const round = [{ functionCall: { name: 'search_library', args: { query: 'x' } } }];
  const out = await gemini.answerAgentic('q', [], { apiKey: 'k', _ai: fakeAi([round, round, round, round, round, round]) });
  assert.match(out.answer, /ran past my lookup limit/);
});

test('answerAgentic: missing API key throws (the seam still requires a key)', async () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(() => gemini.answerAgentic('q', [], { _ai: fakeAi([]) }), /GEMINI_API_KEY is not configured/);
  } finally {
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
  }
});

/* ---- answerAgenticStream --------------------------------------------------*/

test('answerAgenticStream: empty message yields a single done event with the canned reply', async () => {
  const events = [];
  for await (const ev of gemini.answerAgenticStream('  ', [], { apiKey: 'k', _ai: fakeAi([]) })) events.push(ev);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'done');
  assert.match(events[0].answer, /Say again/);
});

test('answerAgenticStream: streams final tokens then a done event', async () => {
  const ai = fakeAi([[{ text: 'Cleared for the option.' }]]);
  const events = [];
  for await (const ev of gemini.answerAgenticStream('q', [], { apiKey: 'k', _ai: ai })) events.push(ev);
  const tokens = events.filter((e) => e.type === 'token').map((e) => e.delta).join('');
  const done = events.find((e) => e.type === 'done');
  assert.equal(tokens, 'Cleared for the option.');
  assert.ok(done && done.answer === 'Cleared for the option.');
});

test('answerAgenticStream: a text-bearing tool round emits a reset before the final answer', async () => {
  // Round 0 emits interim text AND a tool call -> the interim text must be reset.
  const ai = fakeAi([
    [{ text: 'let me check…' }, { functionCall: { name: 'search_library', args: { query: 'medical certificate' } } }],
    [{ text: 'Final grounded answer.' }],
  ]);
  const events = [];
  for await (const ev of gemini.answerAgenticStream('q', [], { apiKey: 'k', _ai: ai })) events.push(ev);
  const types = events.map((e) => e.type);
  assert.ok(types.includes('reset'), 'interim text triggers a reset');
  const done = events.find((e) => e.type === 'done');
  assert.equal(done.answer, 'Final grounded answer.');
  // The reset precedes the final token stream.
  assert.ok(types.indexOf('reset') < types.lastIndexOf('token'));
});
