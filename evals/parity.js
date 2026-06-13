#!/usr/bin/env node
/* ============================================================================
 * Captain Adel — provider parity gate.
 *
 * Runs every case through Gemini AND through a candidate Arabic provider
 * (--provider, default allam), then decides whether it is safe to route
 * Arabic-dominant questions to that provider.
 *
 * The gate, two conditions, both must hold:
 *   (1) ARABIC subset — candidate passes >= Gemini passes
 *       (this is the actual question the auto router decides)
 *   (2) OVERALL — candidate doesn't regress by more than --tol cases
 *       (safety net: an Arabic provider is the cross-provider fallback too)
 *
 * Usage:
 *   GEMINI_API_KEY=...  ALLAM_BASE_URL=...  node evals/parity.js
 *   GEMINI_API_KEY=...  QWEN_BASE_URL=...   node evals/parity.js --provider qwen
 *   ...  node evals/parity.js --category citation
 *   ...  node evals/parity.js --tol 1            allow the candidate to regress by 1 overall
 *   ...  node evals/parity.js --arabic-only      only run Arabic-dominant cases
 *
 * Env (same as run.js):
 *   GEMINI_API_KEY        required
 *   <PROVIDER>_BASE_URL   required for the candidate (e.g. ALLAM_BASE_URL, QWEN_BASE_URL)
 *   <PROVIDER>_API_KEY    optional bearer token for the candidate endpoint
 *   <PROVIDER>_MODEL      served model name override
 *   EVAL_DELAY_MS         pause between Gemini turns (default 4000 — free-tier RPM)
 *
 * Exit code: 0 if the gate passes, 1 otherwise — usable as a CI gate before
 * routing Arabic to the candidate in production.
 * ==========================================================================*/

'use strict';

const { score, loadCases, sleep, isArabicCase } = require('./lib');

const DELAY_MS = parseInt(process.env.EVAL_DELAY_MS, 10) || 4000;

/* ----- arg parsing -------------------------------------------------------- */
function parseArgs(argv) {
  let category = '', tol = 0, arabicOnly = false, provider = 'allam';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--category') category = argv[++i] || '';
    else if (a.startsWith('--category=')) category = a.slice('--category='.length);
    else if (a === '--tol') tol = parseInt(argv[++i], 10) || 0;
    else if (a.startsWith('--tol=')) tol = parseInt(a.slice('--tol='.length), 10) || 0;
    else if (a === '--arabic-only') arabicOnly = true;
    else if (a === '--provider') provider = argv[++i] || 'allam';
    else if (a.startsWith('--provider=')) provider = a.slice('--provider='.length);
  }
  return { category, tol, arabicOnly, provider };
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

async function runOne(brain, provider, c) {
  try {
    const out = await brain.answer(c.question, c.history || [], {
      apiKey: process.env.GEMINI_API_KEY, // ALLaM ignores this; needed only if Gemini is invoked
      provider,
    });
    const checks = score(c.expect, out.answer, out.sources || [], { kind: out.kind });
    return { passed: checks.every((x) => x.ok), checks, err: null };
  } catch (e) {
    const err = String((e && e.message) || e);
    return { passed: false, checks: [{ name: 'engine', ok: false, note: err }], err };
  }
}

