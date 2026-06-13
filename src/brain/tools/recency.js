/* ============================================================================
 * Captain Adel — recency / currency date-math tool (pure, zero-dep).
 *
 * Mirrors Fly GACA's currency.js: given dated events (one entry per landing /
 * approach / etc.), how many fall inside the rolling window, is the
 * requirement met, and when does currency lapse? The REQUIREMENT ITSELF
 * (e.g. three takeoffs and landings in the preceding 90 days to carry
 * passengers) is a GACAR Part 61 fact the model cites from retrieval — this
 * tool only does the calendar arithmetic with whatever figures it is given.
 * ==========================================================================*/

'use strict';

const DAY = 86400000;

function parseDate(s) {
  if (s instanceof Date) return Number.isNaN(s.getTime()) ? null : s;
  const str = String(s || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(d) { return d.toISOString().slice(0, 10); }

/**
 * compute({ event_dates: ['YYYY-MM-DD', ...], required_count?, window_days?, today? })
 *   event_dates    — one entry per qualifying event (a flight with 3 landings
 *                    contributes its date 3 times)
 *   required_count — events needed inside the window (default 3)
 *   window_days    — rolling window length in days (default 90)
 *   today          — evaluation date (default: today, UTC)
 */
function compute(args = {}) {
  const rawDates = Array.isArray(args.event_dates) ? args.event_dates : null;
  if (!rawDates) return { error: "event_dates[] is required (ISO dates, e.g. '2026-05-14')" };
  if (rawDates.length > 200) return { error: 'too many events (max 200)' };

  const need = args.required_count === undefined ? 3 : Number(args.required_count);
  const windowDays = args.window_days === undefined ? 90 : Number(args.window_days);
  if (!Number.isInteger(need) || need <= 0) return { error: 'required_count must be a positive integer' };
  if (!Number.isInteger(windowDays) || windowDays <= 0) return { error: 'window_days must be a positive integer' };

  const today = args.today ? parseDate(args.today) : new Date(new Date().toISOString().slice(0, 10));
  if (!today) return { error: "today must be an ISO date ('YYYY-MM-DD')" };

  const events = [];
  for (const r of rawDates) {
    const d = parseDate(r);
    if (!d) return { error: `unparseable date: ${String(r).slice(0, 24)}` };
    events.push(d);
  }
  events.sort((a, b) => b - a);   // newest first

  // Only events in (today - window, today] count: future-dated typos must
  // never inflate currency or push the lapse date out (same rule as the
  // Fly GACA logbook's currency.js).
  const windowStart = new Date(today.getTime() - windowDays * DAY);
  const inWindow = events.filter((d) => d <= today && d > windowStart);

  const steps = [
    { label: 'rolling window', expr: `${fmt(today)} − ${windowDays} days`, value: fmt(windowStart), unit: 'window opens' },
    { label: 'qualifying events in window', expr: `${inWindow.length} of ${events.length} dated events`, value: inWindow.length, unit: 'events' },
    { label: 'requirement', expr: `need ${need} within ${windowDays} days`, value: inWindow.length >= need ? 'met' : 'NOT met', unit: '' },
  ];

  const result = {
    current: inWindow.length >= need,
    count_in_window: inWindow.length,
    required_count: need,
    window_days: windowDays,
    window_start: fmt(windowStart),
    evaluated_on: fmt(today),
  };

  if (result.current) {
    // The Nth-newest event is the limiting one: currency lapses when it ages out.
    const limiting = inWindow[need - 1];
    const lapse = new Date(limiting.getTime() + windowDays * DAY);
    result.limiting_event = fmt(limiting);
    result.lapse_date = fmt(lapse);
    result.days_left = Math.round((lapse - today) / DAY);
    steps.push({
      label: 'currency lapses', expr: `${fmt(limiting)} + ${windowDays} days`,
      value: fmt(lapse), unit: `${result.days_left} days left`,
    });
  } else {
    result.shortfall = need - inWindow.length;
  }

  return { inputs: { events: events.length, required_count: need, window_days: windowDays, today: fmt(today) }, steps, result };
}

module.exports = { compute, parseDate };
