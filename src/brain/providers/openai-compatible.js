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

  /* Streaming twin of complete(): yields content deltas (strings) as they
     arrive over the OpenAI-compatible SSE (`stream: true`). Same request shape
     as complete(); the caller accumulates the full text. */
  async function* completeStream({ systemInstruction, contents, opts = {} }) {
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
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 60000);
    try {
      const resp = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        signal: ctrl.signal,
        body: JSON.stringify({
          model, messages, temperature: 0.2,
          max_tokens: opts.maxTokens || 1024, stream: true,
        }),
      });
      if (!resp.ok || !resp.body) {
        const body = resp.ok ? '' : await resp.text().catch(() => '');
        throw new Error(`${name} endpoint ${resp.status}: ${body.slice(0, 200)}`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames are separated by blank lines; process complete lines.
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload);
            const delta = json && json.choices && json.choices[0]
              && json.choices[0].delta && json.choices[0].delta.content;
            if (delta) yield String(delta);
          } catch (_) { /* skip keep-alive / partial frames */ }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return { name, complete, completeStream, configured, DEFAULT_MODEL };
}

module.exports = { makeOpenAICompatibleProvider };
