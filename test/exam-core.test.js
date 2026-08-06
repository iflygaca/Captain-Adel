/* Unit tests — captadel/public/assets/js/exam-core.js (a second frontend file
 * mapped outside src/, like chat-core: a classic browser script with a
 * module.exports branch so this suite can load it under node:test).
 *
 * Covers the DOM-free half of the mock exam: quiz-data + question validation,
 * deterministic selection (seeded rng), option shuffling with answer remap,
 * scoring, the weakest-first topic breakdown, resume-snapshot validation, and
 * the bilingual Captain-Adel prompt builders. Language-sensitive code paths
 * take an explicit lang argument, so these tests never touch document. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../public/assets/js/exam-core');

/* A small deterministic rng (mulberry32) so shuffles are reproducible. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bank(id, title, qs) {
  return { id, title, titleAr: title + '-ar', desc: 'd', questions: qs };
}
function q(text, answer) {
  return { q: text, options: ['A', 'B', 'C', 'D'], answer, explain: 'e', cite: 'GACAR §1.1' };
}
function sampleBanks() {
  return [
    bank('t1', 'Topic One', [q('t1q0', 0), q('t1q1', 1), q('t1q2', 2)]),
    bank('t2', 'Topic Two', [q('t2q0', 3), q('t2q1', 0)]),
  ];
}

/* ------------------------------------------------------------ validation */

test('validQuestion: accepts a well-formed question, rejects broken ones', () => {
  assert.equal(core.validQuestion(q('ok', 1)), true);
  assert.equal(core.validQuestion(null), false);
  assert.equal(core.validQuestion({ q: '', options: ['a', 'b'], answer: 0 }), false);
  assert.equal(core.validQuestion({ q: 'x', options: ['a'], answer: 0 }), false, 'needs >= 2 options');
  assert.equal(core.validQuestion({ q: 'x', options: ['a', 'b'], answer: 2 }), false, 'answer out of range');
  assert.equal(core.validQuestion({ q: 'x', options: ['a', 'b'], answer: -1 }), false);
  assert.equal(core.validQuestion({ q: 'x', options: ['a', ''], answer: 0 }), false, 'blank option');
  assert.equal(core.validQuestion({ q: 'x', options: ['a', 'b'], answer: 1.5 }), false, 'non-integer answer');
});

test('validQuizData: requires banks of valid questions', () => {
  assert.equal(core.validQuizData({ banks: sampleBanks() }), true);
  assert.equal(core.validQuizData(null), false);
  assert.equal(core.validQuizData({ banks: [] }), false);
  assert.equal(core.validQuizData({ banks: [{ id: 'x', title: 't', questions: [q('', 0)] }] }), false);
  assert.equal(core.validQuizData({ banks: [{ id: '', title: 't', questions: [] }] }), false);
});

test('examConfig: reads exam block, falls back to defaults', () => {
  assert.deepEqual(core.examConfig({ exam: { questions: 40, minutes: 50, passMark: 80 } }),
    { questions: 40, minutes: 50, passMark: 80 });
  assert.deepEqual(core.examConfig(null), { questions: 25, minutes: 30, passMark: 75 });
  assert.deepEqual(core.examConfig({ exam: { questions: 0, minutes: -3, passMark: 200 } }),
    { questions: 25, minutes: 30, passMark: 75 }, 'out-of-range values fall back');
});

/* ------------------------------------------------------------ selection */

test('shuffle: is a permutation and does not mutate the source', () => {
  const src = [1, 2, 3, 4, 5];
  const out = core.shuffle(src, seeded(42));
  assert.deepEqual(src, [1, 2, 3, 4, 5], 'source untouched');
  assert.deepEqual([...out].sort((a, b) => a - b), [1, 2, 3, 4, 5], 'same multiset');
});

test('shuffle: deterministic under a seeded rng', () => {
  assert.deepEqual(core.shuffle([0, 1, 2, 3, 4, 5, 6], seeded(7)),
    core.shuffle([0, 1, 2, 3, 4, 5, 6], seeded(7)));
});

