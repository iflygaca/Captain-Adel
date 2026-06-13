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
