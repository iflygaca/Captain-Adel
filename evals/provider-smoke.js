#!/usr/bin/env node
/* ============================================================================
 * Captain Adel — provider endpoint smoke test (generic).
 *
 * One short turn against a configured retrieve-then-read provider, with a clear
 * pass/fail + diagnostic. Use it before `evals/run.js --provider <name>` or
 * evals/parity.js so a typo in <PROVIDER>_BASE_URL / a bad auth token fails in
 * ~2 seconds instead of after 20 calls.
 *
 * Usage:
 *   ALLAM_BASE_URL=http://host:8000/v1  node evals/provider-smoke.js allam
 *   QWEN_BASE_URL=...  QWEN_API_KEY=...  node evals/provider-smoke.js qwen
 *   FANAR_BASE_URL=... node evals/provider-smoke.js fanar
 *
 * Exit code: 0 on a clean response, 1 on any failure.
 * ==========================================================================*/

'use strict';

const providers = require('../src/brain/providers');

async function smoke(name) {
  const provider = providers.PROVIDERS[name];
  const ENV = name.toUpperCase() + '_BASE_URL';
  const KEY = name.toUpperCase() + '_API_KEY';
  const MODELENV = name.toUpperCase() + '_MODEL';
  const timeoutMs = parseInt(process.env.SMOKE_TIMEOUT_MS, 10) || 15000;

  if (!provider) {
    console.error('Unknown provider "' + name + '". Known: '
      + Object.keys(providers.PROVIDERS).join(', '));
    process.exit(1);
  }
  if (typeof provider.complete !== 'function') {
    console.error('Provider "' + name + '" has no complete() — not a read-mode provider.');
    process.exit(1);
  }
  const base = String(process.env[ENV] || '').trim();
  if (!base) {
    console.error(ENV + ' is not set.');
    console.error('Run:  ' + ENV + '=http://host:8000/v1  node evals/provider-smoke.js ' + name);
    process.exit(1);
  }

  console.log(name + ' smoke');
  console.log('  base:  ' + base);
  console.log('  model: ' + (process.env[MODELENV] || provider.DEFAULT_MODEL));
  console.log('  auth:  ' + (process.env[KEY] ? 'bearer token set' : 'none'));
  console.log('');

  const started = Date.now();
  let text;
  try {
    text = await provider.complete({
      systemInstruction:
        'You are a terse echo. Respond with the single English word "pong" and nothing else.',
      contents: [{ role: 'user', text: 'ping' }],
      opts: { maxTokens: 8, timeoutMs },
    });
  } catch (err) {
    const ms = Date.now() - started;
    console.error('FAIL  (' + ms + 'ms)  ' + String((err && err.message) || err));
    console.error('');
    console.error('Common causes:');
    console.error('  - ' + ENV + ' points at the wrong host or wrong path');
    console.error('    (must include /v1 — e.g. http://host:8000/v1)');
    console.error('  - vLLM/TGI is not running, or the served model name does not match');
    console.error('    ' + MODELENV + ' (default: ' + provider.DEFAULT_MODEL + ')');
    console.error('  - ' + KEY + ' required but not set, or wrong');
    process.exit(1);
  }
  const ms = Date.now() - started;

  if (!text) {
    console.error('FAIL  (' + ms + 'ms)  empty response');
    console.error('  The endpoint responded but choices[0].message.content was empty.');
    console.error('  Check the served model and that the chat template is enabled.');
    process.exit(1);
  }

  console.log('PASS  (' + ms + 'ms)  response: ' + JSON.stringify(text));
  console.log('');
  console.log('Endpoint is reachable and answers /chat/completions. You can now run:');
  console.log('  ' + ENV + '=' + base + '  node evals/run.js --provider ' + name);
}

if (require.main === module) {
  const name = process.argv[2] || process.env.SMOKE_PROVIDER || 'allam';
  smoke(name).catch((err) => {
    console.error('smoke runner crashed:', err);
    process.exit(1);
  });
}

module.exports = { smoke };
