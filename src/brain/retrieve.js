/* ============================================================================
 * Captain Adel — retrieve-then-read helper.
 *
 * Runs retrieval in code (rather than via model tool-calls) and packages the
 * hits into a numbered, cited context block plus the deduplicated `sources`
 * array the UI renders. Used by every provider that answers in read mode
 * (the Arabic models always; Gemini when strategy === 'read').
 *
 *   retrieve(question, { topK })       -> { context, sources }          (sync, BM25-only)
 *   retrieveSmart(question, { topK })  -> Promise<{ context, sources }>  (hybrid if configured)
 *
 * retrieve() is the long-standing BM25 path and is unchanged. retrieveSmart()
 * adds dense recall + reciprocal-rank fusion + optional cross-encoder rerank,
 * but ONLY when an embeddings endpoint and a prebuilt dense index are present
 * (embeddings.hybridAvailable()); otherwise it returns retrieve()'s result
 * verbatim, so the default deployment behaves exactly as before.
 * ==========================================================================*/

'use strict';

const bm25 = require('./bm25');
const { pushSource } = require('./grounding');
const embeddings = require('./embeddings');

// "Part 91 §91.155" / "part 61, 61.57" — a directly named Part + section.
const REF_RE = /\bpart\s+(\d+)\b[^0-9]{0,12}§?\s*(\d+\.\d+(?:\.\d+)?(?:\([^)]*\))?)/i;
const MAX_PASSAGE_CHARS = 1200;

/* Parent-child expansion: the top hits are widened from their 1200-char chunk
 * to the FULL section they belong to (the "parent"), so the model reads whole
 * rules instead of mid-sentence slices. Default on; ADEL_PARENT_CHILD=off
 * reverts to the historical chunk-only behaviour. Read at call time so evals
 * and tests can flip it without a module reload. */
const PARENT_EXPAND_TOP = 3;     // expand this many leading hits
const MAX_PARENT_CHARS = 4000;   // cap for an expanded section
function parentChildEnabled() {
  return String(process.env.ADEL_PARENT_CHILD || 'on').toLowerCase() !== 'off';
}

/* Package an ordered list of hits into the { context, sources } the model and
 * UI consume. Shared by both retrieval paths so their output shape is identical. */
function buildResult(hits) {
  const expand = parentChildEnabled();
  const sources = [];
  const seen = new Set();
  const blocks = [];
  let i = 1;
  for (const h of hits) {
    pushSource(sources, seen, h.citation, h.page_url, h.text, h.version);
    let text = String(h.text || '');
    if (expand && i <= PARENT_EXPAND_TOP) {
      // Top hits get their whole section (direct lookupCitation() hits arrive
      // already concatenated and carry no chunk_index — just lift their cap).
      if (Number.isInteger(h.chunk_index)) {
        const full = bm25.sectionTextAt(h.chunk_index);
        if (full.length > text.length) text = full;
      }
      text = text.slice(0, MAX_PARENT_CHARS);
    } else {
      text = text.slice(0, MAX_PASSAGE_CHARS);
    }
    blocks.push(`[${i}] ${h.citation || '(uncited passage)'}\n${text}`);
    i++;
  }
  const context = blocks.length
    ? blocks.join('\n\n')
    : '(no matching passages were found in the GACAR corpus)';
  return { context, sources };
}

/* The direct-citation fast path: when the question names a Part + section, the
 * exact section is the answer — no recall step (lexical or dense) beats it. */
function directCitationHit(question) {
  const m = REF_RE.exec(String(question || ''));
  if (!m) return null;
  const hit = bm25.lookupCitation(m[1], m[2]);
  return hit && hit.found ? hit : null;
}

function retrieve(question, { topK = 6 } = {}) {
  const hits = [];
  const direct = directCitationHit(question);
  if (direct) hits.push(direct);
  if (hits.length === 0) {
    for (const h of bm25.searchLibrary(question, topK)) hits.push(h);
  }
  return buildResult(hits);
}

/* ----------------------------------------------------------------------------
 * Hybrid recall (config-gated). BM25 + dense recall fused by RRF, then an
 * optional cross-encoder rerank. Falls back to retrieve() when not configured.
 * --------------------------------------------------------------------------*/

