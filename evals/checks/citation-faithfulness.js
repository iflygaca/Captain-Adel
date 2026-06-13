/* ============================================================================
 * Fly GACA — Captain Adel citation-faithfulness checker.
 *
 * Wave 1 / Workstream A of the eval upgrade. Given a model answer and the
 * citations it carries, this measures groundedness: are the answer's
 * regulatory claims actually supported by the GACAR text it cites?
 *
 * Today's eval (evals/run.js) scores answers with keyword + shape heuristics.
 * Those catch "did the right word appear", not "is this claim true given the
 * cited section". This module adds the missing signal.
 *
 * Pipeline:
 *   1. extractCitations(answer + sources)  -> [{ part, section }]
 *   2. gatherEvidence(...)                 -> union of cited section text,
 *      re-resolved from the corpus via bm25.lookupCitation (offline), OR
 *      taken from `citedTexts` when the caller already has the passages
 *      (online runtime guard — Wave 3).
 *   3. splitClaims(answer)                 -> the sentences that assert a rule
 *      (a number+unit, a strong obligation modal, or a § reference), with
 *      refusal/hedge sentences excluded so a clean refusal scores N/A, not 0.
 *   4. judge(passage, claim)               -> yes | partial | no   (LLM-judge,
 *      injectable; the default calls Gemini Flash, pinned + temp 0).
 *   5. score = supported / total_claims    (yes=1, partial=0.5, no=0).
 *      total_claims === 0 -> score null (N/A), excluded from the run mean.
 *
 * The judge is injectable so the deterministic parts are testable with no API
 * key:  node evals/checks/citation-faithfulness.js --selftest
 *
 * Bilingual: claim/unit/modal markers cover EN and AR.
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const bm25 = require('../../src/brain/bm25');

/* Resolve @google/genai lazily so this module loads (and self-tests) without the
 * SDK present — it is a dependency of this service, installed via npm install. */
function loadGenAI() {
  return require('@google/genai');
}

const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || 'gemini-2.5-flash';
const VERDICT_SCORE = { yes: 1, partial: 0.5, no: 0 };
const MAX_PASSAGE_CHARS = 8000;   // bound the judge prompt
const CACHE_DIR  = path.join(__dirname, '..', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'faithfulness.json');

/* ----------------------------------------------------------------------------
 * Citation extraction.
 *
 * The agent cites in the form "GACAR Part 91, §91.167". The answer body may
 * also reference sections more loosely ("§91.167", "Part 91, 91.167", "GACAR
 * 121.1205"). We pull every (part, section) pair we can; title-only citations
 * ("GACAR Handbook — Air Operator…", "GACAR Part 67 — Medical Standards…")
 * carry no section and are deliberately ignored — they cannot be re-resolved
 * to a single passage via lookupCitation.
 * --------------------------------------------------------------------------*/

// "Part 91, §91.167" / "Part 91 §91.167(a)" / "Part 91, 91.167"
const CITE_PART_SECTION = /part\s+(\d+)\s*,?\s*§?\s*(\d+\.\d+(?:\.\d+)?(?:\([^)]*\))?)/gi;
// Bare "§91.167" / "GACAR 91.167" with no explicit Part — infer the Part from
// the section's leading number (GACAR sections are <part>.<n>).
const CITE_BARE_SECTION = /§\s*(\d+)\.(\d+(?:\.\d+)?(?:\([^)]*\))?)/g;

function extractCitations(text) {
  const s = String(text || '');
  const out = [];
  const seen = new Set();
  const push = (part, section) => {
    const key = part + '|' + section.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ part: String(part), section: String(section) });
  };

  let m;
  CITE_PART_SECTION.lastIndex = 0;
  while ((m = CITE_PART_SECTION.exec(s)) !== null) push(m[1], m[2]);

  CITE_BARE_SECTION.lastIndex = 0;
  while ((m = CITE_BARE_SECTION.exec(s)) !== null) push(m[1], m[1] + '.' + m[2]);

  return out;
}

