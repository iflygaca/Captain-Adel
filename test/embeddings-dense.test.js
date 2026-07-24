/* Unit tests — src/brain/embeddings.js denseIndex() (prebuilt-index loading).
 *
 * denseIndex() memoises into module state, so each loading outcome needs a
 * fresh module instance: the require cache entry is evicted per test and the
 * shared `fs` module's existsSync/readFileSync are stubbed (assign-and-restore)
 * so no real _embeddings.json.gz is needed. gzip payloads are real (zlib). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');

const MODULE_PATH = require.resolve('../src/brain/embeddings');

/* A fresh embeddings module whose DENSE_PATH read is served by the stub. */
function freshDense({ exists, payload }, fn) {
  const saved = { existsSync: fs.existsSync, readFileSync: fs.readFileSync };
  delete require.cache[MODULE_PATH];
  fs.existsSync = (p) => (p.includes('_embeddings') ? exists : saved.existsSync(p));
  fs.readFileSync = (p, ...rest) =>
    (typeof p === 'string' && p.includes('_embeddings') ? payload : saved.readFileSync(p, ...rest));
  try {
    return fn(require(MODULE_PATH));
  } finally {
    fs.existsSync = saved.existsSync;
    fs.readFileSync = saved.readFileSync;
    delete require.cache[MODULE_PATH];
  }
}

const gz = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj)));

test('denseIndex: missing file -> null, and the result is memoised', () => {
  freshDense({ exists: false }, (emb) => {
    assert.equal(emb.denseIndex(), null);
    assert.equal(emb.denseIndex(), null, 'second call returns the cached null');
  });
});

test('denseIndex: a bare vector array loads as Float32Array rows', () => {
  freshDense({ exists: true, payload: gz([[0.1, 0.2], [0.3, 0.4]]) }, (emb) => {
    const dense = emb.denseIndex();
    assert.equal(dense.length, 2);
    assert.ok(dense[0] instanceof Float32Array, 'held as Float32Array, not parsed JSON arrays');
    assert.ok(Math.abs(dense[1][1] - 0.4) < 1e-6);
  });
});

test('denseIndex: the { vectors } wrapper shape also loads', () => {
  freshDense({ exists: true, payload: gz({ vectors: [[1, 0], [0, 1]] }) }, (emb) => {
    const dense = emb.denseIndex();
    assert.equal(dense.length, 2);
    assert.equal(emb.cosine([1, 0], dense[0]), 1);
  });
});

test('denseIndex: an unrecognised JSON shape -> null', () => {
  freshDense({ exists: true, payload: gz({ notVectors: true }) }, (emb) => {
    assert.equal(emb.denseIndex(), null);
  });
});

test('denseIndex: a corrupt gzip payload -> null, never a throw', () => {
  freshDense({ exists: true, payload: Buffer.from('definitely not gzip') }, (emb) => {
    assert.equal(emb.denseIndex(), null);
  });
});

test('hybridAvailable: needs BOTH the endpoint and a loadable dense index', () => {
  const prev = process.env.EMBEDDINGS_BASE_URL;
  process.env.EMBEDDINGS_BASE_URL = 'http://emb:8000';
  try {
    freshDense({ exists: false }, (emb) => {
      assert.equal(emb.hybridAvailable(), false, 'endpoint alone is not enough');
    });
    freshDense({ exists: true, payload: gz([[1, 0]]) }, (emb) => {
      assert.equal(emb.hybridAvailable(), true);
    });
  } finally {
    if (prev === undefined) delete process.env.EMBEDDINGS_BASE_URL;
    else process.env.EMBEDDINGS_BASE_URL = prev;
  }
});
