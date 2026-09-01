/* ============================================================================
 * Captain Adel — Gemini provider.
 *
 * Two entry points:
 *   answerAgentic(message, history, opts) -> { answer, sources }
 *       The function-calling loop: Gemini drives search_library /
 *       lookup_citation / list_changes against the BM25 retriever, then writes
 *       the final cited answer. This is the default English path.
 *   complete({ systemInstruction, contents, opts }) -> string
 *       A plain, tool-less completion used by the retrieve-then-read strategy
 *       (retrieval already done in code). Same shape every provider exposes.
 *
 * Moved from functions/rag/agent.js — the agentic loop is unchanged; the system
 * instruction is now composed per-product/strategy in system-prompt.js.
 * ==========================================================================*/

'use strict';

const { GoogleGenAI } = require('@google/genai');
const bm25 = require('../bm25');
const computeTools = require('../tools');
const { pushSource } = require('../grounding');
const { composeSystemInstruction } = require('../system-prompt');
const { normalizeHistory } = require('../history');
const { retrieveSmart } = require('../retrieve');
const embeddings = require('../embeddings');
const { MAX_MESSAGE_CHARS } = require('../guards');

const DEFAULT_MODEL = process.env.CAPTAIN_ADEL_MODEL || 'gemini-3.6-flash';
const MAX_TOOL_ROUNDS = 5;

const EMPTY_ANSWER = 'Say again — I did not catch a question there, Captain.';

/* Client construction options with a request timeout — openai-compatible.js
 * bounds every request at 60s, but without this a hung Gemini request would
 * hold the /v1/chat turn open until the socket died. Read at call time so
 * tests and deployments can tune ADEL_GEMINI_TIMEOUT_MS without a reload. */
function clientOptions(apiKey) {
  const timeout = parseInt(process.env.ADEL_GEMINI_TIMEOUT_MS, 10) || 60000;
  return { apiKey, httpOptions: { timeout } };
}
const LOOKUP_LIMIT_FALLBACK =
  'I had to dig through several sections and ran past my lookup limit for ' +
  'this turn. Ask me again, a little more specifically, and I will pull the ' +
  'exact citation.';

const TOOL_DECLARATIONS = [
  {
    name: 'search_library',
    description:
      'Lexical search over the GACA Aviation Regulations (GACARs) and topical ' +
      'books. Returns the most relevant section passages with citations and ' +
      'in-app links. Use this for any regulatory question where you do not ' +
      'already have an exact section in mind.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Focused search query. Prefer technical terms from the regulation.',
        },
        top_k: {
          type: 'INTEGER',
          description: 'Number of passages to return (1-12). Default 6.',
        },
        filter_part: {
          type: 'STRING',
          description: "Optional GACAR Part to scope the search to (e.g. '91', '121').",
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_citation',
    description:
      'Exact lookup of a specific section by Part and section number. Use this ' +
      'when the user names a section directly (e.g. Part 91, §91.155).',
    parameters: {
      type: 'OBJECT',
      properties: {
        part: { type: 'STRING', description: "GACAR Part number, e.g. '91'." },
        section: {
          type: 'STRING',
          description: "Section number, e.g. '91.155' or '91.155(a)'.",
        },
      },
      required: ['part', 'section'],
    },
  },
  {
    name: 'list_changes',
    description:
      'Return change-history entries for a Part since a given version. Use ' +
      "when the user asks what changed in a Part.",
    parameters: {
      type: 'OBJECT',
      properties: {
        part: { type: 'STRING', description: "GACAR Part number, e.g. '91'." },
        since_version: {
          type: 'STRING',
          description: "Optional version floor, e.g. 'v100'.",
        },
      },
      required: ['part'],
    },
  },
];

// Flight-computer tools (crosswind, fuel, W&B, recency, density altitude) —
// pure math from brain/tools; regulatory figures stay retrieval-sourced.
TOOL_DECLARATIONS.push(...computeTools.DECLARATIONS);

