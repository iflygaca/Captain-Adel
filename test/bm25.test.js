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

/* ---- lookupCitation (the exact Part+section fast path) --------------------*/

test('lookupCitation: resolves a tagged section with the full concatenated text', () => {
  const hit = bm25.lookupCitation('61', '61.57');
  assert.equal(hit.found, true);
  assert.equal(hit.citation, 'GACAR Part 61, §61.57');
  assert.ok(hit.text.length > 0, 'carries the section text');
  assert.ok(hit.page_url, 'carries a deep link');
});

test('lookupCitation: tolerates "§" prefixes, whitespace and a subsection suffix', () => {
  const plain = bm25.lookupCitation('61', '61.57');
  for (const variant of ['§61.57', ' 61.57 ', '61.57(b)']) {
    const hit = bm25.lookupCitation('61', variant);
    assert.equal(hit.found, true, `variant ${JSON.stringify(variant)} resolves`);
    assert.equal(hit.citation, plain.citation);
  }
});

test('lookupCitation: an unknown section returns found:false with an empty payload', () => {
  const miss = bm25.lookupCitation('91', '91.99999');
  assert.equal(miss.found, false);
  assert.equal(miss.text, '');
  assert.equal(miss.page_url, '');
  assert.equal(miss.citation, 'GACAR Part 91, §91.99999', 'echoes the requested citation');
});

test('lookupCitation: the Part must match — a section number alone is not enough', () => {
  assert.equal(bm25.lookupCitation('61', '61.57').found, true);
  assert.equal(bm25.lookupCitation('999', '61.57').found, false);
});

/* ---- listChanges (Change_History entries for a Part) ----------------------*/

test('listChanges: returns well-shaped change-history entries for a Part', () => {
  const entries = bm25.listChanges('1');
  assert.ok(entries.length >= 1, 'the corpus carries change history for Part 1');
  for (const e of entries) {
    assert.ok('version' in e && 'effective_date' in e && 'summary' in e && 'page_url' in e);
    assert.ok(e.summary.length > 0);
  }
});

test('listChanges: sinceVersion filters out entries at or below that version', () => {
  const all = bm25.listChanges('1');
  assert.ok(all.length >= 1);
  const top = all.map((e) => e.version).filter(Boolean).sort().pop();
  const after = bm25.listChanges('1', top);
  assert.ok(after.length < all.length, 'entries <= sinceVersion are dropped');
});

test('listChanges: a Part without change history returns []', () => {
  assert.deepEqual(bm25.listChanges('99999'), []);
});
