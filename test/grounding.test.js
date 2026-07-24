/* Unit tests — captadel/src/brain/grounding.js
 *
 * The grounding layer is what enforces the load-bearing product rule: Captain
 * Adel cites the exact Part/section or refuses, and never silently overclaims.
 * Every function here is pure and deterministic (the faithfulness judge is the
 * only network path and is opt-in), so the whole structural pipeline is unit
 * testable with no API key — which is exactly why it belongs in the PR gate
 * rather than only in the live eval.
 *
 * Covers: makeSource (source shaping), extractCitations, splitClaims
 * (isClaim/intoSentences via the public API), classifyRefusal, stripMetaTrailer,
 * deriveStructural (the kind lattice), and decorate's structural + declared
 * paths including the conservative-merge anti-overclaim invariant. Bilingual
 * (Arabic) cases are included because the Arabic path is first-class. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/brain/grounding');

/* ---------------------------------------------------------------- makeSource */

test('makeSource: parses Part + section and carries verbatim/version', () => {
  const s = G.makeSource(
    'GACAR Part 91, §91.155(a)',
    'library.html#91.155-2',
    'no person may operate an aircraft under VFR …',
    'AIRAC 2505'
  );
  assert.equal(s.part, '91');
  assert.equal(s.section, '91.155(a)');
  assert.equal(s.sectionAnchor, '91.155', 'anchor strips the trailing -N chunk index');
  assert.match(s.verbatim, /no person may operate/);
  assert.equal(s.corpusVersion, 'AIRAC 2505');
});

test('makeSource: caps verbatim at 600 chars', () => {
  const s = G.makeSource('GACAR Part 91, §91.155', 'u#91.155', 'x'.repeat(900), 'v1');
  assert.equal(s.verbatim.length, 600);
});

/* ---------------------------------------------------------------- pushSource */

test('pushSource: dedupes on (citation, anchor) — chunk suffixes collapse', () => {
  const sources = [];
  const seen = new Set();
  G.pushSource(sources, seen, 'GACAR Part 91, §91.155', 'library.html#91.155-1', 'a', 'v1');
  G.pushSource(sources, seen, 'GACAR Part 91, §91.155', 'library.html#91.155-2', 'b', 'v1');
  assert.equal(sources.length, 1, 'two chunks of one section yield one source');
  assert.equal(sources[0].verbatim, 'a', 'first hit wins');
});

test('pushSource: citation case/whitespace does not defeat the dedupe key', () => {
  const sources = [];
  const seen = new Set();
  G.pushSource(sources, seen, 'GACAR Part 61, §61.57', 'u#61.57', 'a', 'v1');
  G.pushSource(sources, seen, '  gacar part 61, §61.57 ', 'u#61.57', 'b', 'v1');
  assert.equal(sources.length, 1);
});

test('pushSource: distinct sections both land', () => {
  const sources = [];
  const seen = new Set();
  G.pushSource(sources, seen, 'GACAR Part 91, §91.155', 'u#91.155', 'a', 'v1');
  G.pushSource(sources, seen, 'GACAR Part 91, §91.157', 'u#91.157', 'b', 'v1');
  assert.equal(sources.length, 2);
});

test('pushSource: no-op when both citation and url are falsy', () => {
  const sources = [];
  const seen = new Set();
  G.pushSource(sources, seen, '', '', 'text', 'v1');
  G.pushSource(sources, seen, null, undefined, 'text', 'v1');
  assert.equal(sources.length, 0);
  assert.equal(seen.size, 0);
});

test('makeSource: falls back to url for citation and tolerates no match', () => {
  const s = G.makeSource('', 'https://example.test/doc', null, null);
  assert.equal(s.citation, 'https://example.test/doc');
  assert.equal(s.part, null);
  assert.equal(s.section, null);
  assert.equal(s.verbatim, null, 'no text → null, never the string "null"');
  assert.equal(s.corpusVersion, null);
});

/* ---------------------------------------------------------- extractCitations */

test('extractCitations: matches "Part N, §N.NN(x)" and bare "§N.NN"', () => {
  const out = G.extractCitations('See §91.155 and Part 61, §61.57(b).');
  // Bare section infers its Part from the leading number group.
  assert.deepEqual(
    [...out].sort((a, b) => a.part.localeCompare(b.part)),
    [
      { part: '61', section: '61.57(b)' },
      { part: '91', section: '91.155' },
    ]
  );
});

test('extractCitations: de-duplicates repeated cites', () => {
  assert.deepEqual(G.extractCitations('dup §91.155 again §91.155'), [
    { part: '91', section: '91.155' },
  ]);
});

test('extractCitations: no citation → empty array', () => {
  assert.deepEqual(G.extractCitations('VFR needs 3 SM but I name no section.'), []);
  assert.deepEqual(G.extractCitations(null), []);
});

