/* ============================================================================
 * Captain Adel — multi-turn retrieval-query rewriting.
 *
 * The read-mode providers (ALLaM and the other Arabic models) retrieve BEFORE
 * the model sees the conversation, so a follow-up like "and at night?" or
 * "وماذا عن الليل؟" retrieves on three words and misses the Part the user has
 * been discussing. This module rewrites ONLY the retrieval query — the message
 * the model answers is never altered:
 *
 *   rewriteQuery(message, history) -> string   (the message itself when not a
 *                                               follow-up — the zero-risk default)
 *
 * Two additions when the message IS a follow-up:
 *   1. Salient terms harvested from the last few turns: Part numbers, § refs,
 *      and the highest-value content tokens (via bm25.tokenize).
 *   2. For Arabic messages always (follow-up or not): a small AR->EN aviation
 *      glossary — the corpus body text is English, so mapping الوقود -> fuel
 *      directly lifts BM25 recall for Arabic questions.
 *
 * Modes (ADEL_REWRITE, read per call):
 *   heuristic  (default) — the pure logic below; no network, no key.
 *   llm        — one small Gemini call (5s timeout, temperature 0) to rewrite;
 *                falls back to the heuristic on ANY error or timeout.
 *   off        — passthrough.
 * ==========================================================================*/

'use strict';

const bm25 = require('./bm25');
const { arabicRatio } = require('./route');

const PART_RE_G = /\bpart\s+(\d+)\b/gi;
const AR_PART_RE_G = /\bالجزء\s+(\d+)/g;
const SECTION_RE_G = /§?\s*(\d{1,3}\.\d{1,4}(?:\.\d+)?)\b/g;

// A message that already names a Part or § section is self-contained.
const SELF_CONTAINED_RE = /\bpart\s+\d+\b|الجزء\s+\d+|§\s*\d|\b\d{1,3}\.\d{1,4}\b/i;

const FOLLOWUP_MAX_CHARS = 90;

/* Leading connectives that mark a follow-up ("and at night?", "طيب والليل؟"). */
const CONNECTIVE_RE = new RegExp(
  '^(?:' + [
    'and\\b', 'what about\\b', 'how about\\b', 'also\\b', 'then\\b', 'but\\b',
    'why\\b', 'ok(?:ay)?\\b', 'so\\b', 'what if\\b', 'does (?:it|that|this)\\b',
    'وماذا عن', 'ماذا عن', 'وهل', 'طيب', 'طب', 'وش عن', 'ايش عن', 'وإيش',
    'وكذلك', 'لكن', 'ليش', 'وبعدين', 'وفي',
  ].join('|') + ')',
  'i'
);

/* Bare anaphora — pronouns that need the prior turns to resolve. */
const PRONOUN_RE = new RegExp(
  '\\b(?:it|that|this|those|these|them|he|she|one)\\b|' +
  'هذا|هذه|هذي|ذلك|تلك|ذاك|نفسه|نفسها',
  'i'
);

/* AR -> EN aviation glossary. Keys are matched as substrings of the (already
 * Arabic) message; values are appended as extra BM25 query terms. Kept small
 * and high-precision — every entry must clearly map to corpus vocabulary.
 * Mirrors the spirit of bm25.SYNONYMS (which expands EN -> EN). */
const AR_EN_GLOSSARY = [
  ['الوقود', 'fuel reserve'],
  ['رخصة', 'licence license certificate'],
  ['الرخصة', 'licence license certificate'],
  ['شهادة طبية', 'medical certificate'],
  ['الطبية', 'medical certificate'],
  ['الطقس', 'weather minimums'],
  ['الرؤية', 'visibility'],
  ['السحب', 'cloud clearance'],
  ['طيران الأجهزة', 'instrument IFR'],
  ['القواعد الآلية', 'instrument IFR'],
  ['الطيران الآلي', 'instrument IFR'],
  ['البصري', 'visual VFR'],
  ['الليل', 'night'],
  ['ليلاً', 'night'],
  ['الإقلاع', 'takeoff departure'],
  ['الهبوط', 'landing'],
  ['المطار', 'aerodrome airport'],
  ['المجال الجوي', 'airspace'],
  ['الارتفاع', 'altitude'],
  ['الوزن', 'weight'],
  ['الاتزان', 'balance center of gravity'],
  ['الصيانة', 'maintenance'],
  ['الحد الأدنى', 'minimum'],
  ['ساعات الطيران', 'flight time hours'],
  ['الطالب', 'student pilot'],
  ['المدرب', 'instructor'],
  ['الركاب', 'passengers'],
  ['الصلاحية', 'currency recency'],
  ['طائرة بدون طيار', 'unmanned UAS drone'],
  ['الدرون', 'unmanned UAS drone'],
  ['العمر', 'age eligibility'],
  ['التحويل', 'conversion foreign'],
  ['المروحية', 'helicopter rotorcraft'],
  ['الطائرة المروحية', 'helicopter rotorcraft'],
  ['المدرج', 'runway'],
  ['البرج', 'tower control'],
  ['التصريح', 'clearance authorization'],
  ['الاقتراب', 'approach'],
  ['خطة الطيران', 'flight plan'],
  ['الطوارئ', 'emergency'],
  ['القيادة', 'command authority'],
  ['المناورة', 'manoeuvre maneuver'],
  ['المطار الأرضي', 'aerodrome'],
];

function mode() {
  const m = String(process.env.ADEL_REWRITE || 'heuristic').toLowerCase();
  return (m === 'llm' || m === 'off') ? m : 'heuristic';
}

