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
const { makeSource } = require('../grounding');
const { composeSystemInstruction } = require('../system-prompt');

const DEFAULT_MODEL = process.env.CAPTAIN_ADEL_MODEL || 'gemini-2.5-flash';
const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_TURNS = 12;
const MAX_MESSAGE_CHARS = 4000;

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

function pushSource(sources, seen, citation, url, text, version) {
  if (!citation && !url) return;
  let anchor = String(url || '');
  if (anchor.includes('#')) anchor = anchor.replace(/-\d+$/, '');
  const key = (citation ? citation.trim().toLowerCase() : '') + '|' + anchor;
  if (seen.has(key)) return;
  seen.add(key);
  sources.push(makeSource(citation, url, text, version));
}

function runTool(name, args, sources, seen) {
  try {
    if (name === 'search_library') {
      const hits = bm25.searchLibrary(args.query, args.top_k || 6, args.filter_part || null);
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
  const prior = Array.isArray(history) ? history.slice() : [];
  const last = prior[prior.length - 1];
  if (last && last.role === 'user' && String(last.text || '') === message) {
    prior.pop();
  }
  const trimmed = prior.slice(-MAX_HISTORY_TURNS);

  const contents = [];
  for (const h of trimmed) {
    const text = String((h && h.text) || '').trim();
    if (!text) continue;
    contents.push({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });
  return contents;
}

async function answerAgentic(message, history, opts = {}) {
  const msg = String(message || '').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!msg) {
    return { answer: 'Say again — I did not catch a question there, Captain.', sources: [] };
  }

  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const model = opts.model || DEFAULT_MODEL;

  const ai = new GoogleGenAI({ apiKey });
  const contents = buildContents(msg, history);

  const config = {
    systemInstruction: composeSystemInstruction({
      product: opts.product,
      systemSuffix: opts.systemSuffix,
      strategy: 'agentic',
    }),
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    temperature: 0.3,
    maxOutputTokens: 4096,
  };

  const sources = [];
  const seen = new Set();
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
      return { answer: lastText.trim(), sources };
    }

    contents.push({ role: 'model', parts });

    const responseParts = [];
    for (const fc of calls) {
      const args = (fc && fc.args) || {};
      const result = runTool(fc.name, args, sources, seen);
      responseParts.push({
        functionResponse: { name: fc.name, response: result },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  const fallback = lastText.trim() ||
    'I had to dig through several sections and ran past my lookup limit for ' +
    'this turn. Ask me again, a little more specifically, and I will pull the ' +
    'exact citation.';
  return { answer: fallback, sources };
}

/* Plain completion (no tools) — used by the retrieve-then-read strategy. */
async function complete({ systemInstruction, contents, opts = {} }) {
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const model = opts.model || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  const geminiContents = (contents || []).map((c) => ({
    role: c.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(c.text || '') }],
  }));

  const resp = await ai.models.generateContent({
    model,
    contents: geminiContents,
    config: { systemInstruction, temperature: 0.2, maxOutputTokens: 2048 },
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
  complete,
  configured: () => !!(process.env.GEMINI_API_KEY),
  TOOL_DECLARATIONS,
  DEFAULT_MODEL,
};
