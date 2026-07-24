/* ============================================================================
 * Captain Adel — grounding & source shaping.
 *
 * Turns a raw { answer, sources:[{citation,url}] } turn into the v1 response
 * contract the GACAR.console UI reads (see docs/data-contract.md):
 *
 *   { answer, kind, refusalClass, grounding:{ state, score, mode, claims,
 *     resolved, unresolved }, sources:[{ …, part, section, sectionAnchor,
 *     verbatim, corpusVersion }], meta }
 *
 * Two grounding MODES:
 *   'structural'   (default) — pure, no network. kind is derived from whether
 *                  the answer's regulatory claims are cited and whether those
 *                  cites resolved to corpus text. Catches fabricated/uncited
 *                  claims. Does NOT catch a cited-but-wrong number.
 *   'faithfulness' (opt-in via opts.grounding==='faithfulness' or
 *                  ADEL_GROUNDING=faithfulness) — additionally runs the eval
 *                  faithfulness judge (LLM, per-claim) over the passages we
 *                  already hold, so a cited-but-wrong claim is downgraded to
 *                  partial. Costs one cached judge call per claim; gated off by
 *                  default because the live key is rate-limited.
 *
 * This module lives in src/brain (the single source of truth). It does NOT
 * statically depend on evals/ — the faithfulness path is lazy-required and
 * degrades to 'structural' if the module or an API key is unavailable.
 * ==========================================================================*/

'use strict';

const { suggestFollowups } = require('./followups');

const MAX_VERBATIM = 600;

// How many sources the UI shows. Retrieval may hand us more (topK), and grounding
// derivation below reads ALL of them for accuracy, but a wall of cites buries the
// answer — so the response surfaces only the top few, in retrieval order. Tunable
// via ADEL_MAX_SOURCES; 0 or unset keeps the default.
const MAX_SOURCES = Math.max(1, parseInt(process.env.ADEL_MAX_SOURCES, 10) || 3);

/* ----------------------------------------------------------------------------
 * Source shaping — the single place the source object shape is defined.
 * Inputs are already in hand at every call site (the BM25 hit), so this only
 * surfaces what retrieval already computed and then discarded.
 * --------------------------------------------------------------------------*/

// "Part 91 §91.155(a)(2)" / "part 61, 61.57" — a named Part + section.
const REF_RE = /\bpart\s+(\d+)\b[^0-9]{0,12}§?\s*(\d+\.\d+(?:\.\d+)?(?:\([^)]*\))?)/i;

function makeSource(citation, url, text, version) {
  const cite = citation || url || '';
  const anchor = String(url || '');
  const frag = anchor.includes('#') ? anchor.split('#')[1].replace(/-\d+$/, '') : '';
  const m = REF_RE.exec(String(cite));
  return {
    citation: cite,
    url: url || '',
    part: m ? m[1] : null,
    section: m ? m[2] : null,
    sectionAnchor: frag || (m ? m[2] : null),
    verbatim: text ? String(text).slice(0, MAX_VERBATIM) : null,
    corpusVersion: version || null,
  };
}

/* Append a makeSource() result to `sources` unless the (citation, anchor) pair
 * is already present. Chunk anchors like #91.155-2 dedupe to their section
 * (#91.155), so two chunks of one section yield one source. */
function pushSource(sources, seen, citation, url, text, version) {
  if (!citation && !url) return;
  let anchor = String(url || '');
  if (anchor.includes('#')) anchor = anchor.replace(/-\d+$/, '');
  const key = (citation ? citation.trim().toLowerCase() : '') + '|' + anchor;
  if (seen.has(key)) return;
  seen.add(key);
  sources.push(makeSource(citation, url, text, version));
}

/* ----------------------------------------------------------------------------
 * Citation + claim extraction (self-contained; mirrors the well-tested regexes
 * in evals/checks/citation-faithfulness.js, kept here so brain has no eval dep).
 * --------------------------------------------------------------------------*/

const CITE_PART_SECTION = /part\s+(\d+)\s*,?\s*§?\s*(\d+\.\d+(?:\.\d+)?(?:\([^)]*\))?)/gi;
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

