/* ============================================================================
 * Captain Adel — answer orchestrator.
 *
 * One turn through the brain:
 *   1. Resolve the provider (route.js: forced, or auto by language).
 *   2. Gemini default -> agentic function-calling loop.
 *      ALLaM, or any read-mode request -> retrieve-then-read: BM25 in code
 *      (retrieve.js), passages handed to the model under a read-only prompt.
 *   3. On a provider error, fall back once to the other provider.
 *
 *   answer(message, history, opts) -> Promise<{ answer, sources }>
 *
 * opts: { provider, product, apiKey, model, systemSuffix, strategy, topK }
 * ==========================================================================*/

'use strict';

const providers = require('./providers');
const { pickProvider, arabicRatio } = require('./route');
const { retrieveSmart } = require('./retrieve');
const { rewriteQuery } = require('./rewrite');
const { decorate } = require('./grounding');
const { composeSystemInstruction } = require('./system-prompt');
const { normalizeHistory } = require('./history');
const { MAX_MESSAGE_CHARS } = require('./guards');

// Wrap the read-mode turn in Arabic once the question is Arabic-dominant — the
// same 0.4 threshold the router uses to send the turn to an Arabic provider, so
// the scaffolding language matches the model that answers it.
const AR_WRAP_THRESHOLD = 0.4;

/* Normalise history to [{ role, text }] — see history.js for the shared rules. */
function buildContents(message, history) {
  return normalizeHistory(message, history);
}

/* Wrap retrieved passages + the question into the read-mode user turn. Shared by
   the buffered and streaming read paths so their prompt is byte-identical. */
function readUserTurn(message, context, arabic) {
  return arabic
    ? 'النصوص المسترجعة (استشهد بها فقط؛ لا تستخدم سواها):\n\n' +
      context + '\n\n---\nالسؤال: ' + message
    : 'RETRIEVED PASSAGES (cite these; do not use anything else):\n\n' +
      context + '\n\n---\nQUESTION: ' + message;
}

/* Retrieve-then-read setup shared by the buffered and streaming read paths, so
 * their prompt is byte-identical.
 * The retrieval query may be rewritten (follow-up resolution, AR->EN glossary —
 * rewrite.js); the message the model answers stays untouched. The rewrite is
 * recorded on the SHARED opts object so decorate() can surface it in meta. */
async function prepareRead(message, history, opts) {
  const query = await rewriteQuery(message, history);
  if (query !== message) opts._rewrittenQuery = query;
  const { context, sources } = await retrieveSmart(query, { topK: opts.topK || 4 });
  const arabic = arabicRatio(message) >= AR_WRAP_THRESHOLD;
  const systemInstruction = composeSystemInstruction({
    product: opts.product,
    systemSuffix: opts.systemSuffix,
    strategy: 'read',
    lang: arabic ? 'ar' : undefined,
    mode: opts.mode,
  });
  const contents = buildContents(message, history)
    .concat([{ role: 'user', text: readUserTurn(message, context, arabic) }]);
  return { systemInstruction, contents, sources };
}

async function answerRead(provider, message, history, opts) {
  const { systemInstruction, contents, sources } = await prepareRead(message, history, opts);
  const answer = await provider.complete({ systemInstruction, contents, opts });
  return { answer: String(answer || '').trim(), sources };
}

function canUse(name, opts) {
  if (name === 'gemini') return !!(opts.apiKey || process.env.GEMINI_API_KEY);
  const p = providers.get(name);
  return !!(p.configured && p.configured());
}

/* ----------------------------------------------------------------------------
 * Compute-intent routing. The flight-computer tools (brain/tools) only exist
 * on the agentic path — read-mode models cannot call functions. A numeric
 * compute question (crosswind, fuel, W&B, recency, density altitude) is
 * therefore steered to Gemini when the caller asked for auto routing; with no
 * Gemini configured, a system note tells the read-mode model to direct the
 * user to the matching Fly GACA tool page instead of doing prose arithmetic.
 * --------------------------------------------------------------------------*/

