/* Unit tests — src/config.js.
 *
 * config.js reads process.env once at require-time and caches the result, so
 * each scenario sets env, drops the module from the require cache, re-requires,
 * and restores. Focus: the env-parsing branches (intEnv clamping, list()
 * trimming, allowedOrigins fallback, launchMode / freePeriod normalization)
 * that line coverage alone (100%) leaves under-tested on the branch axis. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const CONFIG_PATH = require.resolve('../src/config');

/* Load a fresh config module under a given env overlay, then restore env and
 * the require cache so other suites see the unmodified module. */
function loadConfig(env) {
  const touched = Object.keys(env);
  const prev = {};
  for (const k of touched) {
    prev[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  delete require.cache[CONFIG_PATH];
  try {
    return require('../src/config');
  } finally {
    for (const k of touched) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    delete require.cache[CONFIG_PATH];
  }
}

test('intEnv: parses a valid non-negative integer', () => {
  assert.equal(loadConfig({ ADEL_DAILY_FREE: '25' }).freeDaily, 25);
});

test('intEnv: clamps a negative value to the default (not the negative)', () => {
  // parseInt('-5') is finite but < 0, so intEnv returns the default (0).
  assert.equal(loadConfig({ ADEL_DAILY_FREE: '-5' }).freeDaily, 0);
});

test('intEnv: non-numeric falls back to the default', () => {
  assert.equal(loadConfig({ ADEL_DAILY_ANON: 'lots' }).anonDaily, 0);
});

test('intEnv: unset falls back to the default', () => {
  assert.equal(loadConfig({ ADEL_DAILY_FREE: undefined }).freeDaily, 0);
});

test('port: invalid PORT falls back to 8787', () => {
  assert.equal(loadConfig({ PORT: 'abc' }).port, 8787);
  assert.equal(loadConfig({ PORT: '3000' }).port, 3000);
});

test('list(): splits, trims, and drops empty entries for allowedOrigins', () => {
  const c = loadConfig({ ALLOWED_ORIGINS: ' https://a.com , , https://b.com ,' });
  assert.deepEqual(c.allowedOrigins, ['https://a.com', 'https://b.com']);
});

test('allowedOrigins: falls back to DEFAULT_ORIGINS when env is unset/empty', () => {
  const c = loadConfig({ ALLOWED_ORIGINS: undefined });
  assert.ok(c.allowedOrigins.includes('https://captadel.com'));
  assert.ok(c.allowedOrigins.includes('https://flygaca.com'));
  // An all-whitespace/comma value is empty after filtering -> still the defaults.
  assert.deepEqual(loadConfig({ ALLOWED_ORIGINS: ' , ' }).allowedOrigins,
    loadConfig({ ALLOWED_ORIGINS: undefined }).allowedOrigins);
});

test('launchMode: only "free" (case-insensitive) enables it', () => {
  assert.equal(loadConfig({ ADEL_LAUNCH_MODE: 'free' }).launchMode, 'free');
  assert.equal(loadConfig({ ADEL_LAUNCH_MODE: 'FREE' }).launchMode, 'free');
  assert.equal(loadConfig({ ADEL_LAUNCH_MODE: 'paid' }).launchMode, '');
  assert.equal(loadConfig({ ADEL_LAUNCH_MODE: undefined }).launchMode, '');
});

test('freePeriod: normalizes to "month" only for "month", else "day"', () => {
  assert.equal(loadConfig({ ADEL_FREE_PERIOD: 'month' }).freePeriod, 'month');
  assert.equal(loadConfig({ ADEL_FREE_PERIOD: 'MONTH' }).freePeriod, 'month');
  assert.equal(loadConfig({ ADEL_FREE_PERIOD: 'week' }).freePeriod, 'day');
  assert.equal(loadConfig({ ADEL_FREE_PERIOD: undefined }).freePeriod, 'day');
});

test('siteUrl: strips trailing slashes', () => {
  assert.equal(loadConfig({ SITE_URL: 'https://captadel.com///' }).siteUrl, 'https://captadel.com');
  assert.equal(loadConfig({ SITE_URL: undefined }).siteUrl, 'https://captadel.com');
});

test('provider: defaults to gemini, honours MODEL_PROVIDER', () => {
  assert.equal(loadConfig({ MODEL_PROVIDER: undefined }).provider, 'gemini');
  assert.equal(loadConfig({ MODEL_PROVIDER: 'allam' }).provider, 'allam');
});

test('maxBodyBytes: defaults to 64 KiB, honours a numeric override', () => {
  assert.equal(loadConfig({ MAX_BODY_BYTES: undefined }).maxBodyBytes, 64 * 1024);
  assert.equal(loadConfig({ MAX_BODY_BYTES: '2048' }).maxBodyBytes, 2048);
});
