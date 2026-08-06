/* Guard tests — the committed iOS SSE fixtures stay true wire vectors.
 *
 * ios/AdelCore/Tests/AdelSSETests/Fixtures/*.sse are byte-exact captures of
 * POST /v1/chat?stream=1 recorded by scripts/record-sse-fixtures.js (real
 * pipeline, stubbed providers). The Swift client's FixturePlaybackTests replay
 * them on a Mac; this file replays them here with the SHIPPED web parser
 * (chat-core.js sseEvents) against the same manifest.json declarations — so a
 * server-side change that alters the stream grammar breaks this gate before it
 * breaks the app, and the Node and Swift views of the contract cannot fork.
 * Reads committed files only: no keys, no network, no server boot. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../public/assets/js/chat-core.js');

const DIR = path.join(__dirname, '..', 'ios', 'AdelCore', 'Tests', 'AdelSSETests', 'Fixtures');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));

/* A minimal Response stand-in: sseEvents only touches res.body.getReader(). */
function streamOf(buf, chunkSize) {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= buf.length) { controller.close(); return; }
      const end = chunkSize ? Math.min(i + chunkSize, buf.length) : buf.length;
      controller.enqueue(new Uint8Array(buf.subarray(i, end)));
      i = end;
    },
  });
}

async function events(buf, chunkSize) {
  const out = [];
  for await (const ev of core.sseEvents({ body: streamOf(buf, chunkSize) })) out.push(ev);
  return out;
}

/* The golden invariant, same shape as test/answer-stream.test.js. */
const tokensAfterLastReset = (evs) => {
  const last = evs.map((e) => e.type).lastIndexOf('reset');
  return evs.slice(last + 1).filter((e) => e.type === 'token').map((e) => e.delta).join('');
};

test('sse fixtures: the manifest and the directory agree exactly', () => {
  const listed = manifest.fixtures.map((f) => f.file).sort();
  const present = fs.readdirSync(DIR).filter((f) => f !== 'manifest.json').sort();
  assert.deepEqual(present, listed, 'every fixture is declared and every declaration exists');
  assert.equal(manifest.apiVersion, '1', 'fixtures were recorded against contract v1');
});

for (const fx of manifest.fixtures.filter((f) => f.transport === 'sse')) {
  test(`sse fixture ${fx.file}: replays to its manifest declaration`, async () => {
    const buf = fs.readFileSync(path.join(DIR, fx.file));
    assert.ok(!buf.includes(0x0d),
      'no \\r bytes — EOL conversion would corrupt the \\n\\n frame grammar (.gitattributes *.sse -text)');
    assert.equal(buf.toString('utf8').endsWith('data: [DONE]\n\n'), fx.expect.done,
      '[DONE] terminator presence matches');

    const whole = await events(buf);
    const chunked = await events(buf, 7);   // force frames to split across reads
    assert.deepEqual(chunked, whole, 'chunked parse agrees with whole-buffer parse');

    const types = whole.map((e) => e.type);
    assert.equal(types.filter((t) => t === 'token').length, fx.expect.tokens, 'token count');
    assert.equal(types.filter((t) => t === 'reset').length, fx.expect.resets, 'reset count');
    assert.equal(types.includes('error'), fx.expect.error, 'error frame presence');

    const final = whole.find((e) => e.type === 'final') || null;
    assert.equal(!!final, fx.expect.final, 'final presence');
    if (final) {
      assert.equal(final.kind ?? null, fx.expect.kind, 'kind');
      assert.equal(final.refusalClass ?? null, fx.expect.refusalClass, 'refusalClass');
      assert.equal((final.sources || []).length, fx.expect.sources, 'source count');
      assert.ok((final.sources || []).length <= 3, 'the UI cap: at most 3 sources');
      for (const s of final.sources || []) {
        if (s.verbatim) assert.ok(s.verbatim.length <= 600, 'verbatim stays within the 600-char cap');
      }
      assert.equal(final.meta ? (final.meta.provider ?? null) : null, fx.expect.provider, 'provider');
      if (fx.expect.reassemblyEqualsFinal) {
        assert.equal(tokensAfterLastReset(whole), final.answer,
          'tokens after the last reset reassemble to exactly final.answer');
      }
    }
  });
}

for (const fx of manifest.fixtures.filter((f) => f.transport === 'json')) {
  test(`json fixture ${fx.file}: matches its manifest declaration`, () => {
    const env = JSON.parse(fs.readFileSync(path.join(DIR, fx.file), 'utf8'));
    assert.equal(env.status, fx.expect.status, 'HTTP status');
    assert.equal(env.body.error, fx.expect.errorCode, 'error code');
    assert.equal(env.body.retryAfter, fx.expect.retryAfter, 'retryAfter');
    assert.equal(env.headers['x-adel-api-version'], '1', 'version header covers rejections too');
  });
}
