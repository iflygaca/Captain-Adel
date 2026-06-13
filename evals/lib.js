/* ============================================================================
 * Captain Adel — eval helpers shared by run.js (single-provider) and
 * parity.js (two-provider gate).
 *
 * The scoring code lives here so a parity verdict can NEVER drift from what a
 * solo `node evals/run.js` reports — both runners count PASS/FAIL the same way.
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');

const CASES_FILE = path.join(__dirname, 'cases.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (haystack, needle) =>
  String(haystack).toLowerCase().includes(String(needle).toLowerCase());
const hasArabic = (s) => /[؀-ۿ]/.test(String(s));

/* ----- score one answer against one case's `expect` block ----------------- */
function score(expect, answer, sources) {
  const checks = [];
  const add = (name, ok, note) => checks.push({ name, ok, note: note || '' });
  const text = String(answer || '');

  if (expect.citesPart) {
    const ok = expect.citesPart.some((p) =>
      new RegExp('part\\s*' + p + '\\b', 'i').test(text));
    add('citesPart', ok, 'one of Part ' + expect.citesPart.join('/'));
  }
  if (expect.mustInclude) {
    for (const kw of expect.mustInclude) add('include:' + kw, has(text, kw));
  }
  if (expect.mustIncludeAny) {
    const ok = expect.mustIncludeAny.some((kw) => has(text, kw));
    add('includeAny', ok, expect.mustIncludeAny.join(' | '));
  }
  if (expect.mustNotInclude) {
    for (const kw of expect.mustNotInclude) add('exclude:' + kw, !has(text, kw));
  }
  if (typeof expect.shouldHaveSources === 'boolean') {
    add('sources', (sources.length > 0) === expect.shouldHaveSources,
      'sources=' + sources.length);
  }
  if (expect.answerLang === 'ar') add('answerLang:ar', hasArabic(text));
  if (expect.answerLang === 'en') add('answerLang:en', !hasArabic(text) && text.length > 0);

  return checks;
}

/* ----- load + validate cases --------------------------------------------- */
function loadCases() {
  const raw = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));
  const cases = raw.cases || [];
  let bad = 0;
  for (const c of cases) {
    if (!c.id || !c.question || !c.expect) {
      console.error('  invalid case:', JSON.stringify(c).slice(0, 120));
      bad++;
    }
  }
  if (bad) throw new Error(bad + ' invalid case(s) in cases.json');
  return cases;
}

/* ----- per-case categorisation used by the parity gate ------------------- *
 * "Arabic" cases are those that test the Arabic path — either the question
 * itself is Arabic-dominant or the expect block asserts answerLang:'ar'. The
 * gate's Arabic subset uses this list. */
function isArabicCase(c) {
  if (c && c.expect && c.expect.answerLang === 'ar') return true;
  return hasArabic((c && c.question) || '');
}

module.exports = {
  CASES_FILE,
  sleep,
  has,
  hasArabic,
  score,
  loadCases,
  isArabicCase,
};
