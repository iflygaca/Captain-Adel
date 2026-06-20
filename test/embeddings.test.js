/* Unit tests — src/brain/embeddings.js network clients.
 *
 * The pure fusion math (cosine / rrf) is already covered by retrieve.test.js.
 * This suite exercises the embeddings + rerank HTTP clients and their config
 * gating by stubbing the Node global fetch (assign-and-restore), plus the
 * not-configured guards. No network, no API key. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const emb = require('../src/brain/embeddings');

/* Run fn() with process.env overlaid + global.fetch replaced, then restore. */
async function withStub({ env = {}, fetch: fakeFetch }, fn) {
  const realFetch = global.fetch;
  const prev = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (fakeFetch) global.fetch = fakeFetch;
  try {
    return await fn();
  } finally {
    global.fetch = realFetch;
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('embedder.configured: false without EMBEDDINGS_BASE_URL, true with it', async () => {
  await withStub({ env: { EMBEDDINGS_BASE_URL: undefined } }, () => {
    assert.equal(emb.embedder.configured(), false);
  });
  await withStub({ env: { EMBEDDINGS_BASE_URL: 'http://localhost:8000' } }, () => {
    assert.equal(emb.embedder.configured(), true);
  });
});

test('embedder.embed: posts to /embeddings (trailing slash trimmed) and maps data[].embedding', async () => {
  let seenUrl; let seenBody; let seenAuth;
  const fakeFetch = async (url, opts) => {
    seenUrl = url; seenBody = JSON.parse(opts.body);
    seenAuth = opts.headers.Authorization;
    return { ok: true, async json() { return { data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }; } };
  };
  const out = await withStub(
    { env: { EMBEDDINGS_BASE_URL: 'http://host:8000/', EMBEDDINGS_API_KEY: 'sk-emb' }, fetch: fakeFetch },
    () => emb.embedder.embed(['a', 'b']),
  );
  assert.equal(seenUrl, 'http://host:8000/embeddings');     // trailing slash trimmed
  assert.deepEqual(seenBody.input, ['a', 'b']);
  assert.equal(seenAuth, 'Bearer sk-emb');                  // API key -> bearer header
  assert.deepEqual(out, [[0.1, 0.2], [0.3, 0.4]]);
});

test('embedder.embed: a single string is wrapped into a one-element input array', async () => {
  let seenBody;
  const fakeFetch = async (_url, opts) => {
    seenBody = JSON.parse(opts.body);
    return { ok: true, async json() { return { data: [{ embedding: [1] }] }; } };
  };
  await withStub({ env: { EMBEDDINGS_BASE_URL: 'http://host', EMBEDDINGS_API_KEY: undefined }, fetch: fakeFetch },
    () => emb.embedder.embed('solo'));
  assert.deepEqual(seenBody.input, ['solo']);
});

test('embedder.embed: throws when EMBEDDINGS_BASE_URL is unset', async () => {
  await withStub({ env: { EMBEDDINGS_BASE_URL: undefined } }, async () => {
    await assert.rejects(() => emb.embedder.embed(['x']), /EMBEDDINGS_BASE_URL is not configured/);
  });
});

test('embedder.embed: non-2xx response throws with status + body snippet', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, async text() { return 'upstream down'; } });
  await withStub({ env: { EMBEDDINGS_BASE_URL: 'http://host', EMBEDDINGS_API_KEY: undefined }, fetch: fakeFetch },
    async () => {
      await assert.rejects(() => emb.embedder.embed(['x']), /503: upstream down/);
    });
});

test('embedder.embed: aborts on timeout (AbortController fires)', async () => {
  // fetch that only settles when the abort signal fires -> the 1ms timer wins.
  const fakeFetch = (_url, opts) => new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  await withStub({ env: { EMBEDDINGS_BASE_URL: 'http://host', EMBEDDINGS_API_KEY: undefined }, fetch: fakeFetch },
    async () => {
      await assert.rejects(() => emb.embedder.embed(['x'], { timeoutMs: 1 }), /aborted/);
    });
});

test('reranker.rerank: posts query + documents and maps relevance_score -> score', async () => {
  let seenUrl; let seenBody;
  const fakeFetch = async (url, opts) => {
    seenUrl = url; seenBody = JSON.parse(opts.body);
    return { ok: true, async json() { return { results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.2 }] }; } };
  };
  const out = await withStub(
    { env: { RERANK_BASE_URL: 'http://rr:8001/', RERANK_API_KEY: undefined }, fetch: fakeFetch },
    () => emb.reranker.rerank('q', ['doc0', 'doc1']),
  );
  assert.equal(seenUrl, 'http://rr:8001/rerank');
  assert.equal(seenBody.query, 'q');
  assert.deepEqual(seenBody.documents, ['doc0', 'doc1']);
  assert.deepEqual(out, [{ index: 1, score: 0.9 }, { index: 0, score: 0.2 }]);
});

test('reranker.configured / throws when RERANK_BASE_URL is unset', async () => {
  await withStub({ env: { RERANK_BASE_URL: undefined } }, async () => {
    assert.equal(emb.reranker.configured(), false);
    await assert.rejects(() => emb.reranker.rerank('q', ['d']), /RERANK_BASE_URL is not configured/);
  });
});

test('hybridAvailable: false when no embeddings endpoint is configured', async () => {
  await withStub({ env: { EMBEDDINGS_BASE_URL: undefined } }, () => {
    assert.equal(emb.hybridAvailable(), false);
  });
});
