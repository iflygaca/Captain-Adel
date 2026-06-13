/* ============================================================================
 * Captain Adel — CORS gate.
 *
 * Only our own origins (captadel.com, flygaca.com family, localhost during dev)
 * may call the chat API from a browser, so other sites cannot spend the model
 * budget from their users' browsers. Requests with no Origin (server-to-server,
 * curl) are allowed through — they remain bounded by the rate limiter and, for
 * a higher tier, the optional API key.
 * ==========================================================================*/

'use strict';

const config = require('../config');

function isLocalhost(origin) {
  return /^http:\/\/localhost(:\d+)?$/.test(origin)
    || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    const allowed = config.allowedOrigins.includes(origin) || isLocalhost(origin);
    if (!allowed) {
      res.status(403).json({ error: 'origin_not_allowed' });
      return;
    }
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Adel-Session, X-Adel-Api-Key');
    res.set('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

module.exports = corsMiddleware;