/* ----------------------------------------------------------------------------
 * Evidence — the union of cited-section text.
 * --------------------------------------------------------------------------*/

/**
 * Resolve every cited (part, section) to its corpus passage and concatenate.
 *   { answer, sources, citedTexts }
 *     answer      the model answer (citations parsed from it + sources)
 *     sources     [{ citation, url }] as returned by agent.answer()
 *     citedTexts  optional [str] — actual retrieved passages, if the caller
 *                 already has them (runtime guard); used as-is, no re-resolve.
 * Returns { passage, citations:[str], resolved:[str], unresolved:[str] }.
 */
function gatherEvidence({ answer = '', sources = [], citedTexts = null } = {}) {
  if (Array.isArray(citedTexts) && citedTexts.length) {
    const passage = citedTexts.join('\n\n').slice(0, MAX_PASSAGE_CHARS);
    return { passage, citations: [], resolved: citedTexts.slice(), unresolved: [] };
  }

  const citeText = String(answer || '') + '\n' +
    sources.map((s) => (s && s.citation) || '').join('\n');
  const cites = extractCitations(citeText);

  const parts = [];
  const resolved = [];
  const unresolved = [];
  for (const { part, section } of cites) {
    const hit = bm25.lookupCitation(part, section);
    const label = `GACAR Part ${part}, §${section}`;
    if (hit && hit.found && hit.text) { parts.push(hit.text); resolved.push(label); }
    else unresolved.push(label);
  }

  // Title-only sources (handbooks, Part-without-section) that we could not turn
  // into a (part, section) pair are surfaced too, so a low score caused by
  // "answer cited only a handbook title" is distinguishable from a fabrication.
  for (const s of sources) {
    const c = (s && s.citation) || '';
    if (c && !/§/.test(c) && extractCitations(c).length === 0) unresolved.push(c);
  }

  return {
    passage: parts.join('\n\n').slice(0, MAX_PASSAGE_CHARS),
    citations: cites.map((c) => `GACAR Part ${c.part}, §${c.section}`),
    resolved,
    unresolved,
  };
}

/* ----------------------------------------------------------------------------
 * Claim extraction.
 *
 * A sentence is a regulatory claim if it asserts something checkable: a number
 * with a unit, a strong obligation modal, or a § section reference. Refusal /
 * hedge sentences are excluded first — "I can't verify that figure" must not
 * count as an (unsupported) claim, or every correct refusal would score 0.
 * --------------------------------------------------------------------------*/

// Number (Western or Arabic-Indic digits, with thousands/decimal) + a unit.
const NUM = '[0-9\\u0660-\\u0669][0-9\\u0660-\\u0669.,]*';
const UNITS = [
  'ft', 'feet', 'foot', 'nm', 'sm', 'km', 'm', 'metre', 'metres', 'meter', 'meters',
  'kt', 'kts', 'knot', 'knots', 'lb', 'lbs', 'kg', 'hpa', 'inhg', 'hours?', 'hrs?',
  'minutes?', 'mins?', 'seconds?', 'days?', 'weeks?', 'months?', 'years?', 'nautical',
  // Arabic units
  'قدم', 'متر', 'كم', 'عقدة', 'عقدا?ت', 'دقيقة', 'دقائق', 'ساعة', 'ساعات', 'يوم', 'أيام', 'سنة', 'سنوات', 'شهر', 'أشهر',
].join('|');
const NUM_UNIT_RE = new RegExp('(?:^|[^.\\d])' + NUM + '\\s*(?:' + UNITS + ')\\b', 'iu');

// Strong obligation language — EN + AR.
const MODAL_RE = /\b(?:shall|must(?:\s+not)?|may\s+not|no\s+person\s+may|is\s+prohibited|are\s+prohibited|is\s+required|are\s+required|not\s+less\s+than|not\s+more\s+than|at\s+least|no\s+later\s+than|minimum|maximum)\b|يجب|لا\s*يجوز|يُ?حظر|يُشترط|يُمنع|الحد\s*الأدنى|الحد\s*الأقصى/iu;

