/* ============================================================================
 * Captain Adel — rate limiter.
 *
 * In-memory sliding-window limiter, per process. Three rules run together on
 * every turn:
 *   - ip      : steady-state cap per client IP over a 10-minute window
 *   - burst   : short-window cap per IP, catches hammering and runaway loops
 *   - session : per-browser cap, so many users behind one NAT (a flight
 *               school, an airport) each get their own budget
 *
 * Scope & honesty: state lives in this process only. Across N replicas a
 * determined attacker could reach up to ~Nx these numbers. This is a real
 * guard against casual abuse, shared loops and accidental retries — not a
 * defence against a distributed attack. Front the service with a WAF / API
 * gateway for that. It needs no extra infrastructure and adds no per-request
 * cost. Tunable via the ADEL_RL_* env vars (see RULES below).
 *
 *   check({ ip, session }) -> { ok: true }
 *                          |  { ok: false, scope, retryAfter }   // seconds
 * ==========================================================================*/

'use strict';

function intEnv(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

const RULES = {
  ip:      { limit: intEnv('ADEL_RL_IP',      40), windowMs: 10 * 60 * 1000 },
  burst:   { limit: intEnv('ADEL_RL_BURST',    6), windowMs: 30 * 1000 },
  session: { limit: intEnv('ADEL_RL_SESSION', 24), windowMs: 10 * 60 * 1000 },
};

const MAX_KEYS = 5000;
const hits = new Map();
let sinceSweep = 0;

function prune(arr, cutoff) {
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  return i === 0 ? arr : arr.slice(i);
}

function sweep(now) {
  for (const [k, arr] of hits) {
    const rule = RULES[k.slice(0, k.indexOf(':'))];
    if (!rule) { hits.delete(k); continue; }
    const live = prune(arr, now - rule.windowMs);
    if (live.length === 0) hits.delete(k);
    else if (live !== arr) hits.set(k, live);
  }
  // If still over the ceiling after pruning expired entries, evict the
  // least-recently-active keys down to the cap. Never wipe live counters
  // wholesale: that resets every window at once and lets a burst through right
  // after an overflow. Sort by each key's newest timestamp (ascending) and drop
  // the oldest until back at the cap. O(n log n), only on the rare overflow.
  if (hits.size > MAX_KEYS) {
    const byIdle = [...hits.entries()].sort(
      (a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1],
    );
    for (let i = 0, n = hits.size - MAX_KEYS; i < n; i++) hits.delete(byIdle[i][0]);
  }
}

function peek(ruleName, key, now) {
  const rule = RULES[ruleName];
  const mapKey = ruleName + ':' + key;
  const arr = prune(hits.get(mapKey) || [], now - rule.windowMs);
  hits.set(mapKey, arr);
  if (arr.length >= rule.limit) {
    const retryAfter = Math.ceil((arr[0] + rule.windowMs - now) / 1000);
    return { ok: false, scope: ruleName, retryAfter: Math.max(1, retryAfter) };
  }
  return { ok: true };
}

function record(ruleName, key, now) {
  const mapKey = ruleName + ':' + key;
  const arr = hits.get(mapKey) || [];
  arr.push(now);
  hits.set(mapKey, arr);
}

function check(id) {
  const now = Date.now();
  if (++sinceSweep >= 500) { sinceSweep = 0; sweep(now); }

  const ip = id && id.ip ? String(id.ip) : '';
  const session = id && id.session ? String(id.session) : '';

  const applicable = [];
  if (ip)      { applicable.push(['ip', ip], ['burst', ip]); }
  if (session) { applicable.push(['session', session]); }
  if (applicable.length === 0) return { ok: true };

  for (const [rule, key] of applicable) {
    const res = peek(rule, key, now);
    if (!res.ok) return res;
  }
  for (const [rule, key] of applicable) record(rule, key, now);
  return { ok: true };
}

function _reset() { hits.clear(); sinceSweep = 0; }
function _size() { return hits.size; }

module.exports = { check, RULES, _reset, _size };
