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

/* ------------------------------------------------------------- versionNumber */

test('versionNumber: parses v-prefixed and bare numeric versions', () => {
  assert.equal(bm25.versionNumber('v100'), 100);
  assert.equal(bm25.versionNumber('V7'), 7);
  assert.equal(bm25.versionNumber('7'), 7);
  assert.equal(bm25.versionNumber(' v12 '), 12);
});

test('versionNumber: unparseable inputs yield null', () => {
  assert.equal(bm25.versionNumber(''), null);
  assert.equal(bm25.versionNumber(null), null);
  assert.equal(bm25.versionNumber('AIRAC 2505'), null);
  assert.equal(bm25.versionNumber('v1.2'), null);
});

test('versionNumber: orders numerically where string compare fails', () => {
  // The bug this guards against: as strings, 'v100' <= 'v99' is true.
  assert.ok('v100' <= 'v99', 'precondition: lexicographic compare is wrong');
  assert.ok(bm25.versionNumber('v100') > bm25.versionNumber('v99'));
});

test('listChanges: sinceVersion filters numerically, unknown part returns []', () => {
  assert.deepEqual(bm25.listChanges('9999'), []);
  // Whatever the corpus holds, a v0 floor must never drop MORE entries than
  // a v99999 floor would keep — the floor is monotonic under numeric compare.
  const all = bm25.listChanges('91');
  const floored = bm25.listChanges('91', 'v0');
  const versioned = all.filter((e) => bm25.versionNumber(e.version) != null);
  assert.equal(floored.filter((e) => bm25.versionNumber(e.version) != null).length,
    versioned.filter((e) => bm25.versionNumber(e.version) > 0).length);
});

/* ---- citation shaping ----------------------------------------------------
 *
 * The corpus `st` (section title) field is raw PDF-extracted text. These tests
 * pin the two halves of the contract: a section number is recovered when it is
 * genuinely present (even behind LaTeX/OCR noise), and is refused whenever it
 * cannot be verified against the document's own Part — a wrong § is worse than
 * no §. See the note above citationOf in src/brain/bm25.js. */

test('cleanSectionTitle: quotes a clean title, refuses mangled PDF text', () => {
  const clean = (st, docTitle) => bm25.cleanSectionTitle({ st }, docTitle);

  // Clean titles survive.
  assert.equal(clean('ACAS-Passive surveillance'), 'ACAS-Passive surveillance');
  assert.equal(clean('Section 2. Aerodrome Classification'), 'Section 2. Aerodrome Classification');
  assert.equal(clean('II. Time-Recording Devices.'), 'II. Time-Recording Devices.');
  assert.equal(clean('Figure H-9. VOR Aerodrome checkpoint marking.'),
    'Figure H-9. VOR Aerodrome checkpoint marking.');

  // Glued-together PDF words — the class this guard exists for.
  assert.equal(clean('AIRCRAFTONTHEWATER'), '');
  assert.equal(clean('RATINGCOURSE'), '');
  // The whole-document banner repeated as a section title.
  assert.equal(clean('GACAR PART 91 - GENERAL OPERATING AND FLIGHT RULES'), '');
  // LaTeX/extraction noise.
  assert.equal(clean('mathbf§121.139 Preparation.'), '');
  assert.equal(clean('\\$107.109 Training and Procedures Manual.'), '');
  // A mid-word column fragment (starts lowercase).
  assert.equal(clean('dures for the Notification of Aeronautical Facility Info'), '');
  assert.equal(clean('that—'), '');
  // Cut off mid-clause, or ending on a one-character fragment.
  assert.equal(clean('Ground-Ground Communications (Aeronautical Fixed :'), '');
  assert.equal(clean('75.139 Aeronautical information product updates: Data set u'), '');
  // A prose sentence is not a section title.
  assert.equal(clean('Part 139 prescribes the regulations governing the certification of aerodromes.'), '');
  // An echo of the document's own title adds nothing.
  assert.equal(clean('Surveillance', 'Surveillance'), '');
  assert.equal(clean(''), '');
});

