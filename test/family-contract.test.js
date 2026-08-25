/* Unit tests — the cross-repo family contract (contracts/flygaca-family.json)
 *
 * This repo's half of a check that spans three repos.
 *
 * `contracts/flygaca-family.json` is committed byte-identically to ay2m/Office,
 * ay2m/FlyGACA and this repo. It exists because the family's cross-repo claims
 * lived only in prose and drifted with nothing failing — this repo's own
 * CLAUDE.md and README both stated that the brain here "also powers Fly GACA's
 * API (called server-to-server with X-Adel-Api-Key)", which has never been true:
 * nothing in ay2m/FlyGACA has ever called this service.
 *
 * Two blocks concern us:
 *
 *   entity — ay2m/Office owns it, in 01-governance/company-facts.md. We are a
 *            CONSUMER: the legal name, CR and VAT number are hand-copied into
 *            footer.js, terms.html, privacy.html, package.json and LICENSE, and
 *            must keep matching.
 *   chat   — ay2m/FlyGACA owns it. Our /v1/chat is a superset, but the tenant
 *            enum is shared and PRODUCTS/TENANTS here must agree with it.
 *
 * Deterministic, no keys, no network — safe in CI, and it runs there already via
 * npm run test:unit. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'contracts', 'flygaca-family.json'), 'utf8'),
);

/** Read a repo file as text, for the "does this string still appear" checks. */
const source = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/* ── the manifest itself ─────────────────────────────────────────────────── */

test('manifest: the self-hash matches its own content', () => {
  // Kept identical to Office's tools/contracts/stamp-manifest.mjs and to
  // FlyGACA's tests/family-contract.test.ts. A hand-edit that skips the
  // re-stamp fails here, in every repo, immediately.
  const want = createHash('sha256')
    .update(JSON.stringify({ ...manifest, sha: '' }))
    .digest('hex');
  assert.equal(
    manifest.sha,
    want,
    'the manifest was edited without re-stamping — run Office\'s ' +
      'tools/contracts/stamp-manifest.mjs, then copy the file to all three repos',
  );
});

test('manifest: we own neither block, so both are mirrors here', () => {
  assert.equal(manifest.entity.owner, 'ay2m/Office');
  assert.equal(manifest.chat.owner, 'ay2m/FlyGACA');
});

test('manifest: the roster lists this repo', () => {
  const names = manifest.repos.members.map((m) => m.name);
  assert.ok(names.includes('ay2m/Captain-Adel'), 'ay2m/Captain-Adel missing from the roster');
  assert.ok(names.includes('ay2m/FlyGACA'));
  assert.ok(names.includes('ay2m/Office'));
});

/* ── the tenant enum, which both services implement ──────────────────────── */

test('tenants: brain/tenants.js declares exactly the manifest tenants', () => {
  const { TENANTS } = require('../src/brain/tenants');
  assert.deepEqual(Object.keys(TENANTS).sort(), [...manifest.chat.tenants].sort());
});

test('tenants: server.js accepts exactly the manifest tenants as `product`', () => {
  // PRODUCTS in server.js is the guard that turns a request's `product` into a
  // tenant. If it and TENANTS drift, a valid product silently gets captadel's
  // framing — which is what makes the flygaca tenant reachable or not.
  const declared = /const PRODUCTS = new Set\(\[([^\]]+)\]\)/.exec(source('src/server.js'));
  assert.ok(declared, 'PRODUCTS set not found in src/server.js');
  const products = [...declared[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(products.sort(), [...manifest.chat.tenants].sort());
});

test('tenants: our own default is captadel, FlyGACA asks for flygaca', () => {
  assert.equal(manifest.chat.defaultTenantCaptAdel, 'captadel');
  assert.equal(manifest.chat.defaultTenantFlyGaca, 'flygaca');
  assert.ok(source('src/server.js').includes("body.product) ? body.product : 'captadel'"));
});

test('trusted tier: the manifest names the header apikey.js actually checks', () => {
  assert.equal(manifest.chat.trustedTierHeader, 'X-Adel-Api-Key');
  assert.ok(source('src/middleware/apikey.js').includes("req.get('X-Adel-Api-Key')"));
  // CORS has to allow it too, or a browser-side caller could never send it.
  assert.ok(source('src/middleware/cors.js').includes('X-Adel-Api-Key'));
});

/* ── the response shape we must not narrow ───────────────────────────────── */

test('chat: /v1/chat still returns every field FlyGACA depends on', () => {
  // Our response is a superset (suggestions, grounding, meta.toolCalls). These
  // are the ones the shared contract pins; dropping one breaks the other product.
  const src = source('src/brain/grounding.js') + source('src/brain/answer.js');
  for (const field of manifest.chat.responseFields) {
    if (field === 'meta') continue; // shaped in server.js, not the brain
    assert.ok(
      new RegExp(`\\b${field}\\b`).test(src),
      `/v1/chat no longer produces "${field}", which the family contract pins`,
    );
  }
});

test('chat: our grounding verdicts stay inside the shared enum', () => {
  // grounding.js classifies each answer; the badge FlyGACA renders is keyed on
  // exactly these four. A fifth kind would render as no badge over there.
  const src = source('src/brain/grounding.js');
  for (const kind of manifest.chat.groundingKinds) {
    assert.ok(new RegExp(`'${kind}'`).test(src), `grounding.js never produces kind "${kind}"`);
  }
});

/* ── the entity facts ay2m/Office owns ───────────────────────────────────── */

const e = manifest.entity;

test('entity: the footer operator line carries the identity in both languages', () => {
  const src = source('public/assets/js/footer.js');
  for (const value of [e.legalNameEn, e.legalNameAr, e.commercialRegistration, e.vatNumber]) {
    assert.ok(src.includes(value), `footer.js no longer contains "${value}"`);
  }
});

test('entity: terms.html carries the full entity block', () => {
  const src = source('public/terms.html');
  for (const value of [e.legalNameEn, e.legalNameAr, e.commercialRegistration, e.vatNumber, e.postalCode]) {
    assert.ok(src.includes(value), `terms.html no longer contains "${value}"`);
  }
});

test('entity: privacy.html names the PDPL data controller', () => {
  const src = source('public/privacy.html');
  for (const value of [e.legalNameEn, e.legalNameAr, e.commercialRegistration]) {
    assert.ok(src.includes(value), `privacy.html no longer contains "${value}"`);
  }
});

test('entity: package.json and LICENSE name the same legal entity', () => {
  assert.ok(source('package.json').includes(e.legalNameEn));
  assert.ok(source('package.json').includes(e.legalNameAr));
  assert.ok(source('LICENSE').includes(e.legalNameEn));
});

test('entity: the manifest never carries the banking details', () => {
  // company-facts.md's hard rule: the IBAN and account number never leave
  // ay2m/Office. This file is copied into two product repos, so assert the shape.
  const text = JSON.stringify(manifest);
  assert.ok(!/\bSA\d{22}\b/.test(text), 'the manifest contains an IBAN');
  assert.ok(!('iban' in e), 'the manifest entity block has an iban field');
  assert.ok(!('accountNumber' in e), 'the manifest entity block has an accountNumber field');
});
