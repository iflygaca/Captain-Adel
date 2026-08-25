/* ============================================================================
 * Captain Adel — embeddings + rerank clients (config-gated, default OFF).
 *
 * The production retriever is BM25 (bm25.js) and stays the default. When an
 * embeddings endpoint AND a prebuilt dense index are configured, retrieve.js
 * additionally runs dense recall, fuses it with BM25 by reciprocal-rank-fusion,
 * and — when a reranker is configured — cross-encoder reranks the fused pool.
 * With neither configured, none of this loads and retrieval is byte-identical.
 *
 * Both clients speak the common self-hosted shapes (vLLM / TEI / Infinity):
 *   POST {EMBEDDINGS_BASE_URL}/embeddings  { model, input:[...] }
 *        -> { data:[{ embedding:[...] }] }
 *   POST {RERANK_BASE_URL}/rerank          { model, query, documents:[...] }
 *        -> { results:[{ index, relevance_score }] }
 *
 * Config (env):
 *   EMBEDDINGS_BASE_URL / EMBEDDINGS_MODEL (default BAAI/bge-m3) / EMBEDDINGS_API_KEY
 *   RERANK_BASE_URL     / RERANK_MODEL     (default BAAI/bge-reranker-v2-m3) / RERANK_API_KEY
 *
 * The dense index lives at src/brain/_embeddings.json.gz, aligned to the BM25
 * corpus by chunk index, and is built by scripts/build-embeddings.js.
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function trimUrl(v) {
  return String(v || '').replace(/\/+$/, '');
}

async function postJSON(url, body, { apiKey, timeoutMs = 60000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST', headers, signal: ctrl.signal, body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${url} ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

/* ----- embeddings client -------------------------------------------------- */

const EMBEDDINGS_MODEL = process.env.EMBEDDINGS_MODEL || 'BAAI/bge-m3';

const embedder = {
  MODEL: EMBEDDINGS_MODEL,
  configured() {
    // Phase 1+: EMBEDDINGS_QUERY_BASE_URL is for query embedding (in-Kingdom, PDPL-safe).
    // Falls back to EMBEDDINGS_BASE_URL for backward compat.
    return !!trimUrl(process.env.EMBEDDINGS_QUERY_BASE_URL || process.env.EMBEDDINGS_BASE_URL);
  },
  async embed(texts, opts = {}) {
    // Query embedding: use EMBEDDINGS_QUERY_BASE_URL (in-Kingdom) if available,
    // otherwise fall back to EMBEDDINGS_BASE_URL (may be HF Inference Endpoints, etc.)
    const base = trimUrl(process.env.EMBEDDINGS_QUERY_BASE_URL || process.env.EMBEDDINGS_BASE_URL);
    if (!base) throw new Error('EMBEDDINGS_QUERY_BASE_URL or EMBEDDINGS_BASE_URL is not configured');
    const data = await postJSON(`${base}/embeddings`, {
      model: opts.model || EMBEDDINGS_MODEL,
      input: Array.isArray(texts) ? texts : [texts],
    }, { apiKey: process.env.EMBEDDINGS_API_KEY, timeoutMs: opts.timeoutMs });
    return (data && data.data ? data.data : []).map((d) => d.embedding);
  },
};

/* ----- reranker client ---------------------------------------------------- */

const RERANK_MODEL = process.env.RERANK_MODEL || 'BAAI/bge-reranker-v2-m3';

const reranker = {
  MODEL: RERANK_MODEL,
  configured() { return !!trimUrl(process.env.RERANK_BASE_URL); },
  /** -> [{ index, score }] in the endpoint's order (highest relevance first). */
  async rerank(query, documents, opts = {}) {
    const base = trimUrl(process.env.RERANK_BASE_URL);
    if (!base) throw new Error('RERANK_BASE_URL is not configured');
    const data = await postJSON(`${base}/rerank`, {
      model: opts.model || RERANK_MODEL,
      query,
      documents,
    }, { apiKey: process.env.RERANK_API_KEY, timeoutMs: opts.timeoutMs });
    return (data && data.results ? data.results : [])
      .map((r) => ({ index: r.index, score: r.relevance_score }));
  },
};

/* ----- prebuilt dense index ---------------------------------------------- */

const DENSE_PATH = path.join(__dirname, '_embeddings.json.gz');
const BINARY_INDEX_PATH = path.join(__dirname, '_embeddings.bin');
let _dense; // undefined = not tried; null = absent/failed; array = loaded

/** Load binary index with header parsing and MRL support. */
function loadBinaryIndex(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    if (buf.length < 16) {
      console.warn(`Binary index too small: ${buf.length} bytes`);
      return null;
    }

    // Parse header
    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    const numVectors = buf.readUInt32LE(8);
    const dims = buf.readUInt32LE(12);

    if (magic !== 0xADEF0001 || version !== 1) {
      console.warn(`Invalid binary index magic=${magic.toString(16)} version=${version}`);
      return null;
    }

    const vectors = [];
    let offset = 16;
    const byteSize = 4;  // Assume float32 for now

    for (let i = 0; i < numVectors; i++) {
      const vec = new Float32Array(dims);
      for (let j = 0; j < dims; j++) {
        vec[j] = buf.readFloatLE(offset);
        offset += byteSize;
      }
      vectors.push(vec);
    }

    return vectors;
  } catch (err) {
    console.warn(`Failed to load binary index: ${err.message}`);
    return null;
  }
}

/** Float-vector array aligned to the BM25 corpus by chunk index, or null. */
function denseIndex() {
  if (_dense !== undefined) return _dense;
  try {
    // Try binary format first (Phase 1+)
    if (fs.existsSync(BINARY_INDEX_PATH)) {
      const loaded = loadBinaryIndex(BINARY_INDEX_PATH);
      if (loaded) {
        _dense = loaded;
        return _dense;
      }
    }

    // Fall back to JSON format (legacy)
    if (!fs.existsSync(DENSE_PATH)) { _dense = null; return _dense; }
    const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(DENSE_PATH)));
    const vectors = Array.isArray(raw) ? raw : (raw.vectors || null);
    // Hold the vectors as Float32Array, not parsed-JSON number arrays: at
    // 47k chunks × 1024 dims (BGE-M3) that halves resident memory to ~190 MB
    // and speeds up cosine(). Size hybrid deployments at ≥1 GiB (deploy.sh).
    _dense = vectors ? vectors.map((v) => Float32Array.from(v)) : null;
  } catch (err) {
    _dense = null;
  }
  return _dense;
}

/** Hybrid is live only when the endpoint AND a prebuilt dense index both exist. */
function hybridAvailable() {
  return embedder.configured() && !!denseIndex();
}

/* ----- pure math used by the fusion step (unit-tested) ------------------- */

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Reciprocal-rank fusion of several ordered id-lists -> [[id, score], ...]. */
function rrf(rankings, k = 60) {
  const scores = new Map();
  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank];
      scores.set(id, (scores.get(id) || 0) + 1 / (k + rank + 1));
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]);
}

module.exports = {
  embedder,
  reranker,
  denseIndex,
  hybridAvailable,
  cosine,
  rrf,
  DENSE_PATH,
  BINARY_INDEX_PATH,
  loadBinaryIndex,
};