const NUM = '[0-9\\u0660-\\u0669][0-9\\u0660-\\u0669.,]*';
const UNITS = [
  'ft', 'feet', 'foot', 'nm', 'sm', 'km', 'm', 'metre', 'metres', 'meter', 'meters',
  'kt', 'kts', 'knot', 'knots', 'kias', 'ktas', 'fpm', 'lb', 'lbs', 'kg', 'hpa', 'inhg',
  '%', 'percent', 'hours?', 'hrs?',
  'minutes?', 'mins?', 'seconds?', 'days?', 'weeks?', 'months?', 'years?', 'nautical',
  'قدم', 'متر', 'كم', 'عقدة', 'دقيقة', 'دقائق', 'ساعة', 'ساعات', 'يوم', 'أيام', 'سنة', 'سنوات', 'شهر', 'أشهر', 'بالمئة',
].join('|');
// Trailing guard is a "not a letter" lookahead rather than \b so non-word units
// like "%" still anchor (a \b after "%" never matches before a space).
const NUM_UNIT_RE = new RegExp(
  '(?:^|[^.\\d])' + NUM + '\\s*(?:' + UNITS + ')(?![a-z\\u0600-\\u06ff])', 'iu');
const MODAL_RE = /\b(?:shall|must(?:\s+not)?|may\s+not|no\s+person\s+may|is\s+prohibited|are\s+prohibited|is\s+required|are\s+required|not\s+less\s+than|not\s+more\s+than|no\s+more\s+than|no\s+less\s+than|no\s+fewer\s+than|no\s+greater\s+than|not\s+exceeding|in\s+excess\s+of|at\s+least|no\s+later\s+than|minimum|maximum)\b|يجب|لا\s*يجوز|يُ?حظر|يُشترط|يُمنع|الحد\s*الأدنى|الحد\s*الأقصى|على\s*الأقل|بحدّ?\s*أقصى|أكثر\s*من|أقل\s*من/iu;
// Regulatory thresholds written symbolically: "≥ 17", "<= 5". Bare >/< and "up to"
// are intentionally excluded — too noisy outside a comparison-operator context.
const COMPARISON_RE = new RegExp('(?:\\u2265|\\u2264|>=|<=|=>)\\s*' + NUM, 'u');
const SECTION_REF_RE = /§\s*\d+\.\d+/;
const HEDGE_RE = /\b(?:can(?:'|no)?t\s+verify|cannot\s+verify|don'?t\s+have|do\s+not\s+have|not\s+able\s+to|unable\s+to|verify\s+(?:in|against|with)|before\s+you\s+rely|rely\s+on\s+(?:this|it)|outside\s+the\s+library|only\s+gaca|refer\s+to\s+the\s+(?:afm|poh|operator)|official\s+source|i\s+don'?t\s+know|no\s+such\s+(?:part|section)|i'?m\s+here\s+for\s+aviation)\b|لا\s*أستطيع\s*التحقق|تحقق\s*في|راجع\s*دليل|المصدر\s*الرسمي/iu;
const META_LINE_RE = /^(?:cite|see\s*also|sources?|المصدر|انظر\s*أيضا)\s*:/i;

function stripMarkdown(s) {
  return String(s || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_`]/g, '');
}
function intoSentences(answer) {
  const out = [];
  for (let line of stripMarkdown(answer).split(/\r?\n/)) {
    line = line.replace(/^\s*[-•*]\s+/, '').trim();
    if (!line || META_LINE_RE.test(line)) continue;
    line = line.replace(/^\s*[A-Za-z؀-ۿ ]{1,18}:\s*/, (lbl) =>
      /^(short\s*answer|detail|answer|الإجابة|التفصيل)/i.test(lbl.trim()) ? '' : lbl);
    for (const part of line.split(/(?<=[.!?؟。])\s+/)) {
      const t = part.trim();
      if (t.length >= 3) out.push(t);
    }
  }
  return out;
}
function isClaim(sentence) {
  if (HEDGE_RE.test(sentence)) return false;
  return NUM_UNIT_RE.test(sentence) || MODAL_RE.test(sentence) ||
    COMPARISON_RE.test(sentence) || SECTION_REF_RE.test(sentence);
}
function splitClaims(answer) {
  return intoSentences(answer).filter(isClaim);
}

/* ----------------------------------------------------------------------------
 * Refusal classification (taxonomy ids from docs/refusal-taxonomy.md).
 * Phase 1 heuristic: maps the canonical refusal phrasings to a class. Phase 2
 * (stripMetaTrailer) lets the model state kind/class deterministically.
 * Ordered most-specific / safety-first.
 * --------------------------------------------------------------------------*/

const REFUSAL_RULES = [
  ['3.1', /\bfly the aircraft\b|\bdeclare to atc\b|\brun (?:the|your) qrh\b|qrh\/ecam|حلّ?ق بالطائرة|أبلغ المراقبة/i],
  ['3.2', /\bgaca aeromedical\b|\bpeer support\b|\bfitness to fly\b|الطب الجوي|الدعم النفسي/i],
  ['3.3', /\bnon-?compliance\b|\bget away with\b|\bwon'?t (?:help|tell) you (?:get around|evade)\b/i],
  ['2.1', /\b(?:live|current) (?:weather|metar|taf|notam|atis)\b|can'?t pull (?:live|current)|لا أستطيع جلب/i],
  ['2.2', /\bafm\/poh\b|\bafm\b|\bpoh\b|operator'?s om\b|type'?s (?:manual|afm)|دليل الطائرة/i],
  ['1.3', /\bbinding (?:legal )?interpretation\b|only gaca can\b|تفسير ملزم/i],
  ['1.2', /\bno such (?:part|section)\b|don'?t have the exact section|invent (?:a|the) regulation|لا توجد .{0,12}مادة/i],
  ['1.1', /can'?t verify that figure|cannot verify that figure|لا أستطيع التحقق من (?:هذا|ذلك) الرقم/i],
  ['2.3', /\bi'?m here for aviation\b|أنا هنا للطيران/i],
];

function classifyRefusal(answer) {
  const s = String(answer || '');
  for (const [id, re] of REFUSAL_RULES) if (re.test(s)) return id;
  return null;
}

/* Phase 2 — strip a machine-readable trailer the model may emit:
 *   <<adel kind=refusal class=1.1>>   /   <<adel kind=grounded>>
 * Returns { answer (trailer removed), kind|null, refusalClass|null }. */
// Tolerates the model wrapping the trailer in backticks/asterisks or trailing newlines.
const TRAILER_RE = /[`*]*\s*<<\s*adel\s+kind=([a-z]+)(?:\s+class=([0-9.]+))?\s*>>\s*[`*]*\s*$/i;
// Defense-in-depth: remove EVERY trailer occurrence so a misplaced one never leaks.
const TRAILER_ANY = /[`*]*\s*<<\s*adel\b[^>]*>>\s*[`*]*/ig;
function stripMetaTrailer(answer) {
  const s = String(answer || '');
  const m = TRAILER_RE.exec(s);
  const cleaned = s.replace(TRAILER_ANY, ' ').replace(/[ \t]+\n/g, '\n').trim();
  if (!m) return { answer: cleaned, kind: null, refusalClass: null };
  const kind = m[1].toLowerCase();
  return {
    answer: cleaned,
    kind: ['grounded', 'partial', 'refusal', 'na'].includes(kind) ? kind : null,
    refusalClass: m[2] || null,
  };
}

/* ----------------------------------------------------------------------------
 * Structural kind derivation — pure, no network.
 * --------------------------------------------------------------------------*/

function deriveStructural(answer, sources) {
  const refusalClass = classifyRefusal(answer);
  const claims = splitClaims(answer);

  // Cites the answer actually makes, vs. cites that resolved to corpus text.
  const answerCites = extractCitations(answer);
  const resolvedSet = new Set(
    (sources || [])
      .filter((s) => s && s.verbatim && s.section)
      .map((s) => String(s.section).toLowerCase())
  );
  const resolved = [];
  const unresolved = [];
  for (const c of answerCites) {
    const label = `GACAR Part ${c.part}, §${c.section}`;
    if (resolvedSet.has(String(c.section).toLowerCase())) resolved.push(label);
    else unresolved.push(label);
  }

  let kind;
  if (refusalClass) kind = 'refusal';
  else if (claims.length === 0) kind = 'na';
  else if (answerCites.length > 0 && unresolved.length === 0 && resolvedSet.size > 0) kind = 'grounded';
  else kind = 'partial'; // a regulatory claim that is uncited or cites unresolved text

  return {
    kind,
    refusalClass: refusalClass || null,
    claims: claims.map((claim) => ({ claim, verdict: null })),
    resolved,
    unresolved,
  };
}

/* ----------------------------------------------------------------------------
 * Faithfulness enrichment (opt-in, lazy, degrading).
 * --------------------------------------------------------------------------*/

function faithfulnessEnabled(opts) {
  return opts.grounding === 'faithfulness' ||
    (opts.grounding == null && process.env.ADEL_GROUNDING === 'faithfulness');
}

async function enrichWithFaithfulness(answer, sources, base, opts) {
  let scoreAnswer;
  try { ({ scoreAnswer } = require('../../evals/checks/citation-faithfulness')); }
  catch (_) { return null; } // module not shipped → stay structural
  try {
    const citedTexts = (sources || []).map((s) => s && s.verbatim).filter(Boolean);
    const g = await scoreAnswer({ answer, sources, citedTexts }, { apiKey: opts.apiKey });
    if (g.score == null) return null; // no claims to judge → structural verdict stands
    const claims = g.claims.map((c) => ({ claim: c.claim, verdict: c.verdict }));
    const allYes = claims.length > 0 && claims.every((c) => c.verdict === 'yes');
    return {
      kind: base.refusalClass ? 'refusal' : (allYes ? 'grounded' : 'partial'),
      score: g.score,
      claims,
      resolved: g.evidence.resolved,
      unresolved: g.evidence.unresolved,
    };
  } catch (_) {
    return null; // judge failed (no key / rate limit) → structural verdict stands
  }
}

/* ----------------------------------------------------------------------------
 * decorate — the one call answer.js makes.
 * --------------------------------------------------------------------------*/

async function decorate(raw, opts = {}) {
  const sources = Array.isArray(raw.sources) ? raw.sources : [];

  const trailer = stripMetaTrailer(raw.answer);   // phase-2 declared kind/class
  const answer = trailer.answer;
  const structural = deriveStructural(answer, sources);

  let kind;
  let refusalClass = null;
  let mode = 'structural';
  let score = null;
  let claims = structural.claims;
  let resolved = structural.resolved;
  let unresolved = structural.unresolved;

  if (trailer.kind === 'refusal' || trailer.kind === 'na') {
    // Intent-level verdicts: the model knows these best; the judge can't infer
    // them. A declared trailer is authoritative.
    kind = trailer.kind;
    refusalClass = trailer.kind === 'refusal' ? (trailer.refusalClass || structural.refusalClass) : null;
    mode = 'declared';
  } else if (!trailer.kind && (structural.kind === 'refusal' || structural.kind === 'na')) {
    kind = structural.kind;
    refusalClass = structural.refusalClass;
  } else {
    // Substantive answer (grounded vs partial): take the MOST CONSERVATIVE of
    // every available signal — structural, the model's declaration, and (opt-in)
    // the faithfulness judge. grounded only if all agree; any partial → partial.
    // This is the anti-overclaim invariant: no signal can upgrade past another.
    const signals = [];
    if (structural.kind === 'grounded' || structural.kind === 'partial') signals.push(structural.kind);
    if (trailer.kind) { signals.push(trailer.kind); mode = 'declared'; }
    if (faithfulnessEnabled(opts)) {
      const f = await enrichWithFaithfulness(answer, sources, structural, opts);
      if (f) {
        mode = 'faithfulness';
        score = f.score; claims = f.claims; resolved = f.resolved; unresolved = f.unresolved;
        signals.push(f.kind);
      }
    }
    kind = signals.length
      ? (signals.every((k) => k === 'grounded') ? 'grounded' : 'partial')
      : (trailer.kind || 'na');
  }

  const state = kind === 'na' ? 'na'
    : kind === 'grounded' ? 'grounded'
    : kind === 'refusal' ? 'refusal' : 'partial';

  return {
    answer,
    kind,
    refusalClass: kind === 'refusal' ? refusalClass : null,
    grounding: { state, score, mode, claims, resolved, unresolved },
    // Context-aware "keep exploring" chips, derived from the Parts this answer
    // touched (falls back to a curated set for refusals / non-answers).
    suggestions: suggestFollowups({ answer, sources, kind }),
    // Grounding above weighed every source; the UI gets a tight, deduplicated top set.
    sources: sources.slice(0, MAX_SOURCES),
    meta: {
      provider: opts._provider || null,
      model: opts.model || null,
      // Set by answer.js when rewrite.js changed the retrieval query (multi-
      // turn follow-up resolution / AR->EN glossary) — for eval debugging.
      rewrittenQuery: opts._rewrittenQuery || null,
      // Worked compute-tool calls (crosswind, fuel, W&B, recency, density
      // altitude) from the agentic provider — the UI renders the steps and a
      // deep link to the matching Fly GACA calculator.
      toolCalls: Array.isArray(raw.toolCalls) && raw.toolCalls.length ? raw.toolCalls : null,
    },
  };
}

module.exports = {
  makeSource,
  pushSource,
  classifyRefusal,
  stripMetaTrailer,
  splitClaims,
  extractCitations,
  deriveStructural,
  decorate,
  REF_RE,
};