const COMPUTE_KEYWORDS_RE = new RegExp([
  'crosswind', 'headwind', 'tailwind', 'wind component', 'wind correction', '\\bwca\\b',
  'ground speed', 'groundspeed', 'fuel', 'endurance', 'burn',
  'weight and balance', 'weight & balance', '\\bw&b\\b', 'center of gravity', 'centre of gravity', '\\bcg\\b', 'moment',
  'density altitude', 'pressure altitude',
  'current to carry', 'recency', 'recent experience', '90 days', 'takeoffs and landings',
  // Arabic
  'رياح متقاطعة', 'الرياح المتقاطعة', 'مكون الرياح', 'السرعة الأرضية',
  'الوقود', 'وقود', 'الاحتياطي',
  'الوزن والاتزان', 'مركز الثقل',
  'ارتفاع الكثافة', 'الارتفاع الضغطي',
  'الصلاحية', 'حداثة الخبرة', '90 يوم',
].join('|'), 'i');

function looksLikeCompute(message) {
  const msg = String(message || '');
  if (!/\d/.test(msg)) return false;                 // no numbers, nothing to compute
  return COMPUTE_KEYWORDS_RE.test(msg);
}

const NO_COMPUTE_NOTE =
  '\nNOTE: This question asks for a numeric calculation, but your calculation ' +
  'tools are unavailable on this path. Do NOT attempt the arithmetic in prose. ' +
  'Explain the governing rule from the retrieved passages and direct the user ' +
  'to the matching Fly GACA flight tool (e.g. the Crosswind, Fuel, Weight & ' +
  'Balance, Currency or Density Altitude calculator) for the numbers.';

/* The provider for this turn: auto-routed compute questions go to Gemini when
 * it is configured; otherwise the read path gets the no-compute note. Explicit
 * provider requests are always honoured. */
function routeTurn(msg, opts) {
  const name = pickProvider(msg, opts);
  const autoRouted = !opts.provider || opts.provider === 'auto';
  if (!autoRouted || !looksLikeCompute(msg)) return { name, opts };
  if (name !== 'gemini' && canUse('gemini', opts)) return { name: 'gemini', opts };
  if (name !== 'gemini' || opts.strategy === 'read') {
    return { name, opts: { ...opts, systemSuffix: String(opts.systemSuffix || '') + NO_COMPUTE_NOTE } };
  }
  return { name, opts };
}

/* Pick the provider to retry on after `name` fails: Gemini falls back to the
 * first configured Arabic provider; any Arabic provider falls back to Gemini. */
function pickFallback(name, opts) {
  if (name !== 'gemini') return canUse('gemini', opts) ? 'gemini' : null;
  for (const n of providers.ARABIC_PROVIDERS) {
    if (canUse(n, opts)) return n;
  }
  return null;
}

async function runProvider(name, message, history, opts) {
  const provider = providers.get(name);
  // Gemini drives its own tools unless read mode is explicitly requested.
  if (name === 'gemini' && opts.strategy !== 'read') {
    return provider.answerAgentic(message, history, opts);
  }
  return answerRead(provider, message, history, opts);
}

/* Attach diagnostic context to a propagating provider error WITHOUT changing its
 * type or message — server.js logs read `err.provider` / `err.brainStage` so an
 * outage is attributable to the model path that failed. Existing fields win. */
function annotateError(err, fields) {
  if (err && typeof err === 'object') {
    for (const [k, v] of Object.entries(fields)) {
      if (err[k] == null) err[k] = v;
    }
  }
  return err;
}

async function answer(message, history = [], opts = {}) {
  const msg = String(message || '').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!msg) {
    return decorate({ answer: 'Say again — I did not catch a question there, Captain.', sources: [] }, opts);
  }

  const routed = routeTurn(msg, opts);
  const name = routed.name;
  opts = routed.opts;
  try {
    const raw = await runProvider(name, msg, history, opts);
    return await decorate(raw, { ...opts, _provider: name });
  } catch (err) {
    const fallback = pickFallback(name, opts);
    if (!fallback) throw annotateError(err, { provider: name, brainStage: 'provider' });
    try {
      const raw = await runProvider(fallback, msg, history, opts);
      return await decorate(raw, { ...opts, _provider: fallback });
    } catch (err2) {
      throw annotateError(err2, { provider: fallback, brainStage: 'fallback', primaryProvider: name });
    }
  }
}

