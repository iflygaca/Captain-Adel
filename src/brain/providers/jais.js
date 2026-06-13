/* ============================================================================
 * Captain Adel — Jais provider.
 *
 * Talks to a self-hosted Jais endpoint (Inception / G42, Arabic-first) exposed
 * over an OpenAI-compatible /chat/completions API — i.e. vLLM or TGI. Built from
 * the shared OpenAI-compatible factory, so it exposes complete() + configured()
 * but not answerAgentic(): like ALLaM, it is used in the retrieve-then-read
 * strategy with retrieval performed in code (see retrieve.js).
 *
 * A second Arabic option alongside ALLaM. Selectable explicitly via
 * provider:'jais' or MODEL_PROVIDER=jais; `auto` still defaults Arabic to ALLaM.
 *
 * Config (env):
 *   JAIS_BASE_URL   e.g. http://jais:8000/v1   (required to enable)
 *   JAIS_MODEL      served model name          (default below)
 *   JAIS_API_KEY    optional bearer token for the endpoint
 * ==========================================================================*/

'use strict';

const { makeOpenAICompatibleProvider } = require('./openai-compatible');

module.exports = makeOpenAICompatibleProvider({
  name: 'jais',
  baseUrlEnv: 'JAIS_BASE_URL',
  modelEnv: 'JAIS_MODEL',
  apiKeyEnv: 'JAIS_API_KEY',
  defaultModel: 'inceptionai/jais-13b-chat',
});
