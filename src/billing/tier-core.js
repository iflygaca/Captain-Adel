/* ============================================================================
 * Captain Adel — caller tier resolution (pure, dependency-free).
 *
 * One decision point for "who is asking and what do they get", called by the
 * /v1/chat handler after auth. The ordering is load-bearing:
 *
 *   trusted  — X-Adel-Api-Key matched (the Fly GACA gateway). It runs its own
 *              quota/entitlement upstream; nothing is metered here.
 *   launch   — ADEL_LAUNCH_MODE=free: everyone reads as Pro while billing is
 *              dark. The abuse rate limiter still runs (it protects the model
 *              spend, not the product tier) — that's the caller's job.
 *   pro      — signed-in with a live entitlement: unlimited, never metered.
 *   free     — signed-in without one: metered per uid against `freeDaily`.
 *   anon     — no account: metered per browser session (fallback: IP) against
 *              `anonDaily`.
 *
 * A limit of 0 means that tier's quota is dormant (unmetered) — the SaaS layer
 * ships dark by default. A metered tier with nothing to key on (no session and
 * no IP) is also unmetered: fail open, never block on missing plumbing.
 * ==========================================================================*/

'use strict';

/**
 * @param {object} c
 *   trusted    boolean — X-Adel-Api-Key matched
 *   launchFree boolean — ADEL_LAUNCH_MODE=free
 *   uid        string  — verified Firebase uid ('' when anonymous)
 *   isPro      boolean — live entitlement (only meaningful with a uid)
 *   session    string  — per-browser session id ('' when absent)
 *   ip         string  — client IP ('' when absent)
 *   freeDaily  number  — free signed-in allowance per period (0 = dormant)
 *   anonDaily  number  — anonymous allowance per period (0 = dormant)
 * @returns {{ tier: 'trusted'|'launch'|'pro'|'free'|'anon',
 *             metered: boolean, quotaKey: string, limit: number }}
 */
function resolveTier(c) {
  const uid = (c && c.uid) ? String(c.uid) : '';
  const session = (c && c.session) ? String(c.session) : '';
  const ip = (c && c.ip) ? String(c.ip) : '';
  const freeDaily = (c && Number.isFinite(c.freeDaily) && c.freeDaily > 0) ? c.freeDaily : 0;
  const anonDaily = (c && Number.isFinite(c.anonDaily) && c.anonDaily > 0) ? c.anonDaily : 0;

  if (c && c.trusted) return { tier: 'trusted', metered: false, quotaKey: '', limit: 0 };
  if (c && c.launchFree) return { tier: 'launch', metered: false, quotaKey: '', limit: 0 };
  if (uid && c.isPro) return { tier: 'pro', metered: false, quotaKey: '', limit: 0 };
  if (uid) {
    return { tier: 'free', metered: freeDaily > 0, quotaKey: 'uid:' + uid, limit: freeDaily };
  }
  const quotaKey = session ? 'anon:' + session : (ip ? 'ip:' + ip : '');
  return { tier: 'anon', metered: anonDaily > 0 && !!quotaKey, quotaKey, limit: anonDaily };
}

module.exports = { resolveTier };
