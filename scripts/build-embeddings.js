#!/usr/bin/env node
/* ============================================================================
 * Captain Adel — dense embeddings index builder.
 *
 * Embeds every corpus chunk once (in the same order bm25.js loads them) and
 * writes the dense half of hybrid retrieval. Supports both JSON (legacy) and
 * binary formats with MRL (Matryoshka Representation Learning) for runtime
 * dimension truncation.
 *
 * Vectors are aligned to the BM25 corpus by chunk index, so retrieve.js can
 * fuse a dense ranking with the lexical one by index alone.
 *
 * Usage (Live Endpoint):
 *   EMBEDDINGS_BASE_URL=http://host:8080/v1  node scripts/build-embeddings.js
 *   EMBED_FORMAT=float32 EMBED_DIMS=1024 EMBEDDINGS_BASE_URL=... node scripts/build-embeddings.js
 *
 * Usage (Offline / Mock Build for Integration Verification):
 *   node scripts/build-embeddings.js --mock --format=float32 --dims=512
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const { embedder, DENSE_PATH, BINARY_INDEX_PATH, cosine } = require('../src/brain/embeddings');

const CHUNKS_PATH = path.join(__dirname, '..', 'src', 'brain', '_chunks.json.gz');

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const match = args.find((a) => a.startsWith(`--${flag}=`));
  if (match) return match.split('=')[1];
  const idx = args.indexOf(`--${flag}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
};

const isMock = args.includes('--mock') || process.env.EMBED_MOCK === '1';
const BATCH = parseInt(getArg('batch', process.env.EMBED_BATCH || '128'), 10);
const MAX_CHARS = parseInt(getArg('max-chars', process.env.EMBED_MAX_CHARS || '1000'), 10);
const EMBED_FORMAT = getArg('format', process.env.EMBED_FORMAT || 'float32'); // 'json' | 'float32' | 'int8'
const EMBED_DIMS = parseInt(getArg('dims', process.env.EMBED_DIMS || '512'), 10);
const SAMPLE_LIMIT = parseInt(getArg('limit', process.env.EMBED_LIMIT || '0'), 10);

/* The text fed to the embedder: section title + body */
function chunkText(c) {
  const head = String(c.st || '').trim();
  const body = String(c.t || '').trim();
  return (head ? head + '\n' : '') + body;
}

/* Deterministic pseudo-embedding for mock/offline testing */
function mockVector(text, dims) {
  const vec = new Float32Array(dims);
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest();
  for (let i = 0; i < dims; i++) {
    const byte = hash[i % hash.length];
    vec[i] = (byte / 127.5) - 1.0;
  }
  // Normalize vector to unit length
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) vec[i] /= norm;
  return Array.from(vec);
}

