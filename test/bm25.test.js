/* Unit tests — captadel/src/brain/bm25.js
 *
 * The BM25 retriever is the heart of Captain Adel's grounding. tokenize and
 * expandQuery are pure; searchLibrary runs against the real bundled corpus
 * (_chunks.json.gz on disk — no network, no API key). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const bm25 = require('../src/brain/bm25');

test('tokenize: lowercases, drops stopwords, strips edge dots', () => {
  assert.deepEqual(bm25.tokenize('The Medical Certificate'), ['medical', 'certificate']);
  assert.deepEqual(bm25.tokenize('...GACAR...'), ['gacar']);
});

test('tokenize: empty/nullish -> empty array', () => {
  assert.deepEqual(bm25.tokenize(''), []);
  assert.deepEqual(bm25.tokenize(null), []);
  assert.deepEqual(bm25.tokenize(undefined), []);
});

test('tokenize: handles Arabic text', () => {
  const toks = bm25.tokenize('الشهادة الطبية للطيار');
  assert.ok(Array.isArray(toks) && toks.length > 0);
});

test('expandQuery: aviation synonyms expand, unknown terms pass through', () => {
  assert.deepEqual(bm25.expandQuery(['drone']), ['drone', 'unmanned', 'uas']);
  assert.deepEqual(bm25.expandQuery(['certificate']), ['certificate']);
});

test('expandQuery: de-duplicates the expansion', () => {
  const out = bm25.expandQuery(['drone', 'uav']);
  assert.equal(new Set(out).size, out.length, 'no duplicates');
  assert.ok(out.includes('unmanned'));
});

test('searchLibrary: returns a ranked, capped list of well-shaped hits', () => {
  const hits = bm25.searchLibrary('medical certificate requirements', 3);
  assert.ok(Array.isArray(hits));
  assert.ok(hits.length >= 1, 'a corpus query should return at least one hit');
  assert.ok(hits.length <= 3, 'respects topK');
  for (const h of hits) {
    assert.equal(typeof h.text, 'string');
    assert.ok(h.text.length > 0);
    assert.ok('citation' in h);
    assert.ok('page_url' in h);
  }
});

test('searchLibrary: topK is clamped to the 1..12 range', () => {
  assert.ok(bm25.searchLibrary('airspace', 0).length >= 1);   // clamped up to >=1
  assert.ok(bm25.searchLibrary('airspace', 999).length <= 12); // clamped down to <=12
});

test('searchLibrary: a nonsense query does not throw and returns an array', () => {
  const hits = bm25.searchLibrary('zzzxqq-not-a-real-term-9999', 5);
  assert.ok(Array.isArray(hits));
});

test('searchLibrary: results are de-duplicated by section', () => {
  const hits = bm25.searchLibrary('aircraft registration', 6);
  const keys = hits.map((h) => h.citation + '|' + (h.section_title || ''));
  assert.equal(new Set(keys).size, keys.length, 'no duplicate sections in the result set');
});
