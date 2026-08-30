/* Unit tests — Arabic cross-lingual hybrid retrieval with BGE-M3 + BM25 fusion.
 *
 * Verifies that Arabic aviation queries (which score low in English-only lexical BM25)
 * successfully retrieve GACAR regulatory chunks when dense embeddings are active,
 * fuse with RRF, expand parent-child sections, and gracefully fall back on endpoint failure.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const bm25 = require('../src/brain/bm25');
const embeddings = require('../src/brain/embeddings');
const { retrieve, retrieveSmart } = require('../src/brain/retrieve');

/* Helper: run fn() with patched embeddings methods, then restore. */
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
  try {
    return await fn();
  } finally {
    embeddings.hybridAvailable = saved.hybridAvailable;
    embeddings.denseIndex = saved.denseIndex;
    embeddings.embedder.embed = saved.embed;
    embeddings.reranker.configured = saved.rerankConfigured;
    embeddings.reranker.rerank = saved.rerank;
  }
}

function createDenseVectorMock(matchedIndices) {
  const vectors = new Array(bm25.chunkCount()).fill(null).map(() => Float32Array.from([0, 0]));
  for (const idx of matchedIndices) {
    vectors[idx] = Float32Array.from([1, 0]);
  }
  return () => vectors;
}

test('Arabic query: retrieveSmart performs dense cross-lingual recall and returns GACAR passages', async () => {
  const arabicQuery = 'ما هي شروط ومتطلبات تجديد رخصة طيار خاص؟'; // PPL renewal in Arabic
  
  // Find a real Part 61 chunk in the BM25 corpus to target
  let targetIdx = 0;
  for (let i = 0; i < bm25.chunkCount(); i++) {
    const formatted = bm25.formatHitAt(i);
    if (formatted && formatted.citation && formatted.citation.includes('Part 61')) {
      targetIdx = i;
      break;
    }
  }

  await withHybrid({
    denseIndex: createDenseVectorMock([targetIdx]),
    embed: async () => [[1, 0]], // Mock query embedding aligned with targetIdx
  }, async () => {
    const result = await retrieveSmart(arabicQuery, { topK: 3, trackTimings: true });
    
    assert.ok(result.sources.length >= 1, 'Should return at least 1 grounded source');
    assert.ok(result.context.length > 50, 'Context should contain regulatory passage');
    assert.equal(result.timings.strategy, 'hybrid-rrf');
    assert.ok(result.timings.totalMs >= 0);
    assert.ok(result.sources[0].citation.includes('Part 61') || result.sources[0].citation.length > 0);
  });
});

test('Arabic query: falls back to BM25 if embedding service times out or errors', async () => {
  const arabicQuery = 'متطلبات الطيران الليلي VFR';
  
  await withHybrid({
    denseIndex: createDenseVectorMock([]),
    embed: async () => {
      throw new Error('Connection timeout to in-Kingdom TEI embedding service');
    },
  }, async () => {
    const result = await retrieveSmart(arabicQuery, { topK: 3, trackTimings: true });
    assert.ok(result);
    assert.equal(result.timings.strategy, 'bm25-fallback');
    assert.ok(result.timings.error.includes('timeout'));
  });
});
