/* ============================================================================
 * Captain Adel — OpenAI-compatible provider factory.
 *
 * Most self-hosted Arabic/English chat models (ALLaM, Jais, …) are served over
 * an OpenAI-compatible /chat/completions API by vLLM or TGI. Rather than copy a
 * near-identical provider per model, this factory builds one from a small env
 * config. It uses the Node 20 global fetch, so no SDK is pulled in.
 *
 * Such providers are used ONLY in the retrieve-then-read strategy: a small
 * preview model is not reliable at Gemini-style function-calling, so retrieval
 * is performed in code (see retrieve.js) and the grounded passages are handed
 * to the model. They therefore expose complete() but not answerAgentic().
 *
 *   makeOpenAICompatibleProvider({
 *     name,          // provider name, e.g. 'allam'
 *     baseUrlEnv,    // env var holding the /v1 base URL (required to enable)
 *     modelEnv,      // env var holding the served model name (optional)
 *     apiKeyEnv,     // env var holding an optional bearer token
 *     defaultModel,  // served model name when modelEnv is unset
 *   }) -> { name, complete, configured, DEFAULT_MODEL }
 * ==========================================================================*/

'use strict';

function makeOpenAICompatibleProvider({ name, baseUrlEnv, modelEnv, apiKeyEnv, defaultModel }) {
  const DEFAULT_MODEL = (modelEnv && process.env[modelEnv]) || defaultModel;

  function baseUrl() {
    return String(process.env[baseUrlEnv] || '').replace(/\/+$/, '');
  }

  function configured() {
    return !!baseUrl();
  }

  async function complete({ systemInstruction, contents, opts = {} }) {
    const base = baseUrl();
    if (!base) throw new Error(`${baseUrlEnv} is not configured`);
    const model = opts.model || DEFAULT_MODEL;

    const messages = [{ role: 'system', content: systemInstruction }];
    for (const c of contents || []) {
      messages.push({
        role: c.role === 'model' ? 'assistant' : 'user',
        content: String(c.text || ''),
      });
    }

    const headers = { 'Content-Type': 'application/json' };
    const apiKey = apiKeyEnv && process.env[apiKeyEnv];
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 60000);
    let resp;
    try {
      resp = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        signal: ctrl.signal,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: opts.maxTokens || 1024,
          stream: false,
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`${name} endpoint ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    const choice = data && data.choices && data.choices[0];
    const text = choice && choice.message && choice.message.content;
    return String(text || '').trim();
  }

  return { name, complete, configured, DEFAULT_MODEL };
}

module.exports = { makeOpenAICompatibleProvider };
