#!/usr/bin/env node
/* ----------------------------------------------------------------------------
 * record-sse-fixtures.js — regenerate the iOS SSE stream fixtures.
 *
 * Boots the real Express app in-process (no listen port exposed beyond
 * localhost, no keys, no network) and drives POST /v1/chat?stream=1 with the
 * provider registry swapped for deterministic fakes — exactly the seams the
 * unit tests use (test/answer-stream.test.js, test/server-chat.test.js). The
 * full real pipeline runs: routing → BM25 retrieval → grounding/decorate →
 * SSE serialization. Captured bodies are written byte-exact (arrayBuffer, no
 * re-encoding) so they are true wire vectors for the iOS client.
 *
 * Writes:  ios/AdelCore/Tests/AdelSSETests/Fixtures/*.sse  (+ http-429.json)
 *          ios/AdelCore/Tests/AdelSSETests/Fixtures/manifest.json
 *
 * The manifest records the OBSERVED shape of each fixture (token/reset counts,
 * final kind, sources…), self-checked against each recipe's intent before
 * anything is written. Two test suites replay the same manifest:
 *   - test/sse-fixtures.test.js   (Node, part of `npm run test:unit`)
 *   - ios/AdelCore/Tests/AdelSSETests/FixturePlaybackTests.swift (Mac)
 *
 * One-off tool: run it only to regenerate after a deliberate stream-contract
 * change, review the git diff, and commit the fixtures. Never runs in CI and
 * never at request time.
 *
 * Usage:
 *   npm run fixtures:sse
 * --------------------------------------------------------------------------*/
'use strict';

/* ---- env must be set BEFORE any require: config.js reads it once ---------- */
process.env.ADEL_RL_BURST = '1000';       // 9 sequential captures must never 429
process.env.ADEL_RL_IP = '1000';
process.env.ADEL_RL_SESSION = '1000';
process.env.GEMINI_API_KEY = 'fixture-local-fake';  // never used: providers are faked
delete process.env.FIREBASE_PROJECT_ID;   // SaaS layer stays dark (no quota, no auth)
delete process.env.GOOGLE_CLOUD_PROJECT;
delete process.env.ADEL_API_KEY;
delete process.env.ADEL_DAILY_FREE;
delete process.env.ADEL_DAILY_ANON;
delete process.env.MODEL_PROVIDER;
delete process.env.ARABIC_PROVIDER;
delete process.env.ALLAM_BASE_URL;

if (process.env.EMBEDDINGS_BASE_URL || process.env.RERANK_BASE_URL) {
  console.error('Refusing to run: EMBEDDINGS_BASE_URL / RERANK_BASE_URL is set.');
  console.error('Fixtures must come from pure BM25 retrieval to stay deterministic.');
  process.exit(1);
}

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const server = require('../src/server');
const realBrain = require('../src/brain');
const providers = require('../src/brain/providers');
const { makeSource } = require('../src/brain/grounding');

const FIXTURES_DIR = path.join(
  __dirname, '..', 'ios', 'AdelCore', 'Tests', 'AdelSSETests', 'Fixtures');

/* Real brain behind the seam; individual fixtures override answerStream or
 * ratelimit on the copy and restore afterwards. */
const fakeBrain = Object.assign({}, realBrain);
server.__setBrain(fakeBrain);

/* ---- the same helpers the unit tests use ---------------------------------- */

async function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function withProviders(overrides, fn) {
  const saved = {};
  for (const [name, impl] of Object.entries(overrides)) {
    saved[name] = providers.PROVIDERS[name];
    providers.PROVIDERS[name] = impl;
  }
  try { return await fn(); } finally {
    for (const name of Object.keys(overrides)) providers.PROVIDERS[name] = saved[name];
  }
}

/* A gemini fake whose agentic stream yields `text` in fixed-size chunks and
 * finishes with a done event carrying the same full text (as the real one does). */
function streamingGemini(text, { sources = [], toolCalls = [], chunk = 40 } = {}) {
  return {
    answerAgenticStream: async function* (_msg, _history, _opts) {
      for (let i = 0; i < text.length; i += chunk) {
        yield { type: 'token', delta: text.slice(i, i + chunk) };
      }
      yield { type: 'done', answer: text, sources, toolCalls };
    },
    configured: () => true,
  };
}

/* ---- capture + shape inspection ------------------------------------------- */

let baseUrl;

