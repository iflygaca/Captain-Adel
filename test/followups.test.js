/* Unit tests — captadel/src/brain/followups.js
 *
 * suggestFollowups is pure and deterministic (no corpus, no network): it turns
 * the answer + sources of a turn into a few "keep exploring" chips, deriving
 * Part-specific suggestions when the answer cites GACAR Parts and falling back
 * to a curated set otherwise. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { suggestFollowups, FALLBACK } = require('../src/brain/followups');

function assertWellShaped(list) {
  assert.ok(Array.isArray(list));
  for (const s of list) {
    for (const k of ['q', 'qAr', 'en', 'ar']) {
      assert.equal(typeof s[k], 'string', `${k} is a string`);
      assert.ok(s[k].length > 0, `${k} is non-empty`);
    }
  }
}

test('derives Part-specific suggestions from a cited source', () => {
  const out = suggestFollowups({
    answer: 'VFR weather minima are in §91.155.',
    sources: [{ part: '91', section: '91.155' }],
    kind: 'grounded',
  });
  assertWellShaped(out);
  assert.equal(out.length, 3);
  assert.ok(out.some((s) => /Part 91\b/.test(s.q)), 'references Part 91');
});

test('picks up a Part named only in the answer prose', () => {
  const out = suggestFollowups({
    answer: 'That recency rule lives in GACAR Part 61.',
    sources: [],
    kind: 'grounded',
  });
  assert.ok(out.some((s) => /Part 61\b/.test(s.q)), 'references Part 61 from prose');
});

test('multiple cited Parts are each represented, in order, with no duplicates', () => {
  const out = suggestFollowups({
    answer: 'See §91.155 and §61.57.',
    sources: [{ part: '91' }, { part: '61' }],
    kind: 'grounded',
    count: 3,
  });
  assert.equal(out.length, 3);
  assert.ok(out.some((s) => /Part 91\b/.test(s.q)), 'Part 91 present');
  assert.ok(out.some((s) => /Part 61\b/.test(s.q)), 'Part 61 present');
  const qs = out.map((s) => s.q);
  assert.equal(new Set(qs).size, qs.length, 'no duplicate prompts');
  // Breadth before depth: Part 91 leads Part 61 (source order).
  assert.ok(out.findIndex((s) => /Part 91\b/.test(s.q)) <
            out.findIndex((s) => /Part 61\b/.test(s.q)));
});

test('refusals fall back to the curated set (no answer context)', () => {
  const out = suggestFollowups({
    answer: "That's an AFM/POH figure for your airframe.",
    sources: [{ part: '91' }],
    kind: 'refusal',
  });
  assert.deepEqual(out, FALLBACK.slice(0, 3));
});

test("non-answers ('na') fall back to the curated set", () => {
  const out = suggestFollowups({ answer: 'On the line, Captain.', sources: [], kind: 'na' });
  assert.deepEqual(out, FALLBACK.slice(0, 3));
});

test('with no cited Parts, fills entirely from the curated set', () => {
  const out = suggestFollowups({ answer: 'A general note with no Part cited.', sources: [], kind: 'grounded' });
  assert.deepEqual(out, FALLBACK.slice(0, 3));
});

test('always returns exactly `count` well-shaped, bilingual items', () => {
  const out = suggestFollowups({
    answer: '§91.155 applies.',
    sources: [{ part: '91' }],
    kind: 'grounded',
    count: 4,
  });
  assert.equal(out.length, 4);
  assertWellShaped(out);
});

test('an unknown Part number degrades to a bare "Part N" label, no throw', () => {
  const out = suggestFollowups({
    answer: 'See GACAR Part 999 for that.',
    sources: [{ part: '999' }],
    kind: 'grounded',
  });
  assertWellShaped(out);
  const chips = out.filter((s) => /Part 999\b/.test(s.q));
  assert.ok(chips.length >= 1, 'has at least one Part 999 chip');
  // Bare "Part 999" — no em-dash topic suffix invented for an unknown Part.
  assert.ok(chips.every((s) => !s.en.includes('—')), 'no fabricated topic label');
});

test('no args / empty input is safe and still returns the fallback', () => {
  assert.deepEqual(suggestFollowups(), FALLBACK.slice(0, 3));
  assert.deepEqual(suggestFollowups({}), FALLBACK.slice(0, 3));
});
