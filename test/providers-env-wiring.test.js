/* Unit tests — per-provider env-var wiring for the Arabic OpenAI-compatible
 * providers (src/brain/providers/{allam,jais,fanar,qwen,commandr}.js).
 *
 * test/providers-openai-compatible.test.js already covers the shared factory
 * generically with synthetic TEST_OAI_* env vars, and test/providers-index.test.js
 * only checks each provider resolves to the right shape. Neither would catch a
 * typo in the *real* env var name a given provider file passes as baseUrlEnv
 * (e.g. ALLAM_BASEURL instead of ALLAM_BASE_URL) — that only breaks in
 * production, when the real deploy env var goes unread. This file requires each
 * real provider module and toggles its actual documented env var(s), asserting
 * configured() flips accordingly. Env is saved/restored per case, same
 * assign-and-restore style as test/config.test.js. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

/* Run fn() with `env` overlaid onto process.env, then restore exactly what was
 * there before (delete keys that were previously unset). */
function withEnv(env, fn) {
  const prev = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

// name -> { module, baseUrlEnv } per each provider's documented Config (env)
// header comment — this is what would silently break on a typo.
const PROVIDERS = [
  { name: 'allam', module: '../src/brain/providers/allam', baseUrlEnv: 'ALLAM_BASE_URL' },
  { name: 'jais', module: '../src/brain/providers/jais', baseUrlEnv: 'JAIS_BASE_URL' },
  { name: 'fanar', module: '../src/brain/providers/fanar', baseUrlEnv: 'FANAR_BASE_URL' },
  { name: 'qwen', module: '../src/brain/providers/qwen', baseUrlEnv: 'QWEN_BASE_URL' },
  { name: 'commandr', module: '../src/brain/providers/commandr', baseUrlEnv: 'COMMANDR_BASE_URL' },
];

for (const { name, module, baseUrlEnv } of PROVIDERS) {
  const provider = require(module);

  test(`${name}: name is "${name}"`, () => {
    assert.equal(provider.name, name);
  });

  test(`${name}: configured() becomes true when ${baseUrlEnv} is set`, () => {
    withEnv({ [baseUrlEnv]: 'http://localhost:9000/v1' }, () => {
      assert.equal(provider.configured(), true);
    });
  });

  test(`${name}: configured() becomes false when ${baseUrlEnv} is unset`, () => {
    withEnv({ [baseUrlEnv]: undefined }, () => {
      assert.equal(provider.configured(), false);
    });
  });

  test(`${name}: configured() only reacts to ${baseUrlEnv}, not to other providers' base URLs`, () => {
    const otherBaseUrlEnvs = PROVIDERS.filter((p) => p.baseUrlEnv !== baseUrlEnv).map((p) => p.baseUrlEnv);
    const othersSet = Object.fromEntries(otherBaseUrlEnvs.map((e) => [e, 'http://x']));
    withEnv({ [baseUrlEnv]: undefined, ...othersSet }, () => {
      assert.equal(provider.configured(), false);
    });
  });
}
