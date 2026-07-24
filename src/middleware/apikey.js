/* ============================================================================
 * Captain Adel — optional server-to-server API key.
 *
 * A trusted caller (e.g. Fly GACA's gateway function, a partner backend) sends
 * X-Adel-Api-Key. When it matches ADEL_API_KEY, the request is marked trusted
 * and skips the browser rate limiter. This never blocks: an absent or wrong key
 * simply leaves the request on the normal (browser) tier. Dormant until
 * ADEL_API_KEY is set.
 * ==========================================================================*/

'use strict';

const crypto = require('crypto');
const config = require('../config');

/* Hash both sides to a fixed width before the constant-time compare, so the
 * comparison cannot leak the configured key's length via an early return. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function apiKeyMiddleware(req, res, next) {
  const provided = req.get('X-Adel-Api-Key') || '';
  req.trusted = !!(config.apiKey && provided && safeEqual(provided, config.apiKey));
  next();
}

module.exports = apiKeyMiddleware;
