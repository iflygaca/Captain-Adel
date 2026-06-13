/* ============================================================================
 * Captain Adel — optional caller identity (Firebase ID token).
 *
 * chat.js sends `Authorization: Bearer <Firebase ID token>` only when a pilot
 * is signed in. This middleware verifies it and resolves a live entitlement,
 * setting req.user = { uid, isPro, email }. It NEVER blocks: an absent, expired
 * or unverifiable token — or any Firestore hiccup — simply degrades to an
 * anonymous visitor (req.user = { uid:'', isPro:false }). Mirrors the Fly GACA
 * gateway's identify() so the two never drift.
 *
 * A small in-memory cache keeps the per-turn entitlement read off the hot path:
 * each uid's Pro status is cached for ENTITLEMENT_TTL_MS. Worst case, a
 * cancellation takes that long to bite on an instance that already cached the
 * user; a fresh purchase is reflected as soon as the cache entry ages out (the
 * webhook can't reach across instances). 60s is a fine trade for chat latency.
 * ==========================================================================*/

'use strict';

const config = require('../config');
const firebase = require('../firebase');
const ent = require('../billing/entitlements');

const ENTITLEMENT_TTL_MS = 60 * 1000;
const cache = new Map();   // uid -> { isPro, at }

function cachedIsPro(uid) {
  const hit = cache.get(uid);
  if (hit && (Date.now() - hit.at) < ENTITLEMENT_TTL_MS) return hit.isPro;
  return undefined;
}
function setCache(uid, isPro) { cache.set(uid, { isPro, at: Date.now() }); }

/* Invalidate a uid (call after a webhook writes a new entitlement on this
 * instance, so the buyer sees Pro immediately rather than after the TTL). */
function invalidate(uid) { if (uid) cache.delete(uid); }

async function resolveIsPro(uid) {
  const c = cachedIsPro(uid);
  if (c !== undefined) return c;
  let isPro = false;
  try {
    isPro = ent.isActive(await ent.readEntitlement(uid));
  } catch (_) {
    // Firestore outage — treat as free for this turn but don't cache the miss,
    // so a transient blip doesn't pin a paid pilot to free for 60s.
    return false;
  }
  setCache(uid, isPro);
  return isPro;
}

async function authMiddleware(req, _res, next) {
  req.user = { uid: '', isPro: false, email: '' };
  const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m || !firebase.available()) return next();   // anonymous / layer dark
  try {
    const decoded = await firebase.verifyIdToken(m[1]);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      isPro: config.launchMode === 'free' ? true : await resolveIsPro(decoded.uid),
    };
  } catch (_) {
    // Unverifiable token — stay anonymous, never 401 on chat.
  }
  return next();
}

module.exports = authMiddleware;
module.exports.invalidate = invalidate;
module.exports._cache = cache;
