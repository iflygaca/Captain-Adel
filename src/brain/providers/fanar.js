/* ============================================================================
 * Captain Adel — Fanar provider.
 *
 * Talks to a self-hosted Fanar endpoint (QCRI, Arabic-first, strong MSA) exposed
 * over an OpenAI-compatible /chat/completions API — i.e. vLLM or TGI. Built from
 * the shared OpenAI-compatible factory, so it exposes complete() + configured()
 * but not answerAgentic(): like ALLaM and Jais, it is used in the
 * retrieve-then-read strategy with retrieval performed in code (see retrieve.js).
 *
 * A candidate Arabic / in-Kingdom option alongside ALLaM and Jais; selectable
 * explicitly via provider:'fanar' or MODEL_PROVIDER=fanar; `auto` still defaults
 * Arabic to ALLaM unless ARABIC_PROVIDER says otherwise.
 *
 * Config (env):
 *   FANAR_BASE_URL   e.g. http://fanar:8000/v1   (required to enable)
 *   FANAR_MODEL      served model name           (default below)
 *   FANAR_API_KEY    optional bearer token for the endpoint
 * ==========================================================================*/

'use strict';

const { makeOpenAICompatibleProvider } = require('./openai-compatible');

module.exports = makeOpenAICompatibleProvider({
  name: 'fanar',
  baseUrlEnv: 'FANAR_BASE_URL',
  modelEnv: 'FANAR_MODEL',
  apiKeyEnv: 'FANAR_API_KEY',
  defaultModel: 'QCRI/Fanar-1-9B-Instruct',
});