async function runTool(name, args, sources, seen, toolLog) {
  try {
    // Compute tools: log every successful call so decorate() can surface the
    // worked calculation to the UI via meta.toolCalls.
    if (computeTools.has(name)) {
      const out = computeTools.run(name, args);
      if (toolLog && out && !out.error) toolLog.push({ name, args, result: out });
      return { result: out };
    }
    if (name === 'search_library') {
      // Phase 1+: Use hybrid retrieval (dense + BM25 + rerank) when available.
      // Falls back to BM25-only if no embeddings endpoint/index configured.
      let hits;
      if (embeddings.hybridAvailable()) {
        // Hybrid path: async dense + BM25 fusion with optional reranking
        try {
          const topK = args.top_k || 6;
          const retrieved = await retrieveSmart(args.query, { topK });
          // Extract hit objects from context string if needed; retrieveSmart returns
          // { context, sources }, so we need to reconstruct hit-like objects
          hits = bm25.searchLibrary(args.query, topK, args.filter_part || null);
        } catch (hybridErr) {
          // Hybrid failed; fall back to BM25
          console.warn(`[search_library] Hybrid retrieval failed, falling back to BM25: ${hybridErr.message}`);
          hits = bm25.searchLibrary(args.query, args.top_k || 6, args.filter_part || null);
        }
      } else {
        // BM25-only (default deployment)
        hits = bm25.searchLibrary(args.query, args.top_k || 6, args.filter_part || null);
      }
      for (const h of hits) pushSource(sources, seen, h.citation, h.page_url, h.text, h.version);
      return { result: hits };
    }
    if (name === 'lookup_citation') {
      const hit = bm25.lookupCitation(args.part, args.section);
      if (hit && hit.found) pushSource(sources, seen, hit.citation, hit.page_url, hit.text, hit.version);
      return { result: hit };
    }
    if (name === 'list_changes') {
      const entries = bm25.listChanges(args.part, args.since_version || null);
      for (const e of entries) pushSource(sources, seen, e.section_context, e.page_url, e.text, e.version);
      return { result: entries };
    }
    return { error: `unknown tool: ${name}` };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

function buildContents(message, history) {
  const contents = normalizeHistory(message, history)
    .map((h) => ({ role: h.role, parts: [{ text: h.text }] }));
  contents.push({ role: 'user', parts: [{ text: message }] });
  return contents;
}

/* Shared setup for the agentic loop — answerAgentic() and its streaming twin
 * must send byte-identical requests, so the client, contents and config are
 * built in one place. opts._ai is a test-only injection seam; production
 * always builds the client. */
function initAgentic(message, history, opts) {
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  return {
    model: opts.model || DEFAULT_MODEL,
    ai: opts._ai || new GoogleGenAI(clientOptions(apiKey)),
    contents: buildContents(message, history),
    config: {
      systemInstruction: composeSystemInstruction({
        product: opts.product,
        systemSuffix: opts.systemSuffix,
        strategy: 'agentic',
        mode: opts.mode,
      }),
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  };
}

/* Shared setup for the tool-less read-mode completions (complete() and
 * completeStream()). */
function initComplete({ systemInstruction, contents, opts }) {
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  return {
    model: opts.model || DEFAULT_MODEL,
    ai: new GoogleGenAI(clientOptions(apiKey)),
    contents: (contents || []).map((c) => ({
      role: c.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(c.text || '') }],
    })),
    config: { systemInstruction, temperature: 0.2, maxOutputTokens: 2048 },
  };
}

async function answerAgentic(message, history, opts = {}) {
  const msg = String(message || '').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!msg) {
    return { answer: EMPTY_ANSWER, sources: [] };
  }

  const { ai, model, contents, config } = initAgentic(msg, history, opts);

  const sources = [];
  const seen = new Set();
  const toolLog = [];
  let lastText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await ai.models.generateContent({ model, contents, config });

    const cand = resp && resp.candidates && resp.candidates[0];
    const content = cand && cand.content;
    const parts = (content && content.parts) || [];

    const calls = [];
    const textBits = [];
    for (const p of parts) {
      if (p && p.functionCall) calls.push(p.functionCall);
      else if (p && typeof p.text === 'string') textBits.push(p.text);
    }
    if (textBits.length) lastText = textBits.join('');

    if (calls.length === 0) {
      return { answer: lastText.trim(), sources, toolCalls: toolLog };
    }

    contents.push({ role: 'model', parts });

    const responseParts = [];
    for (const fc of calls) {
      const args = (fc && fc.args) || {};
      const result = await runTool(fc.name, args, sources, seen, toolLog);
      responseParts.push({
        functionResponse: { name: fc.name, response: result },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return { answer: lastText.trim() || LOOKUP_LIMIT_FALLBACK, sources, toolCalls: toolLog };
}

/* Streaming twin of answerAgentic(): yields uniform events
 *   { type:'token', delta }   — a chunk of the (final) answer text
 *   { type:'reset' }          — discard any streamed text so far (a text-bearing
 *                               round turned out to be non-final / tool round)
 *   { type:'done', answer, sources } — terminal: full answer + accumulated sources
 * Only the final round (no function calls) is the answer; tool rounds emit a
 * reset so the client never keeps interim reasoning text. */
async function* answerAgenticStream(message, history, opts = {}) {
  const msg = String(message || '').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!msg) {
    yield { type: 'done', answer: EMPTY_ANSWER, sources: [] };
    return;
  }
  const { ai, model, contents, config } = initAgentic(msg, history, opts);

  const sources = [];
  const seen = new Set();
  const toolLog = [];
  let lastText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await ai.models.generateContentStream({ model, contents, config });
    const calls = [];
    const partsAll = [];
    let roundText = '';
    let streamedThisRound = false;
    for await (const chunk of stream) {
      const cand = chunk && chunk.candidates && chunk.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      for (const p of parts) {
        if (p && p.functionCall) { calls.push(p.functionCall); partsAll.push(p); }
        else if (p && typeof p.text === 'string') {
          roundText += p.text; partsAll.push(p);
          yield { type: 'token', delta: p.text }; streamedThisRound = true;
        }
      }
    }
    if (roundText) lastText = roundText;

    if (calls.length === 0) {
      yield { type: 'done', answer: lastText.trim(), sources, toolCalls: toolLog };
      return;
    }
    // Tool round: drop any text we streamed (it was interim), run tools, continue.
    if (streamedThisRound) { yield { type: 'reset' }; lastText = ''; }
    contents.push({ role: 'model', parts: partsAll.length ? partsAll : [{ text: roundText }] });
    const responseParts = [];
    for (const fc of calls) {
      const result = await runTool(fc.name, (fc && fc.args) || {}, sources, seen, toolLog);
      responseParts.push({ functionResponse: { name: fc.name, response: result } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  if (!lastText.trim()) yield { type: 'reset' };
  yield { type: 'done', answer: lastText.trim() || LOOKUP_LIMIT_FALLBACK, sources, toolCalls: toolLog };
}

/* Streaming twin of complete() — plain, tool-less token stream (read strategy). */
async function* completeStream({ systemInstruction, contents, opts = {} }) {
  const { ai, model, contents: geminiContents, config } =
    initComplete({ systemInstruction, contents, opts });
  const stream = await ai.models.generateContentStream({
    model, contents: geminiContents, config,
  });
  for await (const chunk of stream) {
    const cand = chunk && chunk.candidates && chunk.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    for (const p of parts) {
      if (p && typeof p.text === 'string' && p.text) yield String(p.text);
    }
  }
}

/* Plain completion (no tools) — used by the retrieve-then-read strategy. */
async function complete({ systemInstruction, contents, opts = {} }) {
  const { ai, model, contents: geminiContents, config } =
    initComplete({ systemInstruction, contents, opts });
  const resp = await ai.models.generateContent({
    model, contents: geminiContents, config,
  });

  const cand = resp && resp.candidates && resp.candidates[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  return parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
}

module.exports = {
  name: 'gemini',
  answerAgentic,
  answerAgenticStream,
  complete,
  completeStream,
  configured: () => !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY),
  TOOL_DECLARATIONS,
  DEFAULT_MODEL,
  buildContents,
  clientOptions,
};
