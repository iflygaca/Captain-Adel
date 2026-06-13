#!/usr/bin/env node
/* ============================================================================
 * Captain Adel — eval runner.
 *
 * Runs every case in cases.json through the real brain (src/brain) and scores
 * each answer against its heuristic assertions. The score is a regression
 * signal — keyword + shape checks, not a human judgement.
 *
 * Usage:
 *   GEMINI_API_KEY=...  node evals/run.js                     whole suite (Gemini)
 *   GEMINI_API_KEY=...  node evals/run.js citation            one category
 *   ALLAM_BASE_URL=...  node evals/run.js --provider allam    run against ALLaM
 *   GEMINI_API_KEY=...  node evals/run.js --faithfulness      add the groundedness
 *                                                             metric (extra judge calls)
 *   node evals/run.js --dry                                   validate cases.json only
 *
 * Env:
 *   GEMINI_API_KEY        required for a live Gemini / auto run (and the judge)
 *   ALLAM_BASE_URL        required for a live --provider allam run
 *   CAPTAIN_ADEL_MODEL    optional Gemini model override (default gemini-2.5-flash)
 *   EVAL_DELAY_MS         pause between turns (default 4000 — free-tier RPM)
 *   EVAL_JUDGE_MODEL      faithfulness judge model (default gemini-2.5-flash)
 *   EVAL_NO_CACHE         set to skip the judge result cache (evals/.cache/)
 *
 * The pass/fail keyword score and exit code are unchanged by --faithfulness; the
 * groundedness mean is reported alongside as an additional signal.
 *
 * Exit code: 0 if every case passes, 1 otherwise — usable as a CI gate.
 * ==========================================================================*/

'use strict';

const { score, loadCases, sleep } = require('./lib');

const DELAY_MS = parseInt(process.env.EVAL_DELAY_MS, 10) || 4000;
const fmtFaith = (v) => (typeof v === 'number' ? v.toFixed(2) : 'n/a');

/* ----- arg parsing -------------------------------------------------------- */
function parseArgs(argv) {
  let dry = false, provider = '', filter = '', faithfulness = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') dry = true;
    else if (a === '--faithfulness') faithfulness = true;
    else if (a === '--provider') provider = argv[++i] || '';
    else if (a.startsWith('--provider=')) provider = a.slice('--provider='.length);
    else if (!a.startsWith('--')) filter = a;
  }
  return { dry, provider, filter, faithfulness };
}

async function main() {
  const { dry, provider, filter, faithfulness } = parseArgs(process.argv.slice(2));

  let cases;
  try {
    cases = loadCases();
  } catch (err) {
    console.error('cases.json failed validation:', err.message);
    process.exit(1);
  }
  console.log('cases.json — ' + cases.length + ' cases, structure valid.');
  if (dry) { console.log('--dry: validation only, not calling the model.'); return; }

  const liveProvider = provider || 'gemini';
  if (liveProvider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      console.error('\nGEMINI_API_KEY is not set — cannot run a live eval.');
      console.error('Run:  GEMINI_API_KEY=your_key  node evals/run.js');
      process.exit(1);
    }
  } else {
    const p = require('../src/brain/providers').PROVIDERS[liveProvider];
    if (!p) {
      console.error('\nUnknown provider "' + liveProvider + '".');
      process.exit(1);
    }
    if (!(p.configured && p.configured())) {
      const envHint = liveProvider.toUpperCase() + '_BASE_URL';
      console.error('\n' + liveProvider + ' is not configured — cannot run a live eval.');
      console.error('Run:  ' + envHint + '=http://host:8000/v1  node evals/run.js --provider ' + liveProvider);
      process.exit(1);
    }
  }

  if (faithfulness && !process.env.GEMINI_API_KEY) {
    console.error('\n--faithfulness needs GEMINI_API_KEY for the groundedness judge.');
    process.exit(1);
  }

  const brain = require('../src/brain');
  const faith = faithfulness ? require('./checks/citation-faithfulness') : null;
  const run = filter ? cases.filter((c) => c.category === filter) : cases;
  if (!run.length) {
    console.error('No cases match category "' + filter + '".');
    process.exit(1);
  }

  console.log('Running ' + run.length + ' case(s)'
    + (filter ? ' in category "' + filter + '"' : '')
    + ' on provider "' + liveProvider + '"'
    + (faith ? ' [+faithfulness, judge=' + faith.JUDGE_MODEL + ']' : '') + '...\n');

  const results = [];
  for (let i = 0; i < run.length; i++) {
    const c = run[i];
    let checks, faithResult = null, err = null;
    try {
      const out = await brain.answer(c.question, [], {
        apiKey: process.env.GEMINI_API_KEY,
        provider: provider || undefined,
      });
      checks = score(c.expect, out.answer, out.sources || []);
      if (faith) {
        faithResult = await faith.scoreAnswer(
          { answer: out.answer, sources: out.sources || [] },
          { apiKey: process.env.GEMINI_API_KEY });
      }
    } catch (e) {
      err = String((e && e.message) || e);
      checks = [{ name: 'agent', ok: false, note: err }];
    }
    const passed = checks.every((x) => x.ok);
    const faithScore = faithResult ? faithResult.score : undefined;
    results.push({ c, checks, passed, faithScore });

    const mark = passed ? 'PASS' : 'FAIL';
    let line = mark + '  [' + c.category + ']  ' + c.id;
    if (faith) line += '   faith=' + fmtFaith(faithScore);
    console.log(line);
    if (!passed) {
      for (const x of checks.filter((x) => !x.ok)) {
        console.log('        x ' + x.name + (x.note ? '  (' + x.note + ')' : ''));
      }
    }
    if (faithResult && typeof faithScore === 'number') {
      // surface unsupported / weakly-supported claims so a low score is actionable
      for (const cl of faithResult.claims.filter((x) => x.score < 1)) {
        console.log('        ~ ' + cl.verdict + ': ' + cl.claim.slice(0, 90));
      }
    }
    if (i < run.length - 1) await sleep(DELAY_MS);
  }
  if (faith) faith.flushCache();

  /* ----- summary ----- */
  const pass = results.filter((r) => r.passed).length;
  const byCat = {};
  for (const r of results) {
    const k = r.c.category;
    byCat[k] = byCat[k] || { pass: 0, total: 0, faith: [] };
    byCat[k].total++;
    if (r.passed) byCat[k].pass++;
    if (typeof r.faithScore === 'number') byCat[k].faith.push(r.faithScore);
  }
  console.log('\n' + '='.repeat(48));
  console.log('RESULT  ' + pass + '/' + results.length + ' cases passed');
  for (const [k, v] of Object.entries(byCat)) {
    let row = '  ' + k.padEnd(12) + v.pass + '/' + v.total;
    if (faith) row += '   faith=' + fmtFaith(faith.runMean(v.faith));
    console.log(row);
  }
  if (faith) {
    console.log('-'.repeat(48));
    console.log('  faithfulness mean (N/A excluded): '
      + fmtFaith(faith.runMean(results.map((r) => r.faithScore))));
  }
  console.log('='.repeat(48));
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error('eval runner crashed:', err);
  process.exit(1);
});
