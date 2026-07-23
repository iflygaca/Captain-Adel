/* Unit tests — evals/lib.js (the scorer shared by run.js and parity.js).
 *
 * This is the release gate: every eval PASS/FAIL verdict — including the
 * parity gate that decides whether MODEL_PROVIDER=auto may use a candidate
 * provider — flows through score(). A scoring bug silently weakens the quality
 * bar for every case in cases.json, so the scorer itself needs the same
 * deterministic coverage as the brain. Pure, no network, no API key. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../evals/lib');

const verdictOf = (checks, name) => {
  const c = checks.find((x) => x.name === name || x.name.startsWith(name));
  assert.ok(c, `check ${name} was emitted: ` + JSON.stringify(checks));
  return c.ok;
};

/* ---- score(): one expect key at a time ------------------------------------*/

test('score: citesPart matches "Part N" case-insensitively with a word boundary', () => {
  assert.equal(verdictOf(lib.score({ citesPart: ['91'] }, 'See GACAR part 91 for that.', []), 'citesPart'), true);
  assert.equal(verdictOf(lib.score({ citesPart: ['91'] }, 'See Part 911 for that.', []), 'citesPart'), false, 'Part 911 is not Part 91');
  assert.equal(verdictOf(lib.score({ citesPart: ['61', '91'] }, 'Part 61 applies.', []), 'citesPart'), true, 'any listed Part passes');
  assert.equal(verdictOf(lib.score({ citesPart: ['61'] }, 'No citation here.', []), 'citesPart'), false);
});

test('score: mustInclude emits one check per keyword, case-insensitive', () => {
  const checks = lib.score({ mustInclude: ['visibility', 'cloud'] }, 'Flight VISIBILITY and cloud clearance.', []);
  assert.equal(checks.length, 2);
  assert.ok(checks.every((c) => c.ok));
  const miss = lib.score({ mustInclude: ['visibility', 'ceiling'] }, 'visibility only', []);
  assert.equal(verdictOf(miss, 'include:visibility'), true);
  assert.equal(verdictOf(miss, 'include:ceiling'), false);
});

test('score: mustIncludeAny passes on any one match, fails on none', () => {
  assert.equal(verdictOf(lib.score({ mustIncludeAny: ['sm', 'kilometer'] }, '3 SM required.', []), 'includeAny'), true);
  assert.equal(verdictOf(lib.score({ mustIncludeAny: ['sm', 'kilometer'] }, 'three miles', []), 'includeAny'), false);
});

test('score: mustNotInclude fails when a banned phrase appears', () => {
  const checks = lib.score({ mustNotInclude: ['i think', 'probably'] }, 'It is probably 3 SM.', []);
  assert.equal(verdictOf(checks, 'exclude:i think'), true);
  assert.equal(verdictOf(checks, 'exclude:probably'), false);
});

test('score: shouldHaveSources compares presence, both polarities', () => {
  assert.equal(verdictOf(lib.score({ shouldHaveSources: true }, 'a', [{}]), 'sources'), true);
  assert.equal(verdictOf(lib.score({ shouldHaveSources: true }, 'a', []), 'sources'), false);
  assert.equal(verdictOf(lib.score({ shouldHaveSources: false }, 'a', []), 'sources'), true);
  assert.equal(verdictOf(lib.score({ shouldHaveSources: false }, 'a', [{}]), 'sources'), false);
});

test('score: answerLang ar requires Arabic script; en requires its absence', () => {
  assert.equal(verdictOf(lib.score({ answerLang: 'ar' }, 'الحد الأدنى للرؤية ثلاثة أميال', []), 'answerLang:ar'), true);
  assert.equal(verdictOf(lib.score({ answerLang: 'ar' }, 'Three statute miles.', []), 'answerLang:ar'), false);
  assert.equal(verdictOf(lib.score({ answerLang: 'en' }, 'Three statute miles.', []), 'answerLang:en'), true);
  assert.equal(verdictOf(lib.score({ answerLang: 'en' }, 'الرؤية ثلاثة أميال', []), 'answerLang:en'), false);
  assert.equal(verdictOf(lib.score({ answerLang: 'en' }, '', []), 'answerLang:en'), false, 'an empty answer is not English');
});

test('score: kind is only checked when the runner passes the decorated kind', () => {
  const withKind = lib.score({ kind: 'refusal' }, 'x', [], { kind: 'refusal' });
  assert.equal(verdictOf(withKind, 'kind'), true);
  const wrong = lib.score({ kind: 'grounded' }, 'x', [], { kind: 'partial' });
  assert.equal(verdictOf(wrong, 'kind'), false);
  const legacy = lib.score({ kind: 'grounded' }, 'x', []);   // old caller, no extra
  assert.ok(!legacy.some((c) => c.name === 'kind'), 'backward-compatible: no extra, no kind check');
});

test('score: an empty expect block emits no checks (vacuous pass)', () => {
  assert.deepEqual(lib.score({}, 'anything', []), []);
});

/* ---- helpers + case loading ----------------------------------------------*/

test('has / hasArabic: the primitive matchers behave', () => {
  assert.equal(lib.has('Basic VFR Minimums', 'vfr'), true);
  assert.equal(lib.has('Basic VFR Minimums', 'ifr'), false);
  assert.equal(lib.hasArabic('مرحبا'), true);
  assert.equal(lib.hasArabic('hello'), false);
});

test('isArabicCase: flags Arabic questions and answerLang:ar expectations', () => {
  assert.equal(lib.isArabicCase({ question: 'ما هي متطلبات الوقود؟', expect: {} }), true);
  assert.equal(lib.isArabicCase({ question: 'Fuel rules?', expect: { answerLang: 'ar' } }), true);
  assert.equal(lib.isArabicCase({ question: 'Fuel rules?', expect: {} }), false);
  assert.equal(lib.isArabicCase(null), false);
});

test('loadCases: the shipped cases.json is structurally valid and non-trivial', () => {
  const cases = lib.loadCases();
  assert.ok(cases.length >= 20, 'the regression suite stays substantial');
  for (const c of cases) {
    assert.ok(c.id && c.question && c.expect, 'id/question/expect are mandatory');
  }
  assert.ok(cases.some((c) => lib.isArabicCase(c)), 'the Arabic subset the parity gate needs exists');
});