test('shuffleOptions: remaps answer to the moved correct option', () => {
  const original = q('x', 2);
  for (let seed = 0; seed < 25; seed++) {
    const s = core.shuffleOptions(original, seeded(seed));
    assert.equal(s.options[s.answer], original.options[original.answer],
      'the option under the new answer index is still the correct text');
    assert.deepEqual([...s.options].sort(), [...original.options].sort(), 'same options');
    assert.deepEqual(original.options, ['A', 'B', 'C', 'D'], 'source not mutated');
  }
});

test('flatten: tags each question with its topic and filters by bank id', () => {
  const all = core.flatten(sampleBanks());
  assert.equal(all.length, 5);
  assert.equal(all[0].topicId, 't1');
  assert.equal(all[0].topicTitle, 'Topic One');
  assert.equal(all[0].topicTitleAr, 'Topic One-ar');
  const onlyT2 = core.flatten(sampleBanks(), ['t2']);
  assert.equal(onlyT2.length, 2);
  assert.ok(onlyT2.every((x) => x.topicId === 't2'));
});

test('pickQuestions: honours count, bank filter, and caps at pool size', () => {
  const picked = core.pickQuestions(sampleBanks(), { count: 3, rand: seeded(1) });
  assert.equal(picked.length, 3);
  const filtered = core.pickQuestions(sampleBanks(), { count: 99, bankIds: ['t1'], rand: seeded(1) });
  assert.equal(filtered.length, 3, 'count capped at available pool');
  assert.ok(filtered.every((x) => x.topicId === 't1'));
});

test('pickQuestions: mixOptions keeps every answer pointing at its correct text', () => {
  const picked = core.pickQuestions(sampleBanks(), { count: 5, mixOptions: true, rand: seeded(3) });
  for (const p of picked) {
    assert.equal(core.validQuestion(p), true);
    assert.equal(typeof p.options[p.answer], 'string');
  }
});

/* ------------------------------------------------------------ scoring */

test('scoreExam: counts correct, answered, percentage and pass', () => {
  const qs = [q('a', 0), q('b', 1), q('c', 2), q('d', 3)];
  const s = core.scoreExam(qs, { 0: 0, 1: 1, 2: 0 /* wrong */ }, 75);
  assert.equal(s.correct, 2);
  assert.equal(s.answered, 3);
  assert.equal(s.total, 4);
  assert.equal(s.pct, 50);
  assert.equal(s.pass, false);
});

test('scoreExam: unanswered count as wrong; empty exam is 0%', () => {
  const qs = [q('a', 0), q('b', 1), q('c', 2), q('d', 3)];
  assert.equal(core.scoreExam(qs, { 0: 0, 1: 1, 2: 2, 3: 3 }, 75).pct, 100);
  assert.equal(core.scoreExam(qs, { 0: 0, 1: 1, 2: 2 }, 75).pass, true, '75% is a pass at passMark 75');
  assert.equal(core.scoreExam([], {}, 75).pct, 0);
});

test('topicBreakdown: per-topic tally sorted weakest first', () => {
  const qs = core.flatten(sampleBanks());        // 3 in t1, 2 in t2
  const answers = {};
  qs.forEach((qq, i) => { answers[i] = qq.answer; });  // all right
  answers[0] = (qs[0].answer + 1) % 4;                 // break one t1 question
  const rows = core.topicBreakdown(qs, answers);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 't1', 'weakest (t1 at 2/3) comes first');
  assert.equal(rows[0].correct, 2);
  assert.equal(rows[0].total, 3);
  assert.equal(rows[0].pct, 67);
  assert.equal(rows[1].id, 't2');
  assert.equal(rows[1].pct, 100);
});