/* ----------------------------------------------------------------------------
 * Streaming — answerStream(): an async generator that yields the answer text in
 * chunks, then one terminal event with the grounding contract.
 *
 *   { type: 'token', delta }   — a chunk of answer text to append
 *   { type: 'reset' }          — clear the answer so far (provider fell back, or
 *                                an agentic tool round emitted interim text)
 *   { type: 'final', answer, kind, refusalClass, grounding, suggestions, sources, meta }
 *
 * The grounding/kind/sources are only known once the full answer is in hand
 * (decorate, grounding.js), so they ride the terminal 'final' event. The control
 * trailer `<<adel kind=…>>` lives at the very end of the raw text — we hold back
 * the last TRAILER_HOLD chars from streaming so it never flashes, and emit the
 * cleaned remainder from decorate's stripped answer just before 'final'.
 * --------------------------------------------------------------------------*/

const TRAILER_HOLD = 80;

async function* runProviderStream(name, message, history, opts) {
  const provider = providers.get(name);
  if (name === 'gemini' && opts.strategy !== 'read') {
    yield* provider.answerAgenticStream(message, history, opts);
    return;
  }
  const { systemInstruction, contents, sources } = await prepareRead(message, history, opts);
  for await (const delta of provider.completeStream({ systemInstruction, contents, opts })) {
    yield { type: 'token', delta };
  }
  yield { type: 'done', answer: null, sources };
}

async function* answerStream(message, history = [], opts = {}) {
  const msg = String(message || '').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!msg) {
    const d = await decorate({ answer: 'Say again — I did not catch a question there, Captain.', sources: [] }, opts);
    yield { type: 'final', answer: d.answer, kind: d.kind, refusalClass: d.refusalClass, grounding: d.grounding, suggestions: d.suggestions, sources: d.sources, meta: d.meta };
    return;
  }

  const routed = routeTurn(msg, opts);
  const primary = routed.name;
  opts = routed.opts;
  let raw = '';
  let emitted = 0;
  let sources = [];
  let toolCalls = null;
  let used = primary;

  async function* drive(name) {
    for await (const ev of runProviderStream(name, msg, history, opts)) {
      if (ev.type === 'token') {
        raw += ev.delta;
        const safe = raw.length - TRAILER_HOLD;
        if (safe > emitted) {
          const chunk = raw.slice(emitted, safe);
          emitted = safe;
          yield { type: 'token', delta: chunk };
        }
      } else if (ev.type === 'reset') {
        raw = ''; emitted = 0;
        yield { type: 'reset' };
      } else if (ev.type === 'done') {
        if (ev.answer != null) raw = ev.answer;
        sources = ev.sources || sources;
        toolCalls = ev.toolCalls || toolCalls;
      }
    }
  }

  try {
    yield* drive(primary);
  } catch (err) {
    const fb = pickFallback(primary, opts);
    if (!fb) throw annotateError(err, { provider: primary, brainStage: 'stream' });
    raw = ''; emitted = 0; sources = []; toolCalls = null; used = fb;
    yield { type: 'reset' };
    try {
      yield* drive(fb);
    } catch (err2) {
      throw annotateError(err2, { provider: fb, brainStage: 'stream-fallback', primaryProvider: primary });
    }
  }

  const d = await decorate({ answer: raw, sources, toolCalls }, { ...opts, _provider: used });
  const remainder = d.answer.length > emitted ? d.answer.slice(emitted) : '';
  if (remainder) yield { type: 'token', delta: remainder };
  yield {
    type: 'final',
    answer: d.answer, kind: d.kind, refusalClass: d.refusalClass,
    grounding: d.grounding, suggestions: d.suggestions, sources: d.sources, meta: d.meta,
  };
}

module.exports = {
  answer, answerStream, answerRead, buildContents,
  // Exported for unit tests — pure routing/compute-intent helpers.
  looksLikeCompute, routeTurn, pickFallback,
};
