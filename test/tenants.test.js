/* Unit tests — src/brain/tenants.js.
 *
 * One brain serves two products; only the opening identity line and the
 * "where to point the user at the regulation" line differ. Unknown products
 * must fall back to captadel so a misconfigured caller still gets a valid prompt. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TENANTS, tenant } = require('../src/brain/tenants');

test('tenant: captadel returns the standalone-service framing', () => {
  const t = tenant('captadel');
  assert.equal(t, TENANTS.captadel);
  assert.match(t.intro, /captadel\.com/);
  assert.match(t.libraryLink, /gaca\.gov\.sa/);
});

test('tenant: flygaca returns the embedded-library framing', () => {
  const t = tenant('flygaca');
  assert.equal(t, TENANTS.flygaca);
  assert.match(t.intro, /Fly GACA/);
  assert.match(t.libraryLink, /library\.html/);
});

test('tenant: unknown / missing product falls back to captadel', () => {
  assert.equal(tenant('nope'), TENANTS.captadel);
  assert.equal(tenant(undefined), TENANTS.captadel);
  assert.equal(tenant(''), TENANTS.captadel);
});

test('tenant: every product exposes both interpolated fields', () => {
  for (const name of Object.keys(TENANTS)) {
    const t = tenant(name);
    assert.equal(typeof t.intro, 'string');
    assert.equal(typeof t.libraryLink, 'string');
    assert.ok(t.intro.length > 0 && t.libraryLink.length > 0);
  }
});
