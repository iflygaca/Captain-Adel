/* Unit tests — src/quota/quota-core.js (pure KSA-calendar helpers)
 *
 * The period boundary is Kingdom local time (UTC+3, no DST). These verify the
 * stamp rolls at KSA midnight / month start and that Retry-After counts down
 * to the boundary. Ported from the Fly GACA gateway's dailyquota tests. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  KSA_OFFSET_MS, dayStamp, monthStamp, secondsToReset, secondsToMonthReset,
  normalizePeriod, periodStamp, periodReset,
} = require('../src/quota/quota-core');

const HOUR = 3600 * 1000;

test('KSA offset is UTC+3', () => {
  assert.equal(KSA_OFFSET_MS, 3 * HOUR);
});

test('dayStamp: 22:00 UTC is already the next KSA day (01:00 local)', () => {
  const t = Date.UTC(2026, 4, 29, 22, 0, 0);
  assert.equal(dayStamp(t), '2026-05-30');
});

test('dayStamp: 20:00 UTC is still the same KSA day (23:00 local)', () => {
  const t = Date.UTC(2026, 4, 29, 20, 0, 0);
  assert.equal(dayStamp(t), '2026-05-29');
});

test('dayStamp: exactly KSA midnight rolls the day', () => {
  // 21:00 UTC == 00:00 KSA next day
  assert.equal(dayStamp(Date.UTC(2026, 4, 29, 21, 0, 0)), '2026-05-30');
  assert.equal(dayStamp(Date.UTC(2026, 4, 29, 20, 59, 59)), '2026-05-29');
});

test('dayStamp: months and days are zero-padded', () => {
  assert.equal(dayStamp(Date.UTC(2026, 0, 5, 12, 0, 0)), '2026-01-05');
});

test('secondsToReset: one hour before KSA midnight ~= 3600s', () => {
  const t = Date.UTC(2026, 4, 29, 20, 0, 0); // 23:00 KSA -> 1h to midnight
  const s = secondsToReset(t);
  assert.ok(s > 3500 && s <= 3600, `expected ~3600, got ${s}`);
});

test('secondsToReset: always at least 1 and at most a full day', () => {
  for (let h = 0; h < 24; h++) {
    const s = secondsToReset(Date.UTC(2026, 4, 29, h, 30, 0));
    assert.ok(s >= 1 && s <= 86400, `hour ${h}: ${s}`);
  }
});

test('monthStamp: YYYY-MM in KSA local time, zero-padded', () => {
  assert.equal(monthStamp(Date.UTC(2026, 0, 5, 12, 0, 0)), '2026-01');
});

test('monthStamp: 22:00 UTC on the last day rolls into the next KSA month', () => {
  assert.equal(monthStamp(Date.UTC(2026, 0, 31, 22, 0, 0)), '2026-02');
  assert.equal(monthStamp(Date.UTC(2026, 0, 31, 20, 0, 0)), '2026-01');
});

test('monthStamp: December rolls the year', () => {
  // 2026-12-31 21:00 UTC == 2027-01-01 00:00 KSA
  assert.equal(monthStamp(Date.UTC(2026, 11, 31, 21, 0, 0)), '2027-01');
});

test('secondsToMonthReset: always >= 1 and at most ~31 days', () => {
  const MONTH = 31 * 24 * 3600;
  for (let d = 1; d <= 28; d += 9) {
    const s = secondsToMonthReset(Date.UTC(2026, 4, d, 10, 0, 0));
    assert.ok(s >= 1 && s <= MONTH + 86400, `day ${d}: ${s}`);
  }
});

test('normalizePeriod: day is the default, month opt-in', () => {
  assert.equal(normalizePeriod('day'), 'day');
  assert.equal(normalizePeriod('month'), 'month');
  assert.equal(normalizePeriod('MONTH'), 'month');
  assert.equal(normalizePeriod(''), 'day');
  assert.equal(normalizePeriod(undefined), 'day');
  assert.equal(normalizePeriod('weekly'), 'day');
});

test('periodStamp / periodReset: dispatch on the period argument', () => {
  const t = Date.UTC(2026, 4, 29, 12, 0, 0);
  assert.equal(periodStamp('day', t), dayStamp(t));
  assert.equal(periodStamp('month', t), monthStamp(t));
  assert.equal(periodReset('day', t), secondsToReset(t));
  assert.equal(periodReset('month', t), secondsToMonthReset(t));
});