/* ----------------------------------------------------------------- splitClaims */

test('splitClaims: keeps regulatory claims (number+unit, modal, §ref); drops chatter', () => {
  const claims = G.splitClaims(
    'Short answer: VFR needs 3 SM.\nA pilot must hold a medical.\nHello there friend.'
  );
  assert.deepEqual(claims, ['VFR needs 3 SM.', 'A pilot must hold a medical.']);
});

test('splitClaims: hedged / refusal sentences are NOT claims', () => {
  assert.deepEqual(G.splitClaims('I cannot verify that figure.'), []);
  assert.deepEqual(G.splitClaims('Verify against the official GACA publication.'), []);
});

test('splitClaims: pure greeting yields no claims', () => {
  assert.deepEqual(G.splitClaims('On the line, Captain. What do you need?'), []);
});

test('splitClaims: strips "Cite:"/"Sources:" meta lines', () => {
  const claims = G.splitClaims('A pilot must be 17.\nCite: GACAR Part 61, §61.133');
  assert.deepEqual(claims, ['A pilot must be 17.']);
});

test('splitClaims: Arabic modal sentence is recognised as a claim', () => {
  assert.deepEqual(G.splitClaims('يجب أن يحمل الطيار شهادة طبية.'), [
    'يجب أن يحمل الطيار شهادة طبية.',
  ]);
});

test('splitClaims: symbolic threshold (≥/≤) is recognised as a claim', () => {
  // Regulatory minima are often written symbolically; the cite-or-refuse net
  // must catch these or they slip through as a non-answer (na).
  assert.deepEqual(G.splitClaims('The applicant must be ≥ 17 to qualify.'),
    ['The applicant must be ≥ 17 to qualify.']);
  assert.deepEqual(G.splitClaims('Keep the descent rate <= 500 here.'),
    ['Keep the descent rate <= 500 here.']);
});

test('splitClaims: added modal/unit phrasings are recognised', () => {
  assert.deepEqual(G.splitClaims('Carry no more than four passengers.'),
    ['Carry no more than four passengers.']);
  assert.deepEqual(G.splitClaims('Maintain a 5% safety margin.'),
    ['Maintain a 5% safety margin.']);
  assert.deepEqual(G.splitClaims('Hold 500 fpm on the climb.'),
    ['Hold 500 fpm on the climb.']);
});

test('splitClaims: Arabic "على الأقل" threshold is recognised as a claim', () => {
  assert.deepEqual(G.splitClaims('العمر على الأقل سبعة عشر عاماً.'),
    ['العمر على الأقل سبعة عشر عاماً.']);
});

/* -------------------------------------------------------------- classifyRefusal */

test('classifyRefusal: maps the canonical phrasings to taxonomy ids', () => {
  assert.equal(G.classifyRefusal('There is no such Part for unicorn operations.'), '1.2');
  assert.equal(G.classifyRefusal('Fly the aircraft. Declare to ATC. Run your QRH.'), '3.1');
  assert.equal(G.classifyRefusal("That's an AFM/POH figure for your airframe."), '2.2');
});

test('classifyRefusal: ordering is safety-first (live-data 2.1 wins over 1.1 phrasing)', () => {
  // Both a "can't verify that figure" (1.1) and "live METAR" (2.1) cue present;
  // the rules are ordered most-specific/safety-first, so 2.1 must win.
  assert.equal(G.classifyRefusal('I cannot verify that figure for live METAR.'), '2.1');
});

test('classifyRefusal: a grounded regulatory answer is not a refusal', () => {
  assert.equal(G.classifyRefusal('A PPL applicant must be at least 17 (§61.133).'), null);
});

test('classifyRefusal: Arabic refusal is classified', () => {
  assert.equal(G.classifyRefusal('لا أستطيع التحقق من هذا الرقم.'), '1.1');
});

/* -------------------------------------------------------------- stripMetaTrailer */

test('stripMetaTrailer: parses kind+class and removes the trailer', () => {
  const t = G.stripMetaTrailer('The minima are 3 SM.\n<<adel kind=refusal class=1.1>>');
  assert.equal(t.kind, 'refusal');
  assert.equal(t.refusalClass, '1.1');
  assert.doesNotMatch(t.answer, /adel kind/);
});

test('stripMetaTrailer: absent trailer → null kind/class, answer untouched', () => {
  const t = G.stripMetaTrailer('plain answer');
  assert.equal(t.kind, null);
  assert.equal(t.refusalClass, null);
  assert.equal(t.answer, 'plain answer');
});

test('stripMetaTrailer: strips a stray mid-text trailer and still parses the final verdict', () => {
  const t = G.stripMetaTrailer('Lead <<adel kind=na>> still text.\n<<adel kind=grounded>>');
  assert.doesNotMatch(t.answer, /adel kind/);
  assert.equal(t.kind, 'grounded');
});

