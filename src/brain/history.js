/* ============================================================================
 * Captain Adel — conversation-history normalization.
 *
 * The one home of the history-shaping rules every answer path shares:
 * drop the duplicate trailing user turn chat clients push before POSTing
 * (the current message is passed separately), trim to the last
 * MAX_HISTORY_TURNS, skip blank turns, and coerce roles to 'user'|'model'.
 *
 * A leaf module on purpose: answer.js and providers/gemini.js both need this,
 * and gemini.js cannot require answer.js back (answer.js -> providers ->
 * gemini.js is already a load-time chain, so the reverse edge would be a
 * circular require).
 * ==========================================================================*/

'use strict';

const MAX_HISTORY_TURNS = 12;

function normalizeHistory(message, history, maxTurns = MAX_HISTORY_TURNS) {
  const prior = Array.isArray(history) ? history.slice() : [];
  const last = prior[prior.length - 1];
  if (last && last.role === 'user' && String(last.text || '') === message) prior.pop();

  const out = [];
  for (const h of prior.slice(-maxTurns)) {
    const text = String((h && h.text) || '').trim();
    if (!text) continue;
    out.push({ role: h.role === 'model' ? 'model' : 'user', text });
  }
  return out;
}

module.exports = { normalizeHistory, MAX_HISTORY_TURNS };
