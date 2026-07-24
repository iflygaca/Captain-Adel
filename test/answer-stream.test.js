/* Unit tests — src/brain/answer.js answerStream() (the streaming orchestrator).
 *
 * answer.test.js covers the pure helpers and answer-fallback.test.js the
 * buffered fallback; this file exercises the streaming pipeline itself:
 * the TRAILER_HOLD that keeps the `<<adel kind=…>>` control trailer from ever
 * reaching the client, the held-back remainder that ships just before 'final',
 * the mid-stream provider fallback (reset + re-drive), the read-strategy
 * stream (runProviderStream over completeStream + real BM25 retrieval), and
 * the stream error annotation. Providers are swapped in the shared registry
 * (providers.PROVIDERS) exactly as in answer-fallback.test.js — no network,
 * no API key. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const answer = require('../src/brain/answer');
const providers = require('../src/brain/providers');
const { makeSource } = require('../src/brain/grounding');

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

async function collect(stream) {
  const events = [];
  for await (const ev of stream) events.push(ev);
  return events;
}

const tokensAfterLastReset = (events) => {
  const lastReset = events.map((e) => e.type).lastIndexOf('reset');
  return events.slice(lastReset + 1)
    .filter((e) => e.type === 'token').map((e) => e.delta).join('');
};

// Long enough that tokens clear the 80-char hold and stream before 'final'.
const LONG_ANSWER =
  'Below 10,000 ft MSL, basic VFR requires 3 SM flight visibility and the ' +
  'cloud clearances in the table (§91.155(a)). Keep it VFR, Captain, and mind ' +
  'the ceilings on the way in.';

/* A gemini fake whose agentic stream yields `text` in fixed-size chunks and
 * finishes with a done event carrying the same full text (as the real one does). */
function streamingGemini(text, { sources = [], chunk = 40 } = {}) {
  return {
    answerAgenticStream: async function* (_msg, _history, _opts) {
      for (let i = 0; i < text.length; i += chunk) {
        yield { type: 'token', delta: text.slice(i, i + chunk) };
      }
      yield { type: 'done', answer: text, sources, toolCalls: [] };
    },
    configured: () => true,
  };
}

test('answerStream: the control trailer never reaches a token event and is stripped from final', async () => {
  const raw = LONG_ANSWER + '\n<<adel kind=grounded>>';
  const sources = [makeSource('GACAR Part 91, §91.155(a)', 'library.html#91.155', 'three statute miles …')];
  await withProviders({ gemini: streamingGemini(raw, { sources }) }, async () => {
    const events = await collect(
      answer.answerStream('VFR minima?', [], { apiKey: 'k', provider: 'gemini' }));

    const tokens = events.filter((e) => e.type === 'token');
    assert.ok(tokens.length >= 2, 'text beyond the hold streams before final');
    for (const t of tokens) assert.ok(!/adel kind/.test(t.delta), 'trailer never streams');

    const final = events[events.length - 1];
    assert.equal(final.type, 'final', 'the terminal event is final');
    assert.equal(final.kind, 'grounded');
    assert.ok(!/adel kind/.test(final.answer), 'trailer stripped from the final answer');
    assert.equal(tokensAfterLastReset(events), final.answer,
      'streamed tokens reassemble to exactly the final answer');
    assert.equal(final.sources.length, 1);
  });
});

test('answerStream: the held-back remainder ships as a token before final', async () => {
  // Shorter than TRAILER_HOLD (80): nothing may stream early; everything rides
  // the remainder token that precedes 'final'.
  const short = 'Roger — on the line, Captain.';
  await withProviders({ gemini: streamingGemini(short) }, async () => {
    const events = await collect(
      answer.answerStream('hello', [], { apiKey: 'k', provider: 'gemini' }));
    const types = events.map((e) => e.type);
    assert.deepEqual(types, ['token', 'final'], 'one remainder token, then final');
    assert.equal(events[0].delta, short);
    assert.equal(events[1].answer, short);
  });
});

