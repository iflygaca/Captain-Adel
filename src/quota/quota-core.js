/* ============================================================================
 * Captain Adel — quota calendar math (pure, dependency-free).
 *
 * The free tier is metered per KSA calendar period: the allowance resets at
 * Kingdom local midnight (day mode) or on the first of the month (month mode).
 * Saudi Arabia is UTC+3 year-round (no DST), so the arithmetic is a fixed
 * offset — no timezone database needed. Ported from the Fly GACA gateway's
 * dailyquota.js, but parameterized (`period` is an argument, not env-at-load)
 * so the same functions serve any window and stay trivially testable.
 *
 * The Firestore-backed counter that consumes these stamps lives in quota.js.
 * ==========================================================================*/

'use strict';

// Kingdom of Saudi Arabia is UTC+3 year-round.
const KSA_OFFSET_MS = 3 * 60 * 60 * 1000;

/* The KSA calendar day for an instant, as YYYY-MM-DD. */
function dayStamp(now) {
  const d = new Date(now + KSA_OFFSET_MS);
  return d.getUTCFullYear() + '-'
    + String(d.getUTCMonth() + 1).padStart(2, '0') + '-'
    + String(d.getUTCDate()).padStart(2, '0');
}

/* The KSA calendar month for an instant, as YYYY-MM. */
function monthStamp(now) {
  const d = new Date(now + KSA_OFFSET_MS);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

/* Seconds from now until the next KSA midnight — used as Retry-After. */
function secondsToReset(now) {
  const shifted = now + KSA_OFFSET_MS;
  const d = new Date(shifted);
  const nextMidnight = Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(1, Math.ceil((nextMidnight - shifted) / 1000));
}

/* Seconds from now until the first of the next KSA month — Retry-After in
   month mode. */
function secondsToMonthReset(now) {
  const shifted = now + KSA_OFFSET_MS;
  const d = new Date(shifted);
  const nextMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return Math.max(1, Math.ceil((nextMonth - shifted) / 1000));
}

/* 'day' or 'month' — anything unrecognised means 'day' (captadel's default
   window; the cheaper-per-user monthly window stays available by env). */
function normalizePeriod(v) {
  return String(v || '').toLowerCase() === 'month' ? 'month' : 'day';
}

/* The stamp + reset for the active window. */
function periodStamp(period, now) {
  return normalizePeriod(period) === 'day' ? dayStamp(now) : monthStamp(now);
}
function periodReset(period, now) {
  return normalizePeriod(period) === 'day' ? secondsToReset(now) : secondsToMonthReset(now);
}

module.exports = {
  KSA_OFFSET_MS, dayStamp, monthStamp, secondsToReset, secondsToMonthReset,
  normalizePeriod, periodStamp, periodReset,
};