test('sectionRefOf: recovers a § hidden behind LaTeX/OCR noise in the title', () => {
  const ref = (c) => bm25.sectionRefOf(c);
  assert.equal(ref({ ds: 'part-121', st: 'mathbf§121.139 Preparation.' }), '§121.139');
  assert.equal(ref({ ds: 'part-139', st: '\\$139.145 Authorization of Aerodromes' }), '§139.145');
  assert.equal(ref({ ds: 'part-107', st: 'bf§107.9 Accident reporting.' }), '§107.9');
  // PDF extraction reads the leading 1 of a section number as l or I.
  assert.equal(ref({ ds: 'part-107', st: 'mathbf§l07.107 Advertising Limitations.' }), '§107.107');
  assert.equal(ref({ ds: 'part-139', st: 'mathbf§l39.147 Application for Aerodrome Authorization' }),
    '§139.147');
  // `gr` and the body prefix still win, in that order.
  assert.equal(ref({ ds: 'part-91', gr: '91.155', st: 'mathbf§91.999 Wrong.' }), '§91.155');
  assert.equal(ref({ ds: 'part-91', t: '§91.155 Basic VFR weather minimums' }), '§91.155');
});

test('sectionRefOf: refuses a number it cannot tie to the document Part', () => {
  const ref = (c) => bm25.sectionRefOf(c);
  // Advisory annexes inside a Part number their own clauses: "1.1 Purpose"
  // inside Part 137 is NOT §137.1, and must not be cited as a section.
  assert.equal(ref({ ds: 'part-137', st: '1.1 Purpose' }), '');
  assert.equal(ref({ ds: 'part-137', st: '2.0 Applicability' }), '');
  assert.equal(ref({ ds: 'part-139', st: '7.1.4.1 PURPOSE.' }), '');
  // A dropped leading digit ("75.139" in Part 175) is a mismatch, not a fix.
  assert.equal(ref({ ds: 'part-175', st: '75.139 Aeronautical information product updates' }), '');
  // No Part to check against — refuse rather than guess.
  assert.equal(ref({ ds: 'surveillance', st: '2.1 Inspection' }), '');
});

test('citationOf: never labels a guidance handbook as GACAR', () => {
  bm25.warmUp();
  // GACAR is the regulations; the bundled handbooks are guidance. Calling one
  // "GACAR Handbook" would present guidance as binding rule.
  const hb = bm25.citationOf({
    ds: 'surveillance', db: 'Handbook',
    st: 'Section 2. Inspection Practices and Procedures',
  });
  assert.ok(!/GACAR/.test(hb), `handbook citation must not say GACAR: ${hb}`);
  assert.match(hb, /^Handbook: /);
  assert.match(hb, /"Section 2\. Inspection Practices and Procedures"/);
});

test('citationOf: falls back from § to a quoted title, then to the Part', () => {
  bm25.warmUp();
  // A recovered section number is the preferred form.
  assert.equal(
    bm25.citationOf({ ds: 'part-107', db: 'Part 107', st: 'mathbf§107.65 Eligibility.' }),
    'GACAR Part 107, §107.65');
  // No § exists for a defined term, so the term itself carries the citation.
  assert.equal(
    bm25.citationOf({ ds: 'part-1', db: 'Part 1', st: 'ACAS-Coordination' }),
    'GACAR Part 1, "ACAS-Coordination"');
  // A banner title is refused, leaving the Part + document title.
  const banner = bm25.citationOf({
    ds: 'part-1', db: 'Part 1',
    st: 'GACAR PART 1 - DEFINITIONS, ABBREVIATIONS AND EDITORIAL CONVENTIONS',
  });
  assert.ok(!banner.includes('"'), `no quoted title expected: ${banner}`);
  assert.match(banner, /^GACAR Part 1 — /);
});

test('citationOf: every corpus hit cites something, and nothing mangled', () => {
  const queries = ['medical certificate', 'aerodrome certification', 'unmanned aircraft',
    'VFR weather minimums', 'aeronautical information', 'inspection practices'];
  for (const q of queries) {
    for (const h of bm25.searchLibrary(q, 8)) {
      assert.ok(h.citation, `every hit carries a citation (query: ${q})`);
      assert.ok(!/GACAR Handbook/.test(h.citation),
        `guidance must not be cited as GACAR: ${h.citation}`);
      assert.ok(!/mathbf|textbf|\\\$/.test(h.citation),
        `no extraction noise in a citation: ${h.citation}`);
      assert.ok(!/[A-Z]{12,}/.test(h.citation.replace(/[^A-Za-z]/g, '')),
        `no glued-word run in a citation: ${h.citation}`);
    }
  }
});