test('answerStream: read-strategy providers stream completeStream and carry retrieved sources', async () => {
  let seen;
  const fakeAllam = {
    completeStream: async function* ({ systemInstruction, contents, opts }) {
      seen = { systemInstruction, contents, opts };
      yield 'A Class 1 medical certificate is required for ATPL privileges, ';
      yield 'per the medical standards sections retrieved above (Part 67).';
    },
    configured: () => true,
  };
  await withProviders({ allam: fakeAllam }, async () => {
    const events = await collect(
      answer.answerStream('What are the medical certificate requirements?', [], { provider: 'allam' }));
    const final = events[events.length - 1];
    assert.equal(final.type, 'final');
    assert.ok(final.sources.length >= 1, 'sources come from the in-code BM25 retrieval');
    assert.equal(tokensAfterLastReset(events), final.answer);
    assert.match(seen.contents[seen.contents.length - 1].text, /RETRIEVED PASSAGES/,
      'the read-mode user turn wraps the retrieved context');
    assert.equal(typeof seen.systemInstruction, 'string');
  });
});

test('answerStream: a mid-stream provider failure resets and re-drives on the fallback', async () => {
  const failingGemini = {
    answerAgenticStream: async function* () {
      yield { type: 'token', delta: 'x'.repeat(120) };   // clears the hold -> a token is emitted
      throw new Error('stream died');
    },
    configured: () => true,
  };
  const fallbackAllam = {
    completeStream: async function* () { yield LONG_ANSWER; },
    configured: () => true,
  };
  await withEnv({ ALLAM_BASE_URL: 'http://allam', ARABIC_PROVIDER: undefined }, () =>
    withProviders({ gemini: failingGemini, allam: fallbackAllam }, async () => {
      const events = await collect(
        answer.answerStream('any question', [], { apiKey: 'k', provider: 'gemini' }));
      const types = events.map((e) => e.type);
      assert.ok(types.indexOf('token') < types.indexOf('reset'),
        'the primary streamed before the reset wiped it');
      const final = events[events.length - 1];
      assert.equal(final.meta.provider, 'allam', 'final is attributed to the fallback');
      assert.equal(tokensAfterLastReset(events), final.answer,
        'post-reset tokens reassemble to the fallback answer');
    }));
});

test('answerStream: when the fallback stream also fails, the error is annotated', async () => {
  const throwingStream = () => ({
    // eslint-disable-next-line require-yield
    answerAgenticStream: async function* () { throw new Error('primary down'); },
    // eslint-disable-next-line require-yield
    completeStream: async function* () { throw new Error('fallback down'); },
    configured: () => true,
  });
  await withEnv({ ALLAM_BASE_URL: 'http://allam', ARABIC_PROVIDER: undefined }, () =>
    withProviders({ gemini: throwingStream(), allam: throwingStream() }, async () => {
      await assert.rejects(
        collect(answer.answerStream('q', [], { apiKey: 'k', provider: 'gemini' })),
        (err) => {
          assert.equal(err.provider, 'allam');
          assert.equal(err.brainStage, 'stream-fallback');
          assert.equal(err.primaryProvider, 'gemini');
          return true;
        });
    }));
});

test('answerStream: with no fallback available, the primary stream error is annotated', async () => {
  await withEnv(
    {
      ALLAM_BASE_URL: undefined, JAIS_BASE_URL: undefined, FANAR_BASE_URL: undefined,
      QWEN_BASE_URL: undefined, COMMANDR_BASE_URL: undefined, MODEL_PROVIDER: undefined,
    },
    () => withProviders(
      {
        // eslint-disable-next-line require-yield
        gemini: { answerAgenticStream: async function* () { throw new Error('down'); }, configured: () => true },
      },
      async () => {
        await assert.rejects(
          collect(answer.answerStream('q', [], { apiKey: 'k', provider: 'gemini' })),
          (err) => {
            assert.equal(err.provider, 'gemini');
            assert.equal(err.brainStage, 'stream');
            assert.equal(err.primaryProvider, undefined);
            return true;
          });
      }));
});

test('answerStream: an empty message yields a single decorated final', async () => {
  const events = await collect(answer.answerStream('   ', [], {}));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'final');
  assert.match(events[0].answer, /Say again/);
});
