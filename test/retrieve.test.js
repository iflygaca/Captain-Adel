/* Unit tests — captadel/src/brain/retrieve.js + the hybrid/expansion helpers.
 *
 * Runs against the real bundled corpus (_chunks.json.gz — no network, no API
 * key). Covers: retrieveSmart() falling back to the plain BM25 path when no
 * embeddings endpoint is configured, parent-child section expansion, and the
 * pure fusion math in embeddings.js. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const bm25 = require('../src/brain/bm25');
const { retrieve, retrieveSmart } = require('../src/brain/retrieve');
const embeddings = require('../src/brain/embeddings');

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') return out.finally(restore);
    restore();
    return out;
  } catch (err) {
    restore();
    throw err;
  }
}

test('retrieveSmart: without an embeddings endpoint it equals retrieve()', async () => {
  await withEnv({ EMBEDDINGS_BASE_URL: undefined }, async () => {
    assert.equal(embeddings.hybridAvailable(), false);
    const q = 'VFR weather minimums controlled airspace';
    const plain = retrieve(q, { topK: 4 });
    const smart = await retrieveSmart(q, { topK: 4 });
    assert.deepEqual(smart, plain);
  });
});

test('retrieve: returns context and well-shaped sources', () => {
  const { context, sources } = retrieve('medical certificate requirements', { topK: 3 });
  assert.equal(typeof context, 'string');
  assert.ok(context.includes('[1]'), 'context blocks are numbered');
  assert.ok(Array.isArray(sources) && sources.length >= 1);
  for (const s of sources) {
    assert.ok('citation' in s && 'url' in s);
  }
});

test('parent-child: top hits carry full-section text, beyond the old 1200-char cap', () => {
  // §91.155 (basic VFR weather minimums) is a long multi-chunk section; with
  // expansion on, the leading block must be allowed past MAX_PASSAGE_CHARS.
  const hits = bm25.searchLibrary('basic VFR weather minimums visibility cloud clearance', 3);
  assert.ok(hits.length >= 1);
  const idx = hits[0].chunk_index;
  assert.ok(Number.isInteger(idx), 'searchLibrary hits expose chunk_index');
  const full = bm25.sectionTextAt(idx);
  assert.ok(full.length >= hits[0].text.length, 'section text contains at least its own chunk');

  const on = withEnvSyncResult('on');
  const off = withEnvSyncResult('off');
  // With expansion off every block is capped at 1200 chars; with it on the top
  // blocks may run longer (up to 4000) whenever the section is longer.
  assert.ok(maxBlockLen(off.context) <= 1200 + 80, 'off => chunk-only blocks');
  assert.ok(maxBlockLen(on.context) >= maxBlockLen(off.context), 'on => never shorter');

  function withEnvSyncResult(mode) {
    let out;
    const prev = process.env.ADEL_PARENT_CHILD;
    process.env.ADEL_PARENT_CHILD = mode;
    try {
      out = retrieve('basic VFR weather minimums visibility cloud clearance', { topK: 3 });
    } finally {
      if (prev === undefined) delete process.env.ADEL_PARENT_CHILD;
      else process.env.ADEL_PARENT_CHILD = prev;
    }
    return out;
  }
  function maxBlockLen(context) {
    return Math.max(...context.split(/\n\n(?=\[\d+\])/).map((b) => b.length));
  }
});

test('parent-child: expanded blocks never exceed the 4000-char parent cap', () => {
  const prev = process.env.ADEL_PARENT_CHILD;
  delete process.env.ADEL_PARENT_CHILD;   // default = on
  try {
    const { context } = retrieve('pilot in command responsibilities and authority', { topK: 4 });
    for (const block of context.split(/\n\n(?=\[\d+\])/)) {
      // block = "[n] citation\n" + text; allow slack for the header line.
      assert.ok(block.length <= 4000 + 200, `block too long: ${block.length}`);
    }
  } finally {
    if (prev !== undefined) process.env.ADEL_PARENT_CHILD = prev;
  }
});

test('sectionTextAt: out-of-range index returns the empty string', () => {
  assert.equal(bm25.sectionTextAt(99999999), '');
  assert.equal(bm25.sectionTextAt(-1), '');
});

/* ---- direct-citation fast path -------------------------------------------*/

