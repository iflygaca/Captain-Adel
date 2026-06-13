/* ============================================================================
 * Captain Adel — Qwen provider.
 *
 * Talks to a self-hosted Qwen2.5-Instruct endpoint (Alibaba, Apache-2.0 for most
 * sizes) exposed over an OpenAI-compatible /chat/completions API — i.e. vLLM or
 * TGI. Built from the shared OpenAI-compatible factory, so it exposes complete()
 * + configured() but not answerAgentic(): used in the retrieve-then-read strategy
 * with retrieval performed in code (see retrieve.js).
 *
 * Qwen is the instruction-following workhorse of the Arabic-capable set: strong
 * at following the read-mode contract (cite-only, control-line trailer) with
 * solid Arabic, even if its MSA register is less native than ALLaM/Fanar.
 * Selectable via provider:'qwen' or MODEL_PROVIDER=qwen.
 *
 * Config (env):
 *   QWEN_BASE_URL   e.g. http://qwen:8000/v1   (required to enable)
 *   QWEN_MODEL      served model name          (default below)
 *   QWEN_API_KEY    optional bearer token for the endpoint
 * ==========================================================================*/

'use strict';

const { makeOpenAICompatibleProvider } = require('./openai-compatible');

module.exports = makeOpenAICompatibleProvider({
  name: 'qwen',
  baseUrlEnv: 'QWEN_BASE_URL',
  modelEnv: 'QWEN_MODEL',
  apiKeyEnv: 'QWEN_API_KEY',
  defaultModel: 'Qwen/Qwen2.5-14B-Instruct',
});
