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
const { decorate } = require('./grounding');
const { composeSystemInstruction } = require('./system-prompt');

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_TURNS = 12;
// Wrap the read-mode turn in Arabic once the question is Arabic-dominant — the
// same 0.4 threshold the router uses to send the turn to an Arabic provider, so
// the scaffolding language matches the model that answers it.
const AR_WRAP_THRESHOLD = 0.4;

/* Normalise history to [{ role, text }]; drop the duplicate trailing user turn
 * chat clients push before POSTing (the current message is passed separately). */
function buildContents(message, history) {
  const prior = Array.isArray(history) ? history.slice() : [];
  const last = prior[prior.length - 1];
  if (last && last.role === 'user' && String(last.text || '') === message) prior.pop();

  const out = [];
  for (const h of prior.slice(-MAX_HISTORY_TURNS)) {
    const text = String((h && h.text) || '').trim();
    if (!text) continue;
    out.push({ role: h.role === 'model' ? 'model' : 'user', text });
  }
  return out;
}

async function answerRead(provider, message, history, opts) {
  const { context, sources } = await retrieveSmart(message, { topK: opts.topK || 6 });
  const arabic = arabicRatio(message) >= AR_WRAP_THRESHOLD;
  const systemInstruction = composeSystemInstruction({
    product: opts.product,
    systemSuffix: opts.systemSuffix,
    strategy: 'read',
    lang: arabic ? 'ar' : undefined,
  });
  const userTurn = arabic
    ? 'النصوص المسترجعة (استشهد بها فقط؛ لا تستخدم سواها):\n\n' +
      context +
      '\n\n---\nالسؤال: ' + message
    : 'RETRIEVED PASSAGES (cite these; do not use anything else):\n\n' +
      context +
      '\n\n---\nQUESTION: ' + message;
  const contents = buildContents(message, history).concat([{ role: 'user', text: userTurn }]);
  const answer = await provider.complete({ systemInstruction, contents, opts });
  return { answer: String(answer || '').trim(), sources };
}

function canUse(name, opts) {
  if (name === 'gemini') return !!(opts.apiKey || process.env.GEMINI_API_KEY);
  const p = providers.get(name);
  return !!(p.configured && p.configured());
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

async function answer(message, history = [], opts = {}) {
  const msg = String(message || '').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!msg) {
    return decorate({ answer: 'Say again — I did not catch a question there, Captain.', sources: [] }, opts);
  }

  const name = pickProvider(msg, opts);
  try {
    const raw = await runProvider(name, msg, history, opts);
    return await decorate(raw, { ...opts, _provider: name });
  } catch (err) {
    const fallback = pickFallback(name, opts);
    if (!fallback) throw err;
    const raw = await runProvider(fallback, msg, history, opts);
    return await decorate(raw, { ...opts, _provider: fallback });
  }
}

module.exports = { answer, answerRead, buildContents };
