/* ============================================================================
 * Captain Adel — provider registry.
 *
 * Each provider exposes complete({ systemInstruction, contents, opts }) for the
 * retrieve-then-read strategy. Gemini additionally exposes answerAgentic() for
 * the function-calling strategy. get() defaults to Gemini for an unknown name.
 *
 * ARABIC_PROVIDERS lists the in-Kingdom Arabic models in preference order — used
 * by route.js (auto language routing) and answer.js (fallback chain).
 * ==========================================================================*/

'use strict';

const gemini = require('./gemini');
const allam = require('./allam');
const jais = require('./jais');
const fanar = require('./fanar');
const qwen = require('./qwen');
const commandr = require('./commandr');

const PROVIDERS = { gemini, allam, jais, fanar, qwen, commandr };

// In-Kingdom Arabic models in preference order. ALLaM stays first, so `auto`
// (and the cross-provider fallback) keep defaulting Arabic to ALLaM; the rest
// are opt-in via provider:'<name>', MODEL_PROVIDER, or ARABIC_PROVIDER.
const ARABIC_PROVIDERS = ['allam', 'jais', 'fanar', 'qwen', 'commandr'];

function get(name) {
  return PROVIDERS[name] || gemini;
}

module.exports = {
  PROVIDERS, ARABIC_PROVIDERS, get,
  gemini, allam, jais, fanar, qwen, commandr,
};