async function capture(name, body) {
  const res = await fetch(`${baseUrl}/v1/chat?stream=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ session: `fixture-${name}-01` }, body)),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  realBrain.ratelimit._reset && realBrain.ratelimit._reset();
  return { status: res.status, headers: res.headers, buf };
}

/* Parse a captured SSE body the same way test/server-chat.test.js does. */
function inspect(buf) {
  const text = buf.toString('utf8');
  const done = text.endsWith('data: [DONE]\n\n');
  const frames = text.split('\n\n').filter(Boolean)
    .map((f) => f.replace(/^data: /, ''))
    .filter((d) => d !== '[DONE]')
    .map((d) => JSON.parse(d));
  const types = frames.map((f) => f.type);
  const lastReset = types.lastIndexOf('reset');
  const reassembly = frames.slice(lastReset + 1)
    .filter((f) => f.type === 'token').map((f) => f.delta).join('');
  const final = frames.find((f) => f.type === 'final') || null;
  return {
    tokens: types.filter((t) => t === 'token').length,
    resets: types.filter((t) => t === 'reset').length,
    error: types.includes('error'),
    done,
    final,
    reassemblyEqualsFinal: !!final && reassembly === final.answer,
  };
}

/* Abort loudly if a capture contradicts the recipe's intent — a wrong fixture
 * must never be written, let alone committed. */
function check(name, cond, detail) {
  if (!cond) throw new Error(`fixture ${name}: ${detail}`);
}

/* ---- the fixture recipes -------------------------------------------------- */

// Long enough that tokens clear the 80-char TRAILER_HOLD and stream before final.
const LONG_ANSWER =
  'In Class D airspace, VFR requires flight visibility of 5 km and cloud ' +
  'clearance of at least 1,500 m horizontally and 300 m vertically — see ' +
  'GACAR Part 91, §91.155(a). Keep it VFR, Captain, and mind the ceilings.';

const SOURCE_91_155 = makeSource(
  'GACAR Part 91, §91.155(a)',
  'library.html#91.155',
  '…no person may operate an aircraft under VFR when the flight visibility is ' +
  'less than 5 km, or at a distance from clouds of less than 1 500 m ' +
  'horizontally and 300 m vertically…',
  'AIRAC 2505');

const RECIPES = [
  {
    file: 'grounded-long.sse',
    description: 'long grounded answer: tokens stream past the 80-char hold, the control trailer never leaks',
    request: { message: 'What are the VFR weather minima in Class D airspace?', provider: 'gemini' },
    async run(name, request) {
      const raw = `${LONG_ANSWER}\n<<adel kind=grounded>>`;
      return withProviders(
        { gemini: streamingGemini(raw, { sources: [SOURCE_91_155] }) },
        () => capture(name, request));
    },
    intent(name, obs) {
      check(name, obs.done && obs.final && !obs.error, 'expected a clean [DONE]-terminated stream');
      check(name, obs.tokens >= 2, 'expected ≥2 tokens past the hold');
      check(name, obs.resets === 0, 'expected no reset');
      check(name, obs.final.kind === 'grounded', `expected kind grounded, got ${obs.final.kind}`);
      check(name, obs.reassemblyEqualsFinal, 'tokens must reassemble to final.answer');
      check(name, !/adel kind/.test(obs.final.answer), 'trailer must be stripped');
    },
  },
  {
    file: 'short-remainder.sse',
    description: 'answer under the 80-char hold: exactly one remainder token, then final',
    request: { message: 'hello', provider: 'gemini' },
    async run(name, request) {
      return withProviders(
        { gemini: streamingGemini('Roger — on the line, Captain.') },
        () => capture(name, request));
    },
    intent(name, obs) {
      check(name, obs.done && obs.final && !obs.error, 'expected a clean stream');
      check(name, obs.tokens === 1 && obs.resets === 0, 'expected exactly [token, final]');
      check(name, obs.reassemblyEqualsFinal, 'the one token must equal final.answer');
    },
  },
  {
    file: 'partial.sse',
    description: 'read-strategy provider cites a section absent from retrieval → partial, with real BM25 sources',
    request: { message: 'What are the medical certificate requirements?', provider: 'allam' },
    async run(name, request) {
      const fakeAllam = {
        completeStream: async function* () {
          yield 'A Class 1 medical certificate is required for ATPL privileges, ';
          yield 'and renewal cadence is set out in GACAR Part 67, §67.999.';
        },
        configured: () => true,
      };
      return withEnv({ ALLAM_BASE_URL: 'http://allam.fixture' }, () =>
        withProviders({ allam: fakeAllam }, () => capture(name, request)));
    },
    intent(name, obs) {
      check(name, obs.done && obs.final && !obs.error, 'expected a clean stream');
      check(name, (obs.final.sources || []).length >= 1, 'expected real retrieved sources');
      check(name, obs.final.kind === 'partial', `expected kind partial, got ${obs.final.kind}`);
      check(name, obs.reassemblyEqualsFinal, 'tokens must reassemble to final.answer');
    },
  },
  {
    file: 'refusal-1.1.sse',
    description: 'declared refusal with taxonomy class 1.1 (unverifiable figure)',
    request: { message: 'What will the Class 1 medical renewal fee be next year?', provider: 'gemini' },
    async run(name, request) {
      const raw = "I can't verify that figure, Captain — future fee schedules are not in the " +
        'GACAR corpus I cite from. Check with GACA before you rely on a number.' +
        '\n<<adel kind=refusal class=1.1>>';
      return withProviders({ gemini: streamingGemini(raw) }, () => capture(name, request));
    },
    intent(name, obs) {
      check(name, obs.done && obs.final && !obs.error, 'expected a clean stream');
      check(name, obs.final.kind === 'refusal', `expected kind refusal, got ${obs.final.kind}`);
      check(name, obs.final.refusalClass === '1.1', `expected class 1.1, got ${obs.final.refusalClass}`);
    },
  },
  {
    file: 'na.sse',
    description: 'pleasantry declared na: no badge, no refusal class',
    request: { message: 'thanks, that is all for today!', provider: 'gemini' },
    async run(name, request) {
      return withProviders(
        { gemini: streamingGemini('Any time, Captain — clear skies out there.\n<<adel kind=na>>') },
        () => capture(name, request));
    },
    intent(name, obs) {
      check(name, obs.done && obs.final && !obs.error, 'expected a clean stream');
      check(name, obs.final.kind === 'na', `expected kind na, got ${obs.final.kind}`);
      check(name, obs.final.refusalClass === null || obs.final.refusalClass === undefined,
        'expected no refusal class');
    },
  },
  {
    file: 'reset-fallback.sse',
    description: 'primary provider dies mid-stream → reset wipes streamed text, fallback re-drives',
    request: { message: 'What are the VFR weather minima in Class D airspace?', provider: 'gemini' },
    async run(name, request) {
      const failingGemini = {
        answerAgenticStream: async function* () {
          yield { type: 'token', delta: 'x'.repeat(120) };   // clears the hold → a token streams
          throw new Error('fixture: primary stream died');
        },
        configured: () => true,
      };
      const fallbackAllam = {
        completeStream: async function* () { yield LONG_ANSWER; },
        configured: () => true,
      };
      return withEnv({ ALLAM_BASE_URL: 'http://allam.fixture', ARABIC_PROVIDER: undefined }, () =>
        withProviders({ gemini: failingGemini, allam: fallbackAllam }, () => capture(name, request)));
    },
    intent(name, obs) {
      check(name, obs.done && obs.final && !obs.error, 'expected a clean stream after fallback');
      check(name, obs.resets === 1, `expected exactly one reset, got ${obs.resets}`);
      check(name, obs.final.meta && obs.final.meta.provider === 'allam',
        'final must be attributed to the fallback provider');
      check(name, obs.reassemblyEqualsFinal, 'post-reset tokens must reassemble to final.answer');
    },
  },
  {
    file: 'reset-toolround.sse',
    description: 'agentic tool round: interim text is reset, final carries worked toolCalls',
    request: { message: 'Runway 34, wind 290/15 — what is the crosswind component?', provider: 'gemini' },
    async run(name, request) {
      const finalText = 'With wind 290° at 15 kt on runway 34, the crosswind component is ' +
        'about 11 kt from the left — inside typical light-aircraft limits, Captain.' +
        '\n<<adel kind=na>>';
      const toolCalls = [{
        name: 'compute_wind',
        args: { runway: 34, windDir: 290, windSpeed: 15 },
        result: {
          inputs: { runway: 34, windDir: 290, windSpeed: 15 },
          steps: [
            { label: 'Angle off runway', expr: '|290 − 340|', value: 50, unit: '°' },
            { label: 'Crosswind', expr: '15 × sin(50°)', value: 11.5, unit: 'kt' },
          ],
          result: { crosswindKt: 11.5, headwindKt: 9.6, side: 'left' },
        },
      }];
      const toolRoundGemini = {
        answerAgenticStream: async function* () {
          yield { type: 'token', delta: 'Working the wind triangle for runway 34… '.repeat(3) };
          yield { type: 'reset' };
          for (let i = 0; i < finalText.length; i += 40) {
            yield { type: 'token', delta: finalText.slice(i, i + 40) };
          }
          yield { type: 'done', answer: finalText, sources: [], toolCalls };
        },
        configured: () => true,
      };
      return withProviders({ gemini: toolRoundGemini }, () => capture(name, request));
    },
    intent(name, obs) {
      check(name, obs.done && obs.final && !obs.error, 'expected a clean stream');
      check(name, obs.resets === 1, `expected exactly one reset, got ${obs.resets}`);
      check(name, obs.reassemblyEqualsFinal, 'post-reset tokens must reassemble to final.answer');
      check(name, obs.final.meta && Array.isArray(obs.final.meta.toolCalls)
        && obs.final.meta.toolCalls.length === 1, 'final must carry the worked tool call');
    },
  },
  {
    file: 'error-midstream.sse',
    description: 'brain dies after a token: error frame terminates the stream, no [DONE]',
    request: { message: 'hi', provider: 'gemini' },
    async run(name, request) {
      const saved = fakeBrain.answerStream;
      fakeBrain.answerStream = async function* () {
        yield { type: 'token', delta: 'partial…' };
        throw new Error('fixture: model exploded mid-stream');
      };
      try { return await capture(name, request); }
      finally { fakeBrain.answerStream = saved; }
    },
    intent(name, obs) {
      check(name, !obs.done, 'an errored stream must NOT end with [DONE]');
      check(name, obs.error && !obs.final, 'expected a terminal error frame and no final');
      check(name, obs.tokens === 1, 'expected the one pre-failure token');
    },
  },
];

/* ---- main ----------------------------------------------------------------- */

async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const httpServer = http.createServer(server.app);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  const manifest = {
    generator: 'scripts/record-sse-fixtures.js',
    apiVersion: '1',
    note: 'Byte-exact /v1/chat?stream=1 captures from the real pipeline with stubbed providers. ' +
      'Regenerate with `npm run fixtures:sse` and review the diff; never regenerate in CI.',
    fixtures: [],
  };
  const rows = [];

  try {
    for (const recipe of RECIPES) {
      const name = recipe.file.replace(/\.sse$/, '');
      const { status, buf } = await recipe.run(name, recipe.request);
      check(name, status === 200, `expected HTTP 200, got ${status}`);
      check(name, !buf.includes(0x0d), 'capture must not contain \\r bytes');
      const obs = inspect(buf);
      recipe.intent(name, obs);

      fs.writeFileSync(path.join(FIXTURES_DIR, recipe.file), buf);
      manifest.fixtures.push({
        file: recipe.file,
        transport: 'sse',
        request: recipe.request,
        description: recipe.description,
        expect: {
          done: obs.done,
          final: !!obs.final,
          error: obs.error,
          kind: obs.final ? (obs.final.kind ?? null) : null,
          refusalClass: obs.final ? (obs.final.refusalClass ?? null) : null,
          tokens: obs.tokens,
          resets: obs.resets,
          reassemblyEqualsFinal: obs.reassemblyEqualsFinal,
          sources: obs.final ? (obs.final.sources || []).length : 0,
          provider: obs.final && obs.final.meta ? (obs.final.meta.provider ?? null) : null,
        },
      });
      rows.push([recipe.file, `${buf.length}B`, `tokens ${obs.tokens}`, `resets ${obs.resets}`,
        obs.final ? `kind ${obs.final.kind}` : (obs.error ? 'error' : '—'),
        obs.done ? '[DONE]' : 'no [DONE]']);
    }

    /* The one JSON-envelope fixture: 429 rejected before the stream opens. */
    {
      const savedRl = fakeBrain.ratelimit;
      fakeBrain.ratelimit = Object.assign({}, realBrain.ratelimit, {
        check: () => ({ ok: false, scope: 'ip', retryAfter: 7 }),
      });
      let envelope;
      try {
        const res = await fetch(`${baseUrl}/v1/chat?stream=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'hi', session: 'fixture-http-429-01' }),
        });
        envelope = {
          status: res.status,
          headers: {
            'content-type': res.headers.get('content-type'),
            'retry-after': res.headers.get('retry-after'),
            'x-adel-api-version': res.headers.get('x-adel-api-version'),
          },
          body: await res.json(),
        };
      } finally {
        fakeBrain.ratelimit = savedRl;
        realBrain.ratelimit._reset && realBrain.ratelimit._reset();
      }
      check('http-429', envelope.status === 429, `expected 429, got ${envelope.status}`);
      check('http-429', envelope.body.error === 'rate_limited', 'expected rate_limited body');
      fs.writeFileSync(path.join(FIXTURES_DIR, 'http-429.json'),
        `${JSON.stringify(envelope, null, 2)}\n`);
      manifest.fixtures.push({
        file: 'http-429.json',
        transport: 'json',
        request: { message: 'hi' },
        description: 'rate-limited before the stream opens: plain JSON 429 with Retry-After',
        expect: { status: 429, errorCode: 'rate_limited', retryAfter: envelope.body.retryAfter ?? 7 },
      });
      rows.push(['http-429.json', '', `status ${envelope.status}`, '', envelope.body.error, '']);
    }

    fs.writeFileSync(path.join(FIXTURES_DIR, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    httpServer.close();
  }

  console.log(`Wrote ${manifest.fixtures.length} fixtures + manifest.json → ${path.relative(process.cwd(), FIXTURES_DIR)}`);
  for (const r of rows) console.log(`  ${r.filter(Boolean).join('  ·  ')}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
