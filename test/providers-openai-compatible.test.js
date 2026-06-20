/* Unit tests — src/brain/providers/openai-compatible.js factory.
 *
 * The factory builds ALLaM/Jais/… from a small env config and talks to an
 * OpenAI-compatible /chat/completions endpoint over the Node global fetch.
 * Tests stub global fetch (assign-and-restore) and a private env namespace so
 * no real endpoint is hit. Covers complete() request shape + parsing + errors,
 * and completeStream() SSE frame parsing. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeOpenAICompatibleProvider } = require('../src/brain/providers/openai-compatible');

const ENV = { base: 'TEST_OAI_BASE_URL', model: 'TEST_OAI_MODEL', key: 'TEST_OAI_API_KEY' };

function makeProvider() {
  return makeOpenAICompatibleProvider({
    name: 'testoai', baseUrlEnv: ENV.base, modelEnv: ENV.model,
    apiKeyEnv: ENV.key, defaultModel: 'default/model',
  });
}

async function withStub({ env = {}, fetch: fakeFetch }, fn) {
  const realFetch = global.fetch;
  const prev = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (fakeFetch) global.fetch = fakeFetch;
  try { return await fn(); } finally {
    global.fetch = realFetch;
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/* Build a fake fetch returning a non-streaming chat completion. */
function jsonFetch(captured, content) {
  return async (url, opts) => {
    captured.url = url; captured.body = JSON.parse(opts.body); captured.headers = opts.headers;
    return { ok: true, async json() { return { choices: [{ message: { content } }] }; } };
  };
}

/* Build a fake fetch streaming the given SSE chunks (each a raw string). */
function sseFetch(chunks) {
  return async () => {
    const enc = new TextEncoder();
    let i = 0;
    return {
      ok: true,
      body: {
        getReader() {
          return {
            async read() {
              if (i < chunks.length) return { done: false, value: enc.encode(chunks[i++]) };
              return { done: true, value: undefined };
            },
          };
        },
      },
    };
  };
}

test('configured / DEFAULT_MODEL: reflect env at factory and call time', async () => {
  await withStub({ env: { [ENV.base]: undefined, [ENV.model]: undefined } }, () => {
    const p = makeProvider();
    assert.equal(p.configured(), false);
    assert.equal(p.DEFAULT_MODEL, 'default/model');   // modelEnv unset -> default
  });
  await withStub({ env: { [ENV.base]: 'http://host', [ENV.model]: 'served/model' } }, () => {
    const p = makeProvider();
    assert.equal(p.configured(), true);
    assert.equal(p.DEFAULT_MODEL, 'served/model');    // modelEnv captured at build
  });
});

test('complete: builds the request (system + mapped turns, temp 0.2) and parses content', async () => {
  const captured = {};
  await withStub(
    { env: { [ENV.base]: 'http://host/', [ENV.key]: undefined }, fetch: jsonFetch(captured, '  hi captain  ') },
    async () => {
      const p = makeProvider();
      const out = await p.complete({
        systemInstruction: 'SYS',
        contents: [{ role: 'user', text: 'q' }, { role: 'model', text: 'prior' }],
        opts: {},
      });
      assert.equal(out, 'hi captain');                       // trimmed
      assert.equal(captured.url, 'http://host/chat/completions'); // trailing slash trimmed
      assert.equal(captured.body.temperature, 0.2);
      assert.equal(captured.body.stream, false);
      assert.deepEqual(captured.body.messages, [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'prior' },            // model -> assistant
      ]);
      assert.equal(captured.headers.Authorization, undefined); // no api key -> no bearer
    });
});

test('complete: sends a bearer token when the api-key env is set', async () => {
  const captured = {};
  await withStub(
    { env: { [ENV.base]: 'http://host', [ENV.key]: 'sk-test' }, fetch: jsonFetch(captured, 'x') },
    async () => {
      await makeProvider().complete({ systemInstruction: 'S', contents: [], opts: {} });
      assert.equal(captured.headers.Authorization, 'Bearer sk-test');
    });
});

test('complete: honours opts.model over DEFAULT_MODEL', async () => {
  const captured = {};
  await withStub(
    { env: { [ENV.base]: 'http://host' }, fetch: jsonFetch(captured, 'x') },
    async () => {
      await makeProvider().complete({ systemInstruction: 'S', contents: [], opts: { model: 'override/m' } });
      assert.equal(captured.body.model, 'override/m');
    });
});

test('complete: throws when the base URL is not configured', async () => {
  await withStub({ env: { [ENV.base]: undefined } }, async () => {
    await assert.rejects(
      () => makeProvider().complete({ systemInstruction: 'S', contents: [], opts: {} }),
      new RegExp(`${ENV.base} is not configured`),
    );
  });
});

test('complete: a non-2xx response throws with status + body snippet', async () => {
  const fakeFetch = async () => ({ ok: false, status: 500, async text() { return 'kaboom'; } });
  await withStub({ env: { [ENV.base]: 'http://host' }, fetch: fakeFetch }, async () => {
    await assert.rejects(
      () => makeProvider().complete({ systemInstruction: 'S', contents: [], opts: {} }),
      /testoai endpoint 500: kaboom/,
    );
  });
});

test('completeStream: parses data: frames, skips keep-alives, stops at [DONE]', async () => {
  // Two content deltas split across reads, a keep-alive frame, then [DONE] plus
  // a trailing frame that must NOT be yielded (return happens on [DONE]).
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
    ': keep-alive\n',
    'data: {"choices":[{"delta":{}}]}\n',          // no content -> nothing yielded
    'data: [DONE]\n',
    'data: {"choices":[{"delta":{"content":"AFTER"}}]}\n',
  ];
  await withStub({ env: { [ENV.base]: 'http://host' }, fetch: sseFetch(chunks) }, async () => {
    const got = [];
    for await (const d of makeProvider().completeStream({ systemInstruction: 'S', contents: [], opts: {} })) {
      got.push(d);
    }
    assert.deepEqual(got, ['Hel', 'lo']);
  });
});

test('completeStream: buffers a frame split across two reads', async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"con',     // frame split mid-JSON / no newline yet
    'tent":"split"}}]}\n',
    'data: [DONE]\n',
  ];
  await withStub({ env: { [ENV.base]: 'http://host' }, fetch: sseFetch(chunks) }, async () => {
    const got = [];
    for await (const d of makeProvider().completeStream({ systemInstruction: 'S', contents: [], opts: {} })) {
      got.push(d);
    }
    assert.deepEqual(got, ['split']);
  });
});

test('completeStream: a non-2xx response throws with status + body snippet', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, body: null, async text() { return 'down'; } });
  await withStub({ env: { [ENV.base]: 'http://host' }, fetch: fakeFetch }, async () => {
    await assert.rejects(async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of makeProvider().completeStream({ systemInstruction: 'S', contents: [], opts: {} })) { /* drain */ }
    }, /testoai endpoint 503: down/);
  });
});