async function main() {
  const { category, tol, arabicOnly, provider } = parseArgs(process.argv.slice(2));
  const PROV = provider.toUpperCase();
  const ENV_HINT = provider.toUpperCase() + '_BASE_URL';

  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set — parity needs both providers.');
    console.error('Run:  GEMINI_API_KEY=...  ' + ENV_HINT + '=...  node evals/parity.js --provider ' + provider);
    process.exit(1);
  }
  const cand = require('../src/brain/providers').PROVIDERS[provider];
  if (!cand) {
    console.error('Unknown provider "' + provider + '".');
    process.exit(1);
  }
  if (!(cand.configured && cand.configured())) {
    console.error(provider + ' is not configured — parity needs both providers.');
    console.error('Run:  GEMINI_API_KEY=...  ' + ENV_HINT + '=http://host:8000/v1  node evals/parity.js --provider ' + provider);
    process.exit(1);
  }

  let cases;
  try { cases = loadCases(); }
  catch (err) {
    console.error('cases.json failed validation:', err.message);
    process.exit(1);
  }

  let run = cases;
  if (category) run = run.filter((c) => c.category === category);
  if (arabicOnly) run = run.filter(isArabicCase);
  if (!run.length) {
    console.error('No cases match the requested filter.');
    process.exit(1);
  }

  console.log('Parity gate — Gemini vs ' + PROV + ', ' + run.length + ' case(s)'
    + (category ? ', category=' + category : '')
    + (arabicOnly ? ', arabic-only' : '')
    + ', tol=' + tol + '\n');

  const brain = require('../src/brain');
  const rows = [];

  for (let i = 0; i < run.length; i++) {
    const c = run[i];
    process.stdout.write('  [' + (i + 1) + '/' + run.length + '] ' + c.id + ' ... ');

    const g = await runOne(brain, 'gemini', c);
    // Gemini free-tier RPM courtesy — only between Gemini calls.
    await sleep(DELAY_MS);
    const a = await runOne(brain, provider, c);

    const arabic = isArabicCase(c);
    let verdict;
    if (g.passed && a.passed) verdict = 'match';
    else if (a.passed && !g.passed) verdict = 'improvement';
    else if (g.passed && !a.passed) verdict = 'regression';
    else verdict = 'both-fail';

    rows.push({ c, arabic, cand: a, gemini: g, verdict });

    process.stdout.write(
      (g.passed ? 'G:PASS' : 'G:FAIL') + ' / ' +
      (a.passed ? PROV[0] + ':PASS' : PROV[0] + ':FAIL') + '   ' +
      verdict + (arabic ? ' (arabic)' : '') + '\n'
    );
  }

  /* ----- table ----- */
  console.log('\n' + '='.repeat(78));
  console.log(pad('id', 32) + pad('category', 12) + pad('lang', 6)
    + pad('Gemini', 8) + pad(PROV, 8) + 'verdict');
  console.log('-'.repeat(78));
  for (const r of rows) {
    console.log(
      pad(r.c.id, 32) +
      pad(r.c.category, 12) +
      pad(r.arabic ? 'ar' : 'en', 6) +
      pad(r.gemini.passed ? 'PASS' : 'FAIL', 8) +
      pad(r.cand.passed ? 'PASS' : 'FAIL', 8) +
      r.verdict
    );
  }
  console.log('='.repeat(78));

  /* ----- roll-ups ----- */
  const overall = {
    g: rows.filter((r) => r.gemini.passed).length,
    a: rows.filter((r) => r.cand.passed).length,
    n: rows.length,
  };
  const arabic = rows.filter((r) => r.arabic);
  const arabicRoll = {
    g: arabic.filter((r) => r.gemini.passed).length,
    a: arabic.filter((r) => r.cand.passed).length,
    n: arabic.length,
  };

  console.log('\nOverall  Gemini ' + overall.g + '/' + overall.n
    + '   ' + PROV + ' ' + overall.a + '/' + overall.n);
  if (arabicRoll.n) {
    console.log('Arabic   Gemini ' + arabicRoll.g + '/' + arabicRoll.n
      + '   ' + PROV + ' ' + arabicRoll.a + '/' + arabicRoll.n + '   (the actual gate)');
  } else {
    console.log('Arabic   none in this run — gate cannot be evaluated, exiting 1');
    process.exit(1);
  }

  const byCat = {};
  for (const r of rows) {
    const k = r.c.category;
    byCat[k] = byCat[k] || { g: 0, a: 0, n: 0 };
    byCat[k].n++;
    if (r.gemini.passed) byCat[k].g++;
    if (r.cand.passed) byCat[k].a++;
  }
  console.log('\nBy category:');
  for (const [k, v] of Object.entries(byCat)) {
    console.log('  ' + pad(k, 12) + ' Gemini ' + v.g + '/' + v.n + '   ' + PROV + ' ' + v.a + '/' + v.n);
  }

  /* ----- gate verdict ----- */
  const arabicOk = arabicRoll.a >= arabicRoll.g;
  const overallOk = arabicRoll.n === overall.n || (overall.g - overall.a) <= tol;
  const passed = arabicOk && overallOk;

  console.log('\n' + '='.repeat(78));
  console.log('Arabic gate:   ' + PROV + ' ' + arabicRoll.a + ' vs Gemini ' + arabicRoll.g
    + '   -> ' + (arabicOk ? 'OK' : 'FAIL'));
  if (arabicRoll.n !== overall.n) {
    console.log('Overall gate:  ' + PROV + ' ' + overall.a + ' vs Gemini ' + overall.g
      + ' (tol=' + tol + ')   -> ' + (overallOk ? 'OK' : 'FAIL'));
  }
  console.log('Regressions:   ' + rows.filter((r) => r.verdict === 'regression').length);
  console.log('Improvements:  ' + rows.filter((r) => r.verdict === 'improvement').length);
  console.log('Both fail:     ' + rows.filter((r) => r.verdict === 'both-fail').length);
  console.log('='.repeat(78));

  if (passed) {
    console.log('PARITY OK — safe to route Arabic to ' + PROV
      + ' (ARABIC_PROVIDER=' + provider + ', MODEL_PROVIDER=auto).');
    process.exit(0);
  } else {
    const reasons = [];
    if (!arabicOk) reasons.push(PROV + ' regresses on Arabic subset');
    if (!overallOk) reasons.push('overall regression > tol');
    console.log('PARITY FAIL — keep MODEL_PROVIDER=gemini. Reason: ' + reasons.join('; '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('parity runner crashed:', err);
  process.exit(1);
});