test('stripMetaTrailer: tolerates backtick/asterisk wrapping', () => {
  const t = G.stripMetaTrailer('3 SM visibility.\n`<<adel kind=grounded>>`');
  assert.equal(t.kind, 'grounded');
  assert.doesNotMatch(t.answer, /adel kind|`$/);
});

test('stripMetaTrailer: unknown kind → null (never trusted blindly)', () => {
  const t = G.stripMetaTrailer('text\n<<adel kind=bogus>>');
  assert.equal(t.kind, null);
});

/* ------------------------------------------------------------- deriveStructural */

test('deriveStructural: cited + resolved claim → grounded', () => {
  const r = G.deriveStructural(
    'Below 10,000 ft, VFR requires 3 SM visibility (§91.155(a)).',
    [G.makeSource('GACAR Part 91, §91.155(a)', 'library.html#91.155', 'three statute miles …')]
  );
  assert.equal(r.kind, 'grounded');
  assert.equal(r.resolved.length, 1);
  assert.equal(r.unresolved.length, 0);
});

test('deriveStructural: a claim with no citation → partial', () => {
  const r = G.deriveStructural('The limit is at least 17 years of age.', []);
  assert.equal(r.kind, 'partial');
});

test('deriveStructural: cited-but-unresolved (fabricated §) → partial, tracked as unresolved', () => {
  const r = G.deriveStructural(
    'See §91.999 — minimum is 3 SM.',
    [G.makeSource('GACAR Part 61, §61.133', 'library.html#61.133', 'seventeen years …')]
  );
  assert.equal(r.kind, 'partial');
  assert.equal(r.unresolved.length, 1);
  assert.equal(r.resolved.length, 0);
});

test('deriveStructural: no regulatory claim → na', () => {
  assert.equal(G.deriveStructural('On the line, Captain. What do you need?', []).kind, 'na');
});

test('deriveStructural: refusal phrasing → refusal with class, regardless of claims', () => {
  const r = G.deriveStructural("I can't verify that figure. Search Part 61 in the library.", []);
  assert.equal(r.kind, 'refusal');
  assert.equal(r.refusalClass, '1.1');
});

test('deriveStructural: claims carry a null verdict in structural mode', () => {
  const r = G.deriveStructural('A pilot must hold a medical.', []);
  assert.equal(r.claims.length, 1);
  assert.equal(r.claims[0].verdict, null);
});

/* -------------------------------------------------- decorate (structural path) */

test('decorate: grounded answer → grounded/structural, source widened, meta carried', async () => {
  const src = [G.makeSource('GACAR Part 91, §91.155(a)', 'library.html#91.155', 'three statute miles …')];
  const out = await G.decorate(
    { answer: 'Below 10,000 ft, VFR requires 3 SM visibility (§91.155(a)).', sources: src },
    { model: 'gemini-2.5-flash', _provider: 'gemini' }
  );
  assert.equal(out.kind, 'grounded');
  assert.equal(out.grounding.mode, 'structural');
  assert.equal(out.grounding.state, 'grounded');
  assert.equal(out.refusalClass, null);
  assert.notEqual(out.sources[0].verbatim, null);
  assert.equal(out.meta.model, 'gemini-2.5-flash');
  assert.equal(out.meta.provider, 'gemini');
});

test('decorate: declared refusal trailer is authoritative and stripped', async () => {
  const out = await G.decorate(
    { answer: "That's an AFM/POH figure for your airframe.\n<<adel kind=refusal class=2.2>>", sources: [] },
    {}
  );
  assert.equal(out.kind, 'refusal');
  assert.equal(out.refusalClass, '2.2');
  assert.equal(out.grounding.mode, 'declared');
  assert.doesNotMatch(out.answer, /adel kind/);
});

test('decorate: anti-overclaim — model declares grounded but a cite is unresolved → partial', async () => {
  const out = await G.decorate(
    {
      answer: 'Minimum is 3 SM (§91.999).\n<<adel kind=grounded>>',
      sources: [G.makeSource('GACAR Part 61, §61.133', 'library.html#61.133', 'seventeen years …')],
    },
    {}
  );
  assert.equal(out.kind, 'partial', 'no signal may upgrade past the most conservative one');
});

test('decorate: refusalClass is suppressed unless kind is refusal', async () => {
  const out = await G.decorate({ answer: 'On the line, Captain.\n<<adel kind=na>>', sources: [] }, {});
  assert.equal(out.kind, 'na');
  assert.equal(out.refusalClass, null);
});

test('decorate: missing/!array sources is tolerated', async () => {
  const out = await G.decorate({ answer: 'Hello, Captain.' }, {});
  assert.deepEqual(out.sources, []);
  assert.equal(out.kind, 'na');
});