test('retrieve: a question naming a tagged Part+section takes the exact-lookup fast path', () => {
  const { context, sources } = retrieve('What does Part 61, §61.57 require for recent experience?', { topK: 5 });
  assert.equal(sources.length, 1, 'the exact section is the whole result');
  assert.equal(sources[0].part, '61');
  assert.equal(sources[0].section, '61.57');
  assert.ok(context.startsWith('[1] GACAR Part 61, §61.57'));
  assert.ok(!context.includes('[2]'), 'no BM25 recall ran');
});

test('retrieve: a named section the corpus has no tag for falls back to BM25 recall', () => {
  // §91.155 exists in the corpus text but carries no `gr` section tag, so the
  // exact lookup misses and the lexical path must still answer.
  const { sources } = retrieve('What does Part 91, §91.155 say about VFR minimums?', { topK: 4 });
  assert.ok(sources.length >= 1, 'BM25 recall still returns passages');
});

test('retrieveSmart: the direct citation wins outright even when hybrid is live', async () => {
  const saved = { hybridAvailable: embeddings.hybridAvailable };
  embeddings.hybridAvailable = () => true;   // no dense call happens on this path
  try {
    const { sources } = await retrieveSmart('Explain Part 61 §61.57 currency.', { topK: 5 });
    assert.equal(sources.length, 1);
    assert.equal(sources[0].section, '61.57');
  } finally {
    Object.assign(embeddings, saved);
  }
});

/* ---- hybrid recall (dense fusion + rerank), embeddings stubbed ------------*/

/* Overlay embeddings-module members (assign-and-restore) so retrieveSmart's
 * hybrid branch runs with a fake dense index and no network. */
async function withHybrid(overrides, fn) {
  const saved = {
    hybridAvailable: embeddings.hybridAvailable,
    denseIndex: embeddings.denseIndex,
    embed: embeddings.embedder.embed,
    rerankConfigured: embeddings.reranker.configured,
    rerank: embeddings.reranker.rerank,
  };
  embeddings.hybridAvailable = () => true;
  if (overrides.denseIndex) embeddings.denseIndex = overrides.denseIndex;
  if (overrides.embed) embeddings.embedder.embed = overrides.embed;
  embeddings.reranker.configured = overrides.rerankConfigured || (() => false);
  if (overrides.rerank) embeddings.reranker.rerank = overrides.rerank;
  try { return await fn(); } finally {
    embeddings.hybridAvailable = saved.hybridAvailable;
    embeddings.denseIndex = saved.denseIndex;
    embeddings.embedder.embed = saved.embed;
    embeddings.reranker.configured = saved.rerankConfigured;
    embeddings.reranker.rerank = saved.rerank;
  }
}

/* A tiny dense index aligned to the real corpus: zeros everywhere except the
 * given chunk indices, which match the query vector [1, 0] exactly. */
function denseIndexFavouring(indices) {
  const vectors = new Array(bm25.chunkCount()).fill(null).map(() => Float32Array.from([0, 0]));
  for (const i of indices) vectors[i] = Float32Array.from([1, 0]);
  return () => vectors;
}

const QUERY = 'basic VFR weather minimums visibility';

