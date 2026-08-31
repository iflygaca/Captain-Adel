/* Unit tests — src/middleware/cors.js.
 *
 * The CORS gate is invoked directly with fake req/res/next objects. It reads
 * config.allowedOrigins at call time, so tests overlay that property on the
 * shared config singleton and restore it. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const corsMiddleware = require('../src/middleware/cors');
const config = require('../src/config');

function fakeRes() {
  return {
    statusCode: null, headers: {}, body: undefined, ended: false,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    end() { this.ended = true; return this; },
  };
}

function run({ origin, method = 'GET' }, allowed = ['https://captadel.com']) {
  const prev = config.allowedOrigins;
  config.allowedOrigins = allowed;
  try {
    const req = { headers: origin ? { origin } : {}, method };
    const res = fakeRes();
    let nexted = false;
    corsMiddleware(req, res, () => { nexted = true; });
    return { res, nexted };
  } finally {
    config.allowedOrigins = prev;
  }
}

test('no Origin header (server-to-server) passes straight through', () => {
  const { res, nexted } = run({ origin: undefined });
  assert.equal(nexted, true);
  assert.equal(res.statusCode, null);
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
});

test('an allowed origin gets the CORS headers and continues', () => {
  const { res, nexted } = run({ origin: 'https://captadel.com' });
  assert.equal(nexted, true);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://captadel.com');
  assert.equal(res.headers.Vary, 'Origin');
  assert.match(res.headers['Access-Control-Allow-Methods'], /POST/);
});

test('localhost and 127.0.0.1 are always allowed (any port, dev)', () => {
  for (const origin of ['http://localhost:5173', 'http://localhost', 'http://127.0.0.1:8080']) {
    const { res, nexted } = run({ origin }, ['https://captadel.com']);
    assert.equal(nexted, true, `${origin} should pass`);
    assert.equal(res.headers['Access-Control-Allow-Origin'], origin);
  }
});

test('vercel.app deployments and preview origins are allowed', () => {
  for (const origin of ['https://test-captadel.vercel.app', 'https://test-captadel-preview.vercel.app']) {
    const { res, nexted } = run({ origin }, ['https://captadel.com']);
    assert.equal(nexted, true, `${origin} should pass`);
    assert.equal(res.headers['Access-Control-Allow-Origin'], origin);
  }
});

test('a disallowed origin is rejected with 403 and does not continue', () => {
  const { res, nexted } = run({ origin: 'https://evil.example' });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'origin_not_allowed' });
});

test('an OPTIONS preflight from an allowed origin ends with 204', () => {
  const { res, nexted } = run({ origin: 'https://captadel.com', method: 'OPTIONS' });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://captadel.com');
});

test('a disallowed OPTIONS preflight is still rejected with 403', () => {
  const { res, nexted } = run({ origin: 'https://evil.example', method: 'OPTIONS' });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
});
