#!/usr/bin/env node
/* ============================================================================
 * Captain Adel — dense embeddings index builder.
 *
 * Embeds every corpus chunk once (in the same order bm25.js loads them) and
 * writes src/brain/_embeddings.json.gz — the dense half of hybrid retrieval.
 * Vectors are aligned to the BM25 corpus by chunk index, so retrieve.js can
 * fuse a dense ranking with the lexical one by index alone.
 *
 * This is a one-off / on-corpus-change step, run manually against an embeddings
 * endpoint — never at request time and never in CI. Without the file (and an
 * EMBEDDINGS_BASE_URL at runtime) retrieval stays pure BM25.
 *
 * Usage:
 *   EMBEDDINGS_BASE_URL=http://host:8080/v1  node scripts/build-embeddings.js
 *   EMBEDDINGS_BASE_URL=...  EMBEDDINGS_MODEL=BAAI/bge-m3  EMBED_BATCH=64  node scripts/build-embeddings.js
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { embedder, DENSE_PATH } = require('../src/brain/embeddings');

const CHUNKS_PATH = path.join(__dirname, '..', 'src', 'brain', '_chunks.json.gz');
const BATCH = parseInt(process.env.EMBED_BATCH, 10) || 64;
const MAX_CHARS = parseInt(process.env.EMBED_MAX_CHARS, 10) || 1000;

/* The text fed to the embedder: section title + body, mirroring what a reader
 * would match against. Kept compact so long chunks don't blow the model's window. */
function chunkText(c) {
  const head = String(c.st || '').trim();
  const body = String(c.t || '').trim();
  return (head ? head + '\n' : '') + body;
}

async function main() {
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
    + ' (batch=' + BATCH + ')...');

  const vectors = new Array(chunks.length);
  let dim = 0;
  const started = Date.now();

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
  fs.writeFileSync(DENSE_PATH, zlib.gzipSync(Buffer.from(JSON.stringify(out))));

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\nWrote ' + DENSE_PATH + '  (' + vectors.length + ' vectors, dim '
    + dim + ', ' + secs + 's)');
  console.log('Set EMBEDDINGS_BASE_URL at runtime to enable hybrid retrieval.');
}

main().catch((err) => {
  console.error('\nbuild-embeddings crashed:', err);
  process.exit(1);
});
