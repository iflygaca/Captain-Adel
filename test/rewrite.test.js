/* Unit tests — captadel/src/brain/rewrite.js (multi-turn retrieval rewriting).
 * Pure heuristics — no network, no API key (default ADEL_REWRITE=heuristic). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rewriteQuery, isFollowUp, harvestTerms, glossaryTerms, raceNullOnTimeout } = require('../src/brain/rewrite');

const HISTORY = [
  { role: 'user', text: 'What are the basic VFR weather minimums in Class G airspace under GACAR Part 91?' },
  { role: 'model', text: 'Under GACAR Part 91, §91.155, basic VFR by day requires the visibility in the table.' },
];

const AR_HISTORY = [
  { role: 'user', text: 'ما هي متطلبات الطيران المنفرد للطالب الطيار حسب الجزء 61؟' },
  { role: 'model', text: 'حسب GACAR Part 61 يحتاج الطالب إلى تصديق المدرب.' },
];

test('isFollowUp: detects EN connectives and pronouns', () => {
  assert.equal(isFollowUp('And at night?', HISTORY), true);
  assert.equal(isFollowUp('What about Class C?', HISTORY), true);
  assert.equal(isFollowUp('How long is it valid?', HISTORY), true);
});

test('isFollowUp: detects Arabic connectives', () => {
  assert.equal(isFollowUp('وماذا عن الليل؟', AR_HISTORY), true);
  assert.equal(isFollowUp('طيب وهل يقدر ينقل ركاب؟', AR_HISTORY), true);
});

test('isFollowUp: self-contained questions are NOT follow-ups', () => {
  assert.equal(isFollowUp('What does GACAR Part 61 say about solo flight?', HISTORY), false);
  assert.equal(isFollowUp('What is the minimum visibility under §91.155?', HISTORY), false);
  assert.equal(
    isFollowUp('What are the medical certificate requirements for a commercial pilot licence holder in the Kingdom?', HISTORY),
    false
  );
});

test('isFollowUp: no history means no follow-up', () => {
  assert.equal(isFollowUp('And at night?', []), false);
  assert.equal(isFollowUp('And at night?', undefined), false);
});

test('harvestTerms: pulls Part numbers, § refs and content tokens from the thread', () => {
  const terms = harvestTerms('And at night?', HISTORY);
  assert.ok(terms.includes('Part 91'), 'harvests the Part: ' + terms);
  assert.ok(terms.some((t) => t.startsWith('§91.155')), 'harvests the § ref: ' + terms);
  assert.ok(terms.some((t) => /weather|minimums|airspace|visibility/.test(t)), 'harvests topic tokens: ' + terms);
});

test('harvestTerms: skips terms already present in the message', () => {
  const terms = harvestTerms('what about part 91 at night', HISTORY);
  assert.ok(!terms.includes('Part 91'));
});

test('glossaryTerms: maps Arabic aviation phrases to corpus English', () => {
  assert.ok(glossaryTerms('ما هي متطلبات الوقود؟').includes('fuel'));
  assert.ok(glossaryTerms('وماذا عن الليل؟').includes('night'));
  assert.deepEqual(glossaryTerms('plain english question'), []);
});

test('glossaryTerms: covers the expanded operational vocabulary', () => {
  assert.ok(glossaryTerms('قواعد تشغيل المروحية').includes('helicopter'));
  assert.ok(glossaryTerms('الحد الأدنى لرؤية المدرج').includes('runway'));
  assert.ok(glossaryTerms('إجراءات الطوارئ').includes('emergency'));
  assert.ok(glossaryTerms('متطلبات خطة الطيران').includes('flight'));
  // dedup holds across the longer table.
  const terms = glossaryTerms('المروحية المروحية');
  assert.equal(terms.filter((t) => t === 'helicopter').length, 1);
});

test('rewriteQuery: non-follow-up EN passes through unchanged', async () => {
  const q = 'What does GACAR Part 61 say about flight reviews?';
  assert.equal(await rewriteQuery(q, HISTORY), q);
});

test('rewriteQuery: EN follow-up gains thread terms (message itself preserved as prefix)', async () => {
  const out = await rewriteQuery('And at night?', HISTORY);
  assert.ok(out.startsWith('And at night?'));
  assert.ok(/part 91/i.test(out), out);
});

test('rewriteQuery: Arabic follow-up gains thread + glossary terms', async () => {
  const out = await rewriteQuery('وماذا عن الليل؟', AR_HISTORY);
  assert.ok(out.startsWith('وماذا عن الليل؟'));
  assert.ok(/part 61/i.test(out), out);
  assert.ok(/night/.test(out), out);
});

test('rewriteQuery: ADEL_REWRITE=off is a strict passthrough', async () => {
  const prev = process.env.ADEL_REWRITE;
  process.env.ADEL_REWRITE = 'off';
  try {
    assert.equal(await rewriteQuery('And at night?', HISTORY), 'And at night?');
  } finally {
    if (prev === undefined) delete process.env.ADEL_REWRITE;
    else process.env.ADEL_REWRITE = prev;
  }
});

test('rewriteQuery: empty message stays empty', async () => {
  assert.equal(await rewriteQuery('', HISTORY), '');
  assert.equal(await rewriteQuery(null, HISTORY), '');
});

/* --------------------------------------------------------- raceNullOnTimeout */

test('raceNullOnTimeout: resolves the value when the promise settles first', async () => {
  assert.equal(await raceNullOnTimeout(Promise.resolve('fast'), 1000), 'fast');
});

test('raceNullOnTimeout: resolves null when the timeout wins', async () => {
  const never = new Promise(() => {});
  assert.equal(await raceNullOnTimeout(never, 10), null);
});

test('raceNullOnTimeout: resolves null on rejection, before or after the timeout', async () => {
  let unhandled = null;
  const sentinel = (err) => { unhandled = err; };
  process.on('unhandledRejection', sentinel);
  try {
    // Early rejection: swallowed, resolves null.
    assert.equal(await raceNullOnTimeout(Promise.reject(new Error('early')), 50), null);

    // Late rejection: the timeout wins first, then the promise rejects — the
    // bare Promise.race this replaced would surface this as unhandled.
    let rejectLate;
    const late = new Promise((_, rej) => { rejectLate = rej; });
    assert.equal(await raceNullOnTimeout(late, 10), null);
    rejectLate(new Error('late'));

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    assert.equal(unhandled, null, 'no unhandledRejection may fire');
  } finally {
    process.removeListener('unhandledRejection', sentinel);
  }
});
