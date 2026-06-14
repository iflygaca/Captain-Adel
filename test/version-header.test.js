/* Integration test — /v1/chat echoes the contract version header.
 *
 * The gateway sends X-Adel-Api-Version; the service must echo the version it
 * speaks on every response so a mismatch is observable. We exercise the
 * early-return 400 path (empty message) so no model call / API key is needed —
 * the header is set at the top of the handler, before the brain runs. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { app } = require('../src/server');

let server; let base;
before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server && server.close());

async function chat(headers) {
  // Empty message -> 400 message_required, before any model call.
  const res = await fetch(base + '/v1/chat', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify({ message: '' }),
  });
  return res;
}

test('echoes X-Adel-Api-Version on the response', async () => {
  const res = await chat();
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('x-adel-api-version'), '1');
});

test('still echoes the service version when the caller sends a matching one', async () => {
  const res = await chat({ 'X-Adel-Api-Version': '1' });
  assert.equal(res.headers.get('x-adel-api-version'), '1');
});

test('echoes the service version even when the caller sends a different one', async () => {
  const res = await chat({ 'X-Adel-Api-Version': '2' });
  // The service reports the version IT speaks, regardless of the caller's claim.
  assert.equal(res.headers.get('x-adel-api-version'), '1');
});