/** True when the message reads as a follow-up that needs the prior turns. */
function isFollowUp(message, history) {
  const msg = String(message || '').trim();
  if (!msg) return false;
  if (!Array.isArray(history) || history.length === 0) return false;
  if (SELF_CONTAINED_RE.test(msg)) return false;       // names its own Part/§
  if (msg.length > FOLLOWUP_MAX_CHARS) return false;   // long = self-contained
  if (CONNECTIVE_RE.test(msg)) return true;
  if (PRONOUN_RE.test(msg)) return true;
  // Very short questions with almost no content tokens lean on the thread.
  return bm25.tokenize(msg).length <= 2;
}

/* Harvest retrieval-worthy terms from the last few turns: explicit Part / §
 * references first (highest precision), then content tokens from the most
 * recent user turns. Returns deduplicated terms not already in the message. */
function harvestTerms(message, history, { maxTokens = 8 } = {}) {
  const prior = (Array.isArray(history) ? history : []).slice(-6);
  const msgLower = String(message || '').toLowerCase();
  const seen = new Set();
  const terms = [];
  const push = (t) => {
    const term = String(t || '').trim();
    const key = term.toLowerCase();
    if (!term || seen.has(key) || msgLower.includes(key)) return;
    seen.add(key);
    terms.push(term);
  };

  for (let i = prior.length - 1; i >= 0; i--) {
    const text = String((prior[i] && prior[i].text) || '');
    for (const m of text.matchAll(PART_RE_G)) push('Part ' + m[1]);
    for (const m of text.matchAll(AR_PART_RE_G)) push('Part ' + m[1]);
    for (const m of text.matchAll(SECTION_RE_G)) push('§' + m[1]);
  }

  let tokens = 0;
  for (let i = prior.length - 1; i >= 0 && tokens < maxTokens; i--) {
    const h = prior[i];
    if (!h || h.role === 'model') continue;            // user turns carry the topic
    for (const tok of bm25.tokenize(String(h.text || ''))) {
      if (tok.length < 4) continue;                    // drop low-value stubs
      if (/^\d+$/.test(tok)) continue;
      if (seen.has(tok)) continue;
      seen.add(tok);
      terms.push(tok);
      if (++tokens >= maxTokens) break;
    }
  }
  return terms;
}

/** Glossary expansion — EN corpus terms for Arabic phrases in the message. */
function glossaryTerms(message) {
  const msg = String(message || '');
  if (arabicRatio(msg) < 0.2) return [];
  const out = [];
  const seen = new Set();
  for (const [ar, en] of AR_EN_GLOSSARY) {
    if (!msg.includes(ar)) continue;
    for (const term of en.split(/\s+/)) {
      if (seen.has(term)) continue;
      seen.add(term);
      out.push(term);
    }
  }
  return out;
}

/* One small LLM rewrite (llm mode only). Any failure -> null, caller falls
 * back to the heuristic. Kept lazy so heuristic/off modes never load the SDK. */
const LLM_REWRITE_TIMEOUT_MS = 5000;

/* Race `promise` against a timeout, resolving null on timeout AND on rejection
 * (early or late). A bare Promise.race leaves the losing promise dangling: a
 * rejection that lands after the timeout wins would surface as an unhandled
 * rejection, and the never-cleared timer would pin the event loop for its full
 * duration even when the call settled instantly. The timer stays ref'd so the
 * race always settles — even in a short-lived CLI (evals) with nothing else on
 * the loop. */
function raceNullOnTimeout(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(null); }
    );
  });
}

async function llmRewrite(message, history) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const { GoogleGenAI } = require('@google/genai');
    // Match the request's own timeout to the race window so the abandoned
    // request is actually torn down instead of running on unobserved.
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: LLM_REWRITE_TIMEOUT_MS } });
    const thread = (Array.isArray(history) ? history : []).slice(-6)
      .map((h) => `${h.role === 'model' ? 'A' : 'Q'}: ${String(h.text || '').slice(0, 300)}`)
      .join('\n');
    const prompt =
      'Rewrite the final question as ONE standalone English search query for a ' +
      'civil-aviation regulation corpus (GACAR). Resolve pronouns from the ' +
      'thread, keep Part/section numbers, output ONLY the query.\n\n' +
      thread + '\nQ: ' + String(message || '');
    const call = ai.models.generateContent({
      model: process.env.ADEL_REWRITE_MODEL || 'gemini-3.6-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0, maxOutputTokens: 80 },
    });
    const resp = await raceNullOnTimeout(call, LLM_REWRITE_TIMEOUT_MS);
    const text = resp && resp.text ? String(resp.text).trim() : '';
    return text && text.length <= 300 ? text : null;
  } catch (_) {
    return null;
  }
}

/**
 * The retrieval query for this turn. Returns `message` untouched unless the
 * mode allows rewriting AND the message needs it (follow-up, or an Arabic
 * message that benefits from glossary terms).
 */
async function rewriteQuery(message, history = []) {
  const msg = String(message || '').trim();
  const m = mode();
  if (m === 'off' || !msg) return msg;

  const followUp = isFollowUp(msg, history);

  if (m === 'llm' && followUp) {
    const rewritten = await llmRewrite(msg, history);
    if (rewritten) return rewritten;
  }

  const extra = [];
  if (followUp) extra.push(...harvestTerms(msg, history));
  extra.push(...glossaryTerms(msg));
  if (extra.length === 0) return msg;
  return msg + ' ' + extra.join(' ');
}

module.exports = { rewriteQuery, isFollowUp, harvestTerms, glossaryTerms, raceNullOnTimeout };
