/* ============================================================================
 * Captain Adel — the brain. Single source of truth for the RAG assistant.
 *
 *   answer(message, history, opts) -> Promise<{ answer, sources }>
 *   warmUp()                        -> build the BM25 index at cold start
 *
 * Also re-exports the portable edge helpers (guards, ratelimit) and the
 * retriever so a host can compose its own request pipeline.
 * ==========================================================================*/

'use strict';

const { answer, answerStream } = require('./answer');
const bm25 = require('./bm25');
const guards = require('./guards');
const ratelimit = require('./ratelimit');
const { pickProvider } = require('./route');

function warmUp() {
  bm25.warmUp();
}

module.exports = { answer, answerStream, warmUp, bm25, guards, ratelimit, pickProvider };