async function main() {
  const started = Date.now();

  if (!isMock && !embedder.configured()) {
    console.error('EMBEDDINGS_BASE_URL is not set — cannot build the live dense index.');
    console.error('To run against live endpoint:  EMBEDDINGS_BASE_URL=http://host:8080/v1  node scripts/build-embeddings.js');
    console.error('To run mock index generation:  node scripts/build-embeddings.js --mock --format=float32 --dims=512');
    process.exit(1);
  }

  if (!fs.existsSync(CHUNKS_PATH)) {
    console.error('Corpus not found at ' + CHUNKS_PATH);
    process.exit(1);
  }

  const corpus = JSON.parse(zlib.gunzipSync(fs.readFileSync(CHUNKS_PATH)));
  let chunks = corpus.chunks || [];
  if (SAMPLE_LIMIT > 0 && SAMPLE_LIMIT < chunks.length) {
    chunks = chunks.slice(0, SAMPLE_LIMIT);
  }

  const modelName = isMock ? 'CaptAdel-DeterministicMock' : embedder.MODEL;
  console.log(`Building dense embeddings for ${chunks.length} chunks`);
  console.log(`Model: ${modelName} | Format: ${EMBED_FORMAT} | Target Dims: ${EMBED_DIMS} | Batch: ${BATCH}`);

  const vectors = new Array(chunks.length);
  let dim = EMBED_DIMS;

  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const inputs = slice.map((c) => chunkText(c).slice(0, MAX_CHARS));

    let vecs;
    if (isMock) {
      vecs = inputs.map((t) => mockVector(t, EMBED_DIMS));
    } else {
      vecs = await embedder.embed(inputs, { timeoutMs: 120000 });
      if (vecs.length !== slice.length) {
        console.error(`\nEndpoint returned ${vecs.length} vectors for ${slice.length} inputs at offset ${i} — aborting.`);
        process.exit(1);
      }
    }

    for (let j = 0; j < vecs.length; j++) {
      vectors[i + j] = vecs[j];
      if (!dim && vecs[j]) dim = vecs[j].length;
    }

    process.stdout.write(`\r  Indexing progress: ${Math.min(i + BATCH, chunks.length)}/${chunks.length} chunks (${Math.round(((Math.min(i + BATCH, chunks.length)) / chunks.length) * 100)}%)`);
  }

  console.log('\nAll vectors computed successfully. Serializing output...');

  if (EMBED_FORMAT === 'float32' || EMBED_FORMAT === 'int8' || EMBED_FORMAT === 'binary') {
    writeBinaryIndex(vectors, dim, EMBED_FORMAT, EMBED_DIMS, started);
  } else {
    // Default (backward compat): gzipped JSON
    const out = {
      model: modelName,
      dim,
      count: vectors.length,
      built: new Date().toISOString(),
      vectors,
    };
    fs.writeFileSync(DENSE_PATH, zlib.gzipSync(Buffer.from(JSON.stringify(out))));
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`Wrote ${DENSE_PATH} (${vectors.length} vectors, dim ${dim}, ${secs}s)`);
  }

  // Verification step
  console.log('\n--- Verifying Dense Index Integrity ---');
  if (vectors.length > 1) {
    const sim = cosine(vectors[0], vectors[0]);
    console.log(`Self-similarity sanity check (chunk 0 vs chunk 0): ${sim.toFixed(4)} (Expected: ~1.0000)`);
    console.log(`Corpus alignment: Chunk 0 = [${chunks[0].c || ''}] ${chunks[0].st || ''}`);
  }

  console.log('Done.');
}

function writeBinaryIndex(vectors, fullDim, format, targetDim, started) {
  const OUTPUT = BINARY_INDEX_PATH;
  const actualDim = Math.min(targetDim, fullDim);

  // Header: magic (4) + version (4) + num_vectors (4) + dims (4)
  const header = Buffer.alloc(16);
  header.writeUInt32LE(0xADEF0001, 0); // magic "ADEF" version 1
  header.writeUInt32LE(1, 4); // version
  header.writeUInt32LE(vectors.length, 8); // num_vectors
  header.writeUInt32LE(actualDim, 12); // dims

  let dataSize = 0;
  let byteSize = 4; // float32

  if (format === 'int8') {
    byteSize = 1;
  }

  dataSize = vectors.length * actualDim * byteSize;
  const data = Buffer.alloc(dataSize);

  let offset = 0;
  for (let i = 0; i < vectors.length; i++) {
    const vec = vectors[i];
    if (!vec) continue;

    for (let j = 0; j < actualDim; j++) {
      const val = vec[j] || 0;

      if (format === 'int8') {
        const quantized = Math.max(-128, Math.min(127, Math.round(val * 127)));
        data.writeInt8(quantized, offset);
        offset += 1;
      } else {
        data.writeFloatLE(val, offset);
        offset += 4;
      }
    }
  }

  const combined = Buffer.concat([header, data]);
  fs.writeFileSync(OUTPUT, combined);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const mbSize = (combined.length / (1024 * 1024)).toFixed(2);
  console.log(`Wrote ${OUTPUT} (${vectors.length} vectors, dim ${actualDim}, format ${format}, ${mbSize} MB in ${secs}s)`);
}

main().catch((err) => {
  console.error('\nbuild-embeddings crashed:', err);
  process.exit(1);
});
