/* ============================================================================
 * Captain Adel — ALLaM provider.
 *
 * Talks to a self-hosted ALLaM-7B-Instruct endpoint (HUMAIN, Apache-2.0,
 * Arabic + English) exposed over an OpenAI-compatible /chat/completions API —
 * i.e. vLLM or TGI. Built from the shared OpenAI-compatible factory, so it
 * exposes complete() + configured() but not answerAgentic() (a 7B preview model
 * is not reliable at Gemini-style function-calling; retrieval is done in code
 * — see retrieve.js — and the grounded passages are handed to the model).
 *
 * Config (env):
 *   ALLAM_BASE_URL   e.g. http://allam:8000/v1   (required to enable)
 *   ALLAM_MODEL      served model name           (default below)
 *   ALLAM_API_KEY    optional bearer token for the endpoint
 * ==========================================================================*/

'use strict';

const { makeOpenAICompatibleProvider } = require('./openai-compatible');

module.exports = makeOpenAICompatibleProvider({
  name: 'allam',
  baseUrlEnv: 'ALLAM_BASE_URL',
  modelEnv: 'ALLAM_MODEL',
  apiKeyEnv: 'ALLAM_API_KEY',
  defaultModel: 'humain-ai/ALLaM-7B-Instruct-preview',
});