// Fuse a pool this many times larger than topK before dedup/rerank.
const POOL_FACTOR = 8;

async function denseRanking(question, pool, timings) {
  const dense = embeddings.denseIndex();
  if (!dense || !dense.length) return [];

  // Time query embedding
  const embedStart = Date.now();
  const [qVec] = await embeddings.embedder.embed([question]);
  if (timings) timings.embedMs = Date.now() - embedStart;
  if (!qVec) return [];

  // Time dense recall (cosine similarity)
  const recallStart = Date.now();
  const scored = [];
  for (let i = 0; i < dense.length; i++) {
    scored.push([i, embeddings.cosine(qVec, dense[i])]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  if (timings) timings.recallMs = Date.now() - recallStart;

  return scored.slice(0, pool).map((x) => x[0]);
}

/* Dedup fused chunk indices by (doc, section) and format the survivors. */
function dedupHits(orderedIndices, limit) {
  const out = [];
  const seen = new Set();
  for (const idx of orderedIndices) {
    const key = bm25.sectionKeyAt(idx);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const hit = bm25.formatHitAt(idx);
    if (hit) out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

async function maybeRerank(question, hits, topK, timings) {
  if (!embeddings.reranker.configured() || hits.length <= 1) return hits.slice(0, topK);
  const docs = hits.map((h) => String(h.text || '').slice(0, MAX_PASSAGE_CHARS));
  try {
    const rankStart = Date.now();
    const ranked = await embeddings.reranker.rerank(question, docs);
    if (timings) timings.rerankMs = Date.now() - rankStart;

    if (ranked && ranked.length) {
      return ranked
        .filter((r) => Number.isInteger(r.index) && hits[r.index])
        .map((r) => hits[r.index])
        .slice(0, topK);
    }
  } catch (err) {
    // Rerank is best-effort: on any endpoint error keep the fused order.
  }
  return hits.slice(0, topK);
}

async function retrieveSmart(question, { topK = 6, trackTimings = false } = {}) {
  const startTime = Date.now();
  const timings = trackTimings ? { queryLen: String(question || '').length } : null;

  if (!embeddings.hybridAvailable()) {
    const result = retrieve(question, { topK });
    if (timings) {
      timings.totalMs = Date.now() - startTime;
      timings.strategy = 'bm25-only';
      result.timings = timings;
    }
    return result;
  }

  // Direct Part+section citation still wins outright.
  const direct = directCitationHit(question);
  if (direct) {
    const result = buildResult([direct]);
    if (timings) {
      timings.totalMs = Date.now() - startTime;
      timings.strategy = 'direct-citation';
      result.timings = timings;
    }
    return result;
  }

  const pool = topK * POOL_FACTOR;
  let denseTop = [];
  try {
    denseTop = await denseRanking(question, pool, timings);
  } catch (err) {
    // Embedding the query failed — fall back to the proven BM25 path.
    const result = retrieve(question, { topK });
    if (timings) {
      timings.totalMs = Date.now() - startTime;
      timings.strategy = 'bm25-fallback';
      timings.error = String(err && err.message);
      result.timings = timings;
    }
    return result;
  }

  // Time BM25
  const bm25Start = Date.now();
  const bm25Top = bm25.searchChunkScores(question, pool).map((x) => x[0]);
  if (timings) timings.bm25Ms = Date.now() - bm25Start;

  // Time RRF fusion
  const rrfStart = Date.now();
  const fused = embeddings.rrf([bm25Top, denseTop]).map((x) => x[0]);
  if (timings) timings.rrfMs = Date.now() - rrfStart;

  // Time dedup
  const dedupStart = Date.now();
  const fusedHits = dedupHits(fused, Math.max(topK, topK * 3));
  if (timings) timings.dedupMs = Date.now() - dedupStart;

  const hits = await maybeRerank(question, fusedHits, topK, timings);
  const result = buildResult(hits);

  if (timings) {
    timings.totalMs = Date.now() - startTime;
    timings.strategy = 'hybrid-rrf';
    if (embeddings.reranker.configured()) timings.strategy += '+rerank';
    result.timings = timings;
  }

  return result;
}

module.exports = { retrieve, retrieveSmart };