test('examSummary: reports answered, unanswered indices, and sorted flags', () => {
  const s = core.examSummary(5, { 0: 1, 2: 0, 4: 3 }, new Set([4, 1]));
  assert.equal(s.answered, 3);
  assert.deepEqual(s.unanswered, [1, 3]);
  assert.deepEqual(s.flagged, [1, 4]);
});

/* ------------------------------------------------------------ snapshots */

test('snapshot / validSnapshot: round-trips a live exam sitting', () => {
  const state = {
    mode: 'exam',
    questions: [q('a', 0), q('b', 1)],
    answers: { 0: 1 },
    flagged: new Set([1]),
    timerSecs: 900,
    current: 1,
  };
  const snap = core.snapshot(state);
  assert.equal(core.validSnapshot(snap), true);
  assert.deepEqual(snap.flagged, [1]);
  assert.equal(snap.mode, 'exam');
});

test('validSnapshot: rejects wrong version, bad mode, or out-of-range cursor', () => {
  const good = core.snapshot({
    mode: 'practice', questions: [q('a', 0)], answers: {}, flagged: new Set(), timerSecs: 0, current: 0,
  });
  assert.equal(core.validSnapshot(good), true);
  assert.equal(core.validSnapshot(Object.assign({}, good, { v: 99 })), false);
  assert.equal(core.validSnapshot(Object.assign({}, good, { mode: 'nope' })), false);
  assert.equal(core.validSnapshot(Object.assign({}, good, { current: 5 })), false);
  assert.equal(core.validSnapshot(Object.assign({}, good, { questions: [] })), false);
  assert.equal(core.validSnapshot(null), false);
});

/* ------------------------------------------------------------ prompts */

test('buildAskPrompt: English, wrong answer names the mistake and asks for a citation', () => {
  const p = core.buildAskPrompt(q('What is Vso?', 1), 3, 'en');
  assert.match(p, /correct answer is B\)/);
  assert.match(p, /I chose D\)/);
  assert.match(p, /GACAR Part and section/);
});

test('buildAskPrompt: skipped question is described as unanswered', () => {
  const p = core.buildAskPrompt(q('x', 0), null, 'en');
  assert.match(p, /didn't answer it/);
});

test('buildAskPrompt: Arabic framing when lang=ar, question text preserved', () => {
  const p = core.buildAskPrompt(q('ما هو Vso؟', 2), 0, 'ar');
  assert.match(p, /كابتن|لوائح GACAR|الصحيحة/);
  assert.match(p, /ما هو Vso؟/, 'the authored question text is quoted verbatim');
});

test('buildDebriefPrompt: names score and weakest topics', () => {
  const qs = core.flatten(sampleBanks());
  const answers = {};
  qs.forEach((qq, i) => { answers[i] = qq.answer; });
  answers[0] = (qs[0].answer + 1) % 4;   // miss one → t1 weakest, one missed question
  const p = core.buildDebriefPrompt(qs, answers, 75, 'en');
  assert.match(p, /scored \d+% \(4\/5\)/);
  assert.match(p, /weakest topics: Topic One/);
  assert.match(p, /Questions I missed/);
});

test('buildDebriefPrompt: clips very long output under the message cap', () => {
  const big = core.flatten([bank('t1', 'T', [q('x'.repeat(5000), 0)])]);
  const p = core.buildDebriefPrompt(big, { 0: 1 }, 75, 'en');
  assert.ok(p.length <= 1800, 'prompt stays under the brain message cap');
});

/* ------------------------------------------------------------ misc */

test('fmtTime: zero-pads mm:ss and floors negatives to 00:00', () => {
  assert.equal(core.fmtTime(0), '00:00');
  assert.equal(core.fmtTime(65), '01:05');
  assert.equal(core.fmtTime(1800), '30:00');
  assert.equal(core.fmtTime(-5), '00:00');
});

test('letterOf: A–D then falls back to a 1-based number', () => {
  assert.equal(core.letterOf(0), 'A');
  assert.equal(core.letterOf(3), 'D');
  assert.equal(core.letterOf(4), '5');
});
