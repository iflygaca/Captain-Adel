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
 * This is a one-off / on-corpus-change step, run manually against an embeddings
 * endpoint — never at request time and never in CI. Without the file (and an
 * EMBEDDINGS_BASE_URL at runtime) retrieval stays pure BM25.
 *
 * Usage (JSON, legacy):
 *   EMBEDDINGS_BASE_URL=http://host:8080/v1  node scripts/build-embeddings.js
 *
 * Usage (binary, modern):
 *   EMBED_FORMAT=float32 EMBED_DIMS=1024 EMBEDDINGS_BASE_URL=...  node scripts/build-embeddings.js
 *   EMBED_FORMAT=float32 EMBED_DIMS=512 EMBEDDINGS_BASE_URL=...   (via MRL truncation)
 *   EMBED_FORMAT=int8 EMBED_DIMS=256 EMBEDDINGS_BASE_URL=...      (quantized)
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { embedder, DENSE_PATH, BINARY_INDEX_PATH } = require('../src/brain/embeddings');

const CHUNKS_PATH = path.join(__dirname, '..', 'src', 'brain', '_chunks.json.gz');
const BATCH = parseInt(process.env.EMBED_BATCH, 10) || 64;
const MAX_CHARS = parseInt(process.env.EMBED_MAX_CHARS, 10) || 1000;
const EMBED_FORMAT = process.env.EMBED_FORMAT || 'json';  // 'json' | 'float32' | 'int8'
const EMBED_DIMS = parseInt(process.env.EMBED_DIMS || '1024', 10);

/* The text fed to the embedder: section title + body, mirroring what a reader
 * would match against. Kept compact so long chunks don't blow the model's window. */
function chunkText(c) {
  const head = String(c.st || '').trim();
  const body = String(c.t || '').trim();
  return (head ? head + '\n' : '') + body;
}

async function main() {
  const started = Date.now();

  if (!embedder.configured()) {
    console.error('EMBEDDINGS_BASE_URL is not set — cannot build the dense index.');
    console.error('Run:  EMBEDDINGS_BASE_URL=http://host:8080/v1  node scripts/build-embeddings.js');
    process.exit(1);
  }
  if (!fs.existsSync(CHUNKS_PATH)) {
    console.error('Corpus not found at ' + CHUNKS_PATH);
    process.exit(1);
  }

  const corpus = JSON.parse(zlib.gunzipSync(fs.readFileSync(CHUNKS_PATH)));
  const chunks = corpus.chunks || [];
  console.log('Embedding ' + chunks.length + ' chunks with ' + embedder.MODEL
    + ' (batch=' + BATCH + ', format=' + EMBED_FORMAT + ', dims=' + EMBED_DIMS + ')...');

  const vectors = new Array(chunks.length);
  let dim = 0;

  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const inputs = slice.map((c) => chunkText(c).slice(0, MAX_CHARS));
    const vecs = await embedder.embed(inputs, { timeoutMs: 120000 });
    if (vecs.length !== slice.length) {
      console.error('\nEndpoint returned ' + vecs.length + ' vectors for '
        + slice.length + ' inputs at offset ' + i + ' — aborting.');
      process.exit(1);
    }
    for (let j = 0; j < vecs.length; j++) {
      vectors[i + j] = vecs[j];
      if (!dim && vecs[j]) dim = vecs[j].length;
    }
    process.stdout.write('\r  ' + Math.min(i + BATCH, chunks.length) + '/' + chunks.length);
  }

  const out = {
    model: embedder.MODEL,
    dim,
    count: vectors.length,
    built: new Date().toISOString(),
    vectors,
  };

  // Write in the requested format
  if (EMBED_FORMAT === 'float32' || EMBED_FORMAT === 'int8' || EMBED_FORMAT === 'binary') {
    writeBinaryIndex(vectors, dim, EMBED_FORMAT, EMBED_DIMS, started);
  } else {
    // Default (backward compat): gzipped JSON
    fs.writeFileSync(DENSE_PATH, zlib.gzipSync(Buffer.from(JSON.stringify(out))));
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log('\nWrote ' + DENSE_PATH + '  (' + vectors.length + ' vectors, dim '
      + dim + ', ' + secs + 's)');
  }

  console.log('Set EMBEDDINGS_BASE_URL at runtime to enable hybrid retrieval.');
}

function writeBinaryIndex(vectors, fullDim, format, targetDim, started) {
  const OUTPUT = BINARY_INDEX_PATH;
  const actualDim = Math.min(targetDim, fullDim);

  // Header: magic (4) + version (4) + num_vectors (4) + dims (4)
  const header = Buffer.alloc(16);
  header.writeUInt32LE(0xADEL2026, 0);  // magic "ADEL" in hex
  header.writeUInt32LE(1, 4);            // version
  header.writeUInt32LE(vectors.length, 8);  // num_vectors
  header.writeUInt32LE(actualDim, 12);      // dims

  // Vector data
  let dataSize = 0;
  let byteSize = 4;  // float32

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
        // Quantize float [-1..1] to int8 [-128..127]
        const quantized = Math.max(-128, Math.min(127, Math.round(val * 127)));
        data.writeInt8(quantized, offset);
        offset += 1;
      } else {
        // float32
        data.writeFloatLE(val, offset);
        offset += 4;
      }
    }
  }

  // Write header + data
  const combined = Buffer.concat([header, data]);
  fs.writeFileSync(OUTPUT, combined);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const mbSize = (combined.length / (1024 * 1024)).toFixed(1);
  console.log('\nWrote ' + OUTPUT + '  (' + vectors.length + ' vectors, dim '
    + actualDim + ', format ' + format + ', ' + mbSize + ' MB, ' + secs + 's)');
}

main().catch((err) => {
  console.error('\nbuild-embeddings crashed:', err);
  process.exit(1);
});
