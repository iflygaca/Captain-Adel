/* Unit tests — captadel/src/brain/ratelimit.js
 *
 * In-memory sliding-window limiter. The module ships a _reset() test hook; we
 * use it so each test starts from a clean window. Default limits (no env):
 *   ip 40 / 10min · burst 6 / 30s · session 24 / 10min */
'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const rl = require('../src/brain/ratelimit');

beforeEach(() => rl._reset());

test('no identity -> always allowed (nothing to meter on)', () => {
  assert.deepEqual(rl.check({}), { ok: true });
  assert.deepEqual(rl.check({ ip: '', session: '' }), { ok: true });
});

test('burst rule trips first: the 7th hit in 30s from one IP is blocked', () => {
  const id = { ip: '1.2.3.4' };
  for (let i = 0; i < rl.RULES.burst.limit; i++) {
    assert.equal(rl.check(id).ok, true, `hit ${i}`);
  }
  const blocked = rl.check(id);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.scope, 'burst');
  assert.ok(blocked.retryAfter >= 1);
});

test('session rule is independent per session id', () => {
  // Drive one session to its cap while keeping under the burst window by using
  // distinct IPs so only the session rule accumulates.
  const limit = rl.RULES.session.limit;
  for (let i = 0; i < limit; i++) {
    // fresh IP each call so ip/burst never trip; session is the constant
    const r = rl.check({ ip: 'ip-' + i, session: 'sess-A' });
    assert.equal(r.ok, true, `session hit ${i}`);
  }
  const blocked = rl.check({ ip: 'ip-final', session: 'sess-A' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.scope, 'session');
});

test('a different session under the same NAT keeps its own budget', () => {
  for (let i = 0; i < rl.RULES.session.limit; i++) rl.check({ ip: 'ip-' + i, session: 'sess-A' });
  // sess-A is now exhausted; sess-B (fresh IP) must still be allowed
  assert.equal(rl.check({ ip: 'ip-new', session: 'sess-B' }).ok, true);
});

test('retryAfter is a positive integer number of seconds', () => {
  const id = { ip: '9.9.9.9' };
  for (let i = 0; i < rl.RULES.burst.limit; i++) rl.check(id);
  const blocked = rl.check(id);
  assert.equal(blocked.ok, false);
  assert.ok(Number.isInteger(blocked.retryAfter) && blocked.retryAfter > 0);
  assert.ok(blocked.retryAfter <= rl.RULES.burst.windowMs / 1000);
});

test('_reset clears all state', () => {
  const id = { ip: '5.5.5.5' };
  for (let i = 0; i < rl.RULES.burst.limit; i++) rl.check(id);
  assert.equal(rl.check(id).ok, false);
  rl._reset();
  assert.equal(rl.check(id).ok, true, 'after reset the window is empty again');
});
