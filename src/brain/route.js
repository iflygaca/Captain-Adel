/* ============================================================================
 * Captain Adel — provider routing.
 *
 * Resolves a concrete provider name from the requested provider and the message
 * language:
 *   any registered provider name -> honoured as-is (gemini | allam | jais | …)
 *   'auto' (or unset)            -> Arabic-dominant questions go to the first
 *                                   configured in-Kingdom Arabic provider
 *                                   (ARABIC_PROVIDERS order, ALLaM first; keeps
 *                                   Arabic in-Kingdom); everything else Gemini.
 *
 * MODEL_PROVIDER sets the default when opts.provider is absent.
 * ARABIC_PROVIDER (optional) bumps one Arabic provider to the front of `auto`.
 * ==========================================================================*/

'use strict';

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿ]/g;

// Short ALL-CAPS Latin runs are aviation acronyms (VFR, IFR, METAR, NOTAM,
// ATPL, TCAS, ATC…). Saudi aviation Arabic code-switches heavily with these, so
// counting their letters drags a genuinely-Arabic question below the routing
// threshold and misroutes it to the English path. Drop them before measuring.
const ACRONYM_RE = /\b[A-Z]{2,6}\b/g;

function arabicRatio(s) {
  const str = String(s || '').replace(ACRONYM_RE, ' ');
  const letters = str.match(/\p{L}/gu) || [];
  if (!letters.length) return 0;
  const arabic = str.match(ARABIC_RE) || [];
  return arabic.length / letters.length;
}

function pickProvider(message, opts = {}) {
  const providers = require('./providers');
  const want = opts.provider || process.env.MODEL_PROVIDER || 'gemini';
  if (want !== 'auto' && providers.PROVIDERS[want]) return want;

  // auto: Arabic-dominant -> first configured in-Kingdom Arabic provider.
  if (arabicRatio(message) >= 0.4) {
    const pref = process.env.ARABIC_PROVIDER;
    const order = pref
      ? [pref, ...providers.ARABIC_PROVIDERS.filter((n) => n !== pref)]
      : providers.ARABIC_PROVIDERS;
    for (const name of order) {
      const p = providers.PROVIDERS[name];
      if (p && p.configured && p.configured()) return name;
    }
  }
  return 'gemini';
}

module.exports = { arabicRatio, pickProvider };