test('retrieveSmart: hybrid fuses BM25 with dense recall and dedups by section', async () => {
  // Make dense "discover" the corpus chunk right after BM25's own top hit — a
  // valid index that formats into a real, distinct section.
  const bmTop = bm25.searchChunkScores(QUERY, 8).map((x) => x[0]);
  await withHybrid({
    denseIndex: denseIndexFavouring([bmTop[1]]),
    embed: async () => [[1, 0]],
  }, async () => {
    const { sources, context } = await retrieveSmart(QUERY, { topK: 4 });
    assert.ok(sources.length >= 2, 'fusion produced a multi-source result');
    assert.ok(context.includes('[1]') && context.includes('[2]'));
    const keys = sources.map((s) => s.citation);
    assert.equal(new Set(keys).size, keys.length, 'sections are deduplicated');
  });
});

test('retrieveSmart: a failing query embedding falls back to the plain BM25 path', async () => {
  await withHybrid({
    denseIndex: denseIndexFavouring([]),
    embed: async () => { throw new Error('embeddings endpoint down'); },
  }, async () => {
    const smart = await retrieveSmart(QUERY, { topK: 4 });
    assert.deepEqual(smart, retrieve(QUERY, { topK: 4 }), 'identical to the proven path');
  });
});

test('retrieveSmart: a configured reranker reorders the fused pool down to topK', async () => {
  let rerankedDocs = null;
  await withHybrid({
    denseIndex: denseIndexFavouring([]),
    embed: async () => [[1, 0]],
    rerankConfigured: () => true,
    rerank: async (_q, docs) => {
      rerankedDocs = docs;
      // Reverse the fused order, plus a malformed index that must be dropped.
      return docs.map((_, i) => ({ index: docs.length - 1 - i, score: 1 - i / 10 }))
        .concat([{ index: 999, score: 0.01 }]);
    },
  }, async () => {
    const { sources } = await retrieveSmart(QUERY, { topK: 3 });
    assert.ok(Array.isArray(rerankedDocs) && rerankedDocs.length >= 3, 'the pool reached the reranker');
    assert.ok(sources.length <= 3, 'reranker output is cut to topK');
    const plain = await withoutRerank();
    assert.notDeepEqual(sources.map((s) => s.citation), plain.map((s) => s.citation),
      'the rerank order differs from the fused order');
  });

  async function withoutRerank() {
    return withHybrid({
      denseIndex: denseIndexFavouring([]),
      embed: async () => [[1, 0]],
    }, async () => (await retrieveSmart(QUERY, { topK: 3 })).sources);
  }
});

test('retrieveSmart: a throwing reranker keeps the fused order (best-effort)', async () => {
  const run = (rerank) => withHybrid({
    denseIndex: denseIndexFavouring([]),
    embed: async () => [[1, 0]],
    ...(rerank ? { rerankConfigured: () => true, rerank } : {}),
  }, async () => (await retrieveSmart(QUERY, { topK: 3 })).sources);

  const fused = await run(null);
  const withError = await run(async () => { throw new Error('rerank endpoint down'); });
  assert.deepEqual(withError.map((s) => s.citation), fused.map((s) => s.citation));
});

test('rrf: fuses rankings, shared ids score highest', () => {
  const fused = embeddings.rrf([[1, 2, 3], [3, 1, 9]]);
  assert.ok(Array.isArray(fused));
  const ids = fused.map((x) => x[0]);
  // id 1 appears at rank 0 and rank 1; id 3 at rank 2 and rank 0 — both must
  // outrank ids that appear in only one list at a deep position.
  assert.ok(ids.indexOf(1) < ids.indexOf(2));
  assert.ok(ids.indexOf(3) < ids.indexOf(9));
});

test('cosine: orthogonal -> 0, identical -> 1, mixed array types ok', () => {
  assert.equal(embeddings.cosine([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(embeddings.cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  // denseIndex() holds Float32Array vectors; query vectors are plain arrays.
  assert.ok(Math.abs(embeddings.cosine([1, 0], Float32Array.from([1, 0])) - 1) < 1e-9);
  assert.equal(embeddings.cosine(null, [1]), 0);
  assert.equal(embeddings.cosine([1], [1, 2]), 0);
});
