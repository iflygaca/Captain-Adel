/* ============================================================================
 * Captain Adel — Command R provider.
 *
 * Talks to a self-hosted Command R endpoint (Cohere, multilingual incl. Arabic)
 * exposed over an OpenAI-compatible /chat/completions API — i.e. vLLM or TGI.
 * Built from the shared OpenAI-compatible factory, so it exposes complete() +
 * configured() but not answerAgentic(): used in the retrieve-then-read strategy
 * with retrieval performed in code (see retrieve.js).
 *
 * Command R is purpose-built for grounded, citation-heavy RAG, which makes it a
 * strong candidate for the read-mode contract. LICENSE CAVEAT: the open weights
 * (c4ai-command-r) are CC-BY-NC — research / evaluation only unless a commercial
 * licence is obtained. See docs/models.md. Selectable via provider:'commandr'.
 *
 * Config (env):
 *   COMMANDR_BASE_URL   e.g. http://commandr:8000/v1   (required to enable)
 *   COMMANDR_MODEL      served model name              (default below)
 *   COMMANDR_API_KEY    optional bearer token for the endpoint
 * ==========================================================================*/

'use strict';

const { makeOpenAICompatibleProvider } = require('./openai-compatible');

module.exports = makeOpenAICompatibleProvider({
  name: 'commandr',
  baseUrlEnv: 'COMMANDR_BASE_URL',
  modelEnv: 'COMMANDR_MODEL',
  apiKeyEnv: 'COMMANDR_API_KEY',
  defaultModel: 'CohereForAI/c4ai-command-r-v01',
});
