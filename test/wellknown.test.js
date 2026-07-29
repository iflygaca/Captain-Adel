/* Serving invariant — files under /.well-known/ must be reachable.
 *
 * Apple Pay (via the Moyasar widget) requires the domain-association file at
 * /.well-known/apple-developer-merchantid-domain-association. Express's default
 * static handler uses dotfiles: 'ignore', which would 404 the whole dotfile
 * directory; server.js mounts it explicitly. README.md is committed in that
 * directory, so a 200 here proves the mount is wired (and that a future
 * association file dropped alongside it will be served). No network, no keys. */
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

test('/.well-known/* is served as text/plain (Apple Pay domain association reachable)', async () => {
  const res = await fetch(`${base}/.well-known/README.md`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/plain/);
});