// A § section reference makes a sentence a claim; a bare "Part 91" does NOT
// (so refusals that merely name a Part to check are not flagged).
const SECTION_REF_RE = /§\s*\d+\.\d+/;

// Sentences that signal a refusal / hedge / pointer — never claims.
const HEDGE_RE = /\b(?:can(?:'|no)?t\s+verify|cannot\s+verify|don'?t\s+have|do\s+not\s+have|not\s+able\s+to|unable\s+to|verify\s+(?:in|against|with)|before\s+you\s+rely|rely\s+on\s+(?:this|it)|outside\s+the\s+library|only\s+gaca|refer\s+to\s+the\s+(?:afm|poh|operator)|official\s+source|i\s+don'?t\s+know|no\s+such\s+(?:part|section)|i'?m\s+here\s+for\s+aviation)\b|لا\s*أستطيع\s*التحقق|تحقق\s*في|راجع\s*دليل|المصدر\s*الرسمي/iu;

// Lines that are citation lists, not prose claims (the answer template's
// **Cite:** / **See also:** rows). Skipped for claim detection only.
const META_LINE_RE = /^(?:cite|see\s*also|sources?|المصدر|انظر\s*أيضا)\s*:/i;

function stripMarkdown(s) {
  return String(s || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // [text](url) -> text
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // **bold** -> bold
    .replace(/[*_`]/g, '');
}

/** Split into candidate sentences across lines, bullets and terminators. */
function intoSentences(answer) {
  const lines = stripMarkdown(answer).split(/\r?\n/);
  const sentences = [];
  for (let line of lines) {
    line = line.replace(/^\s*[-•*]\s+/, '').trim();       // strip bullet marker
    if (!line) continue;
    if (META_LINE_RE.test(line)) continue;               // skip Cite:/See also:
    // Strip a leading template label ("Short answer:", "Detail:") then split.
    line = line.replace(/^\s*[A-Za-z؀-ۿ ]{1,18}:\s*/, (lbl) =>
      /^(short\s*answer|detail|answer|الإجابة|التفصيل)/i.test(lbl.trim()) ? '' : lbl);
    for (const part of line.split(/(?<=[.!?؟。])\s+/)) {
      const t = part.trim();
      if (t.length >= 3) sentences.push(t);
    }
  }
  return sentences;
}

function isClaim(sentence) {
  if (HEDGE_RE.test(sentence)) return false;
  return NUM_UNIT_RE.test(sentence) || MODAL_RE.test(sentence) || SECTION_REF_RE.test(sentence);
}

function splitClaims(answer) {
  return intoSentences(answer).filter(isClaim);
}

/* ----------------------------------------------------------------------------
 * The judge — does PASSAGE support CLAIM?  yes | partial | no.
 * Default impl calls Gemini Flash (pinned, temp 0). Injectable for tests.
 * --------------------------------------------------------------------------*/

const JUDGE_PROMPT = (passage, claim) =>
  'You verify whether a regulatory PASSAGE supports a CLAIM made by an ' +
  'assistant. Reply with exactly one word — yes, partial, or no.\n' +
  '- yes: the passage directly states or clearly entails the claim.\n' +
  '- partial: the passage supports part of the claim, or supports it weakly.\n' +
  '- no: the passage does not support the claim, or contradicts it.\n' +
  'Judge only against the passage; do not use outside knowledge.\n\n' +
  'PASSAGE:\n"""\n' + passage + '\n"""\n\n' +
  'CLAIM:\n"""\n' + claim + '\n"""\n\nAnswer:';

function parseVerdict(raw) {
  const w = String(raw || '').trim().toLowerCase();
  if (w.startsWith('yes')) return 'yes';
  if (w.startsWith('partial')) return 'partial';
  if (w.startsWith('no')) return 'no';
  return 'no';   // unparseable -> conservative
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isRateLimit = (e) =>
  /\b429\b|resource_exhausted|rate.?limit|quota|too\s+many\s+requests/i.test(
    String((e && e.message) || e));

async function defaultJudge(passage, claim, opts = {}) {
  if (!passage) return 'no';   // nothing cited -> nothing supports it
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY required for the default judge');
  const model = opts.model || JUDGE_MODEL;

  const cached = cacheGet(model, passage, claim);
  if (cached) return cached;

  const { GoogleGenAI } = loadGenAI();
  const ai = new GoogleGenAI({ apiKey });
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : 4;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: JUDGE_PROMPT(passage, claim) }] }],
        // gemini-2.5-flash is a thinking model: thinking tokens count against
        // maxOutputTokens, so a tiny budget returns empty text (finishReason
        // MAX_TOKENS) and every verdict collapses to "no". Disable thinking — the
        // judgement is a one-word lookup, not a reasoning task — and leave headroom.
        config: { temperature: 0, maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } },
      });
      const text = (resp && resp.candidates && resp.candidates[0]
        && resp.candidates[0].content && resp.candidates[0].content.parts
        && resp.candidates[0].content.parts.map((p) => p.text || '').join('')) || '';
      const verdict = parseVerdict(text);
      cacheSet(model, passage, claim, verdict);
      return verdict;
    } catch (e) {
      lastErr = e;
      if (!isRateLimit(e) || attempt === maxRetries) throw e;
      // Exponential backoff with jitter: 1s, 2s, 4s, 8s (+/- jitter), capped.
      await sleep(Math.min(16000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500));
    }
  }
  throw lastErr;
}

/* ----------------------------------------------------------------------------
 * Disk cache — keyed on (model, passage, claim) so re-runs don't re-pay.
 * EVAL_NO_CACHE=1 disables it.
 * --------------------------------------------------------------------------*/

let _cache = null;
function cacheLoad() {
  if (_cache) return _cache;
  _cache = {};
  if (process.env.EVAL_NO_CACHE) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (_) {}
  return _cache;
}
function cacheKey(model, passage, claim) {
  return crypto.createHash('sha256').update(model + '\0' + passage + '\0' + claim).digest('hex');
}
function cacheGet(model, passage, claim) {
  if (process.env.EVAL_NO_CACHE) return null;
  return cacheLoad()[cacheKey(model, passage, claim)] || null;
}
function cacheSet(model, passage, claim, verdict) {
  if (process.env.EVAL_NO_CACHE) return;
  cacheLoad()[cacheKey(model, passage, claim)] = verdict;
}
function flushCache() {
  if (process.env.EVAL_NO_CACHE || !_cache) return;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(_cache));
  } catch (_) {}
}

/* ----------------------------------------------------------------------------
 * Score one answer.
 * --------------------------------------------------------------------------*/

/**
 * scoreAnswer({ answer, sources, citedTexts }, { judge, apiKey, model })
 *   -> { score, naReason?, claims:[{ claim, verdict, score }],
 *        evidence:{ resolved, unresolved } }
 * score is null (N/A) when there are no regulatory claims to check.
 */
async function scoreAnswer(input, opts = {}) {
  const { answer = '', sources = [], citedTexts = null } = input || {};
  const judge = opts.judge || defaultJudge;

  const claims = splitClaims(answer);
  const evidence = gatherEvidence({ answer, sources, citedTexts });

  if (claims.length === 0) {
    return {
      score: null,
      naReason: 'no regulatory claims to verify',
      claims: [],
      evidence: { resolved: evidence.resolved, unresolved: evidence.unresolved },
    };
  }

  const scored = [];
  let sum = 0;
  for (const claim of claims) {
    const verdict = await judge(evidence.passage, claim, opts);
    const s = VERDICT_SCORE[verdict] != null ? VERDICT_SCORE[verdict] : 0;
    sum += s;
    scored.push({ claim, verdict, score: s });
  }

  return {
    score: sum / claims.length,
    claims: scored,
    evidence: { resolved: evidence.resolved, unresolved: evidence.unresolved },
  };
}

/** Mean faithfulness over a set of scoreAnswer results, skipping N/A. */
function runMean(scores) {
  const vals = scores.filter((s) => typeof s === 'number');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

module.exports = {
  extractCitations,
  gatherEvidence,
  intoSentences,
  isClaim,
  splitClaims,
  defaultJudge,
  scoreAnswer,
  runMean,
  flushCache,
  parseVerdict,
  VERDICT_SCORE,
  JUDGE_MODEL,
};

/* ----------------------------------------------------------------------------
 * CLI:  --selftest    deterministic checks, no API key needed.
 * --------------------------------------------------------------------------*/

async function selftest() {
  let failures = 0;
  const ok = (name, cond, detail) => {
    console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '  -> ' + detail));
    if (!cond) failures++;
  };
  const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want),
    'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));

  // 1. Citation extraction across the real formats.
  eq('extract: Part+section', extractCitations('See GACAR Part 91, §91.167 for this.'),
    [{ part: '91', section: '91.167' }]);
  eq('extract: subsection', extractCitations('GACAR Part 61, §61.133(a)'),
    [{ part: '61', section: '61.133(a)' }]);
  eq('extract: bare §', extractCitations('per §121.1205 of the regs'),
    [{ part: '121', section: '121.1205' }]);
  eq('extract: title-only ignored', extractCitations('GACAR Handbook — Air Operator'), []);

  // 2. Claim detection — flags numeric/modal/§, skips hedges + cite lines.
  ok('claim: number+unit', isClaim('A private pilot applicant must be at least 17 years of age.'));
  ok('claim: section ref', isClaim('The rule is in §91.167.'));
  ok('hedge not a claim', !isClaim("I can't verify that figure — check Part 91."));
  ok('bare Part not a claim', !isClaim('Search Part 91 in the Fly GACA library.'));

  const claims = splitClaims(
    '**Short answer:** A PPL applicant must be at least 17 years of age (GACAR Part 61, §61.133).\n' +
    '**Detail:**\n- The minimum age is 17.\n- I can\'t verify the exact medical requirement here.\n' +
    '**Cite:** GACAR Part 61, §61.133');
  ok('splitClaims drops hedge + Cite line', claims.length === 2,
    'flagged ' + claims.length + ' claims: ' + JSON.stringify(claims));

  // 3. Evidence resolution against the real corpus.
  const ev = gatherEvidence({ answer: 'See GACAR Part 61, §61.133.', sources: [] });
  ok('evidence resolves real section', /17 years/i.test(ev.passage),
    'passage head: ' + ev.passage.slice(0, 80));
  const evMiss = gatherEvidence({ answer: 'See GACAR Part 91, §91.155.', sources: [] });
  ok('evidence: unresolvable cite tracked', evMiss.unresolved.length === 1 && !evMiss.passage,
    JSON.stringify(evMiss.unresolved));

  // 4. Scoring with a deterministic stub judge.
  const stub = async (_passage, claim) => /17 years/i.test(claim) ? 'yes' : 'partial';
  const r1 = await scoreAnswer(
    { answer: 'Must be at least 17 years of age (§61.133). It is required to hold a medical (§61.23).', sources: [] },
    { judge: stub });
  ok('score: 2 claims yes+partial = 0.75', r1.score === 0.75, 'score=' + r1.score);

  const r2 = await scoreAnswer(
    { answer: "I can't verify that figure. Search Part 91 in the library.", sources: [] },
    { judge: stub });
  ok('score: pure refusal is N/A (null)', r2.score === null, 'score=' + r2.score);

  // 5. runMean skips N/A.
  ok('runMean skips null', runMean([1, 0.5, null, 0]) === 0.5,
    'got ' + runMean([1, 0.5, null, 0]));

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all self-tests passed'));
  process.exit(failures ? 1 : 0);
}

if (require.main === module) {
  if (process.argv.includes('--selftest')) {
    selftest().catch((e) => { console.error(e); process.exit(1); });
  } else {
    console.log('Usage: node evals/checks/citation-faithfulness.js --selftest');
    console.log('(import { scoreAnswer } from this module to score answers in a run)');
  }
}
