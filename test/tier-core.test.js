/* Unit tests — src/billing/tier-core.js
 *
 * The full caller-tier matrix: trusted / launch / pro / free / anon, with the
 * dormant-by-default limits and the fail-open behaviour when there is nothing
 * to meter on. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTier } = require('../src/billing/tier-core');

const BASE = {
  trusted: false, launchFree: false, uid: '', isPro: false,
  session: '', ip: '', freeDaily: 5, anonDaily: 5,
};
const tier = (over) => resolveTier(Object.assign({}, BASE, over));

test('trusted (X-Adel-Api-Key) wins over everything and is never metered', () => {
  const r = tier({ trusted: true, launchFree: true, uid: 'u1', isPro: true });
  assert.deepEqual(r, { tier: 'trusted', metered: false, quotaKey: '', limit: 0 });
});

test('launch mode: everyone reads as unmetered, signed in or not', () => {
  assert.equal(tier({ launchFree: true }).tier, 'launch');
  assert.equal(tier({ launchFree: true }).metered, false);
  assert.equal(tier({ launchFree: true, uid: 'u1' }).metered, false);
});

test('pro: unlimited, never metered', () => {
  const r = tier({ uid: 'u1', isPro: true });
  assert.deepEqual(r, { tier: 'pro', metered: false, quotaKey: '', limit: 0 });
});

test('free signed-in: metered per uid against freeDaily', () => {
  const r = tier({ uid: 'u1', session: 's1', ip: '1.2.3.4' });
  assert.deepEqual(r, { tier: 'free', metered: true, quotaKey: 'uid:u1', limit: 5 });
});

test('free signed-in: dormant when freeDaily is 0 (ships dark)', () => {
  const r = tier({ uid: 'u1', freeDaily: 0 });
  assert.equal(r.tier, 'free');
  assert.equal(r.metered, false);
});

test('isPro without a uid means nothing — still anonymous', () => {
  assert.equal(tier({ isPro: true }).tier, 'anon');
});

test('anon: metered per session, falling back to IP', () => {
  assert.deepEqual(tier({ session: 'ca-1' }),
    { tier: 'anon', metered: true, quotaKey: 'anon:ca-1', limit: 5 });
  assert.deepEqual(tier({ ip: '1.2.3.4' }),
    { tier: 'anon', metered: true, quotaKey: 'ip:1.2.3.4', limit: 5 });
});

test('anon: nothing to key on -> fail open, unmetered', () => {
  const r = tier({});
  assert.equal(r.tier, 'anon');
  assert.equal(r.metered, false);
  assert.equal(r.quotaKey, '');
});

test('anon: dormant when anonDaily is 0', () => {
  assert.equal(tier({ session: 'ca-1', anonDaily: 0 }).metered, false);
});

test('limits: negative or non-finite limits read as dormant', () => {
  assert.equal(tier({ uid: 'u1', freeDaily: -3 }).metered, false);
  assert.equal(tier({ session: 's', anonDaily: NaN }).metered, false);
});
