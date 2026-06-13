/* ============================================================================
 * Captain Adel — standalone HTTP service.
 *
 * Serves the captadel.com site (public/) and the chat API from one process:
 *   GET  /health    -> { status:'ok', service:'captain-adel', ... }
 *   POST /v1/chat   -> { answer, sources }
 *
 * Same contract Fly GACA's chat.js already speaks, so the browser renders it
 * unchanged. Fly GACA's gateway function calls the same endpoint server-to-
 * server with X-Adel-Api-Key. The brain (src/brain) is the single source of
 * truth, shared with the eval harness.
 * ==========================================================================*/

'use strict';

const path = require('path');
const express = require('express');

const brain = require('./brain');
const config = require('./config');
const corsMiddleware = require('./middleware/cors');
const apiKeyMiddleware = require('./middleware/apikey');

const PRODUCTS = new Set(['captadel', 'flygaca']);
const PROVIDERS = new Set(['gemini', 'allam', 'jais', 'fanar', 'qwen', 'commandr', 'auto']);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: config.maxBodyBytes }));

/* Security headers on every response. The Firebase-hosted Fly GACA site sets
 * these in firebase.json; this standalone service serves the same UI (public/)
 * and must match — without them captadel.com had no CSP, no frame protection,
 * and no nosniff. frame-ancestors 'none' + X-Frame-Options:DENY block
 * clickjacking; the captadel pages only load same-origin assets (one inline
 * script needs 'unsafe-inline'), so the policy below is tight. */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.set('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; "
    + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
    + "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; "
    + "base-uri 'self'; object-src 'none'; form-action 'self'");
  next();
});

/* First hop of X-Forwarded-For (appended by the load balancer); a client can
 * prepend a spoofed entry, but that only ever costs the attacker their own
 * budget, so first-of-XFF is fine for an abuse guard. */
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '');
  const first = xff.split(',')[0].trim();
  return first || req.ip || '';
}

function clientSession(req, body) {
  const raw = String(
    (body && typeof body.session === 'string' && body.session) ||
    req.headers['x-adel-session'] || ''
  ).trim();
  return /^[A-Za-z0-9._-]{8,128}$/.test(raw) ? raw : '';
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'captain-adel',
    provider: config.provider,
    allam: !!config.allamBaseUrl,
    ts: new Date().toISOString(),
  });
});

app.post('/v1/chat', corsMiddleware, apiKeyMiddleware, async (req, res) => {
  const body = req.body || {};

  if (!req.trusted) {
    const rl = brain.ratelimit.check({ ip: clientIp(req), session: clientSession(req, body) });
    if (!rl.ok) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).json({
        error: 'rate_limited',
        scope: rl.scope,
        retryAfter: rl.retryAfter,
        message: 'Ease off a moment, Captain — too many questions in a short span. '
          + 'Try again shortly.',
      });
      return;
    }
  }

  const inspected = brain.guards.inspectMessage(body.message);
  if (!inspected.ok) {
    res.status(400).json({ error: 'message_required' });
    return;
  }
  const history = brain.guards.sanitizeHistory(body.history);

  const product = PRODUCTS.has(body.product) ? body.product : 'captadel';
  const provider = PROVIDERS.has(body.provider) ? body.provider : undefined;

  // Harden the turn if EITHER the live message OR any history turn trips an
  // injection pattern — a forged assistant turn must not slip past the note.
  const injection = inspected.injection || brain.guards.historyInjection(history);

  const started = Date.now();
  try {
    const result = await brain.answer(inspected.message, history, {
      apiKey: config.geminiApiKey,
      product,
      provider,
      systemSuffix: injection ? brain.guards.HARDENING_NOTE : '',
    });
    res.json({
      answer: result.answer,
      sources: result.sources,
      kind: result.kind,
      refusalClass: result.refusalClass,
      grounding: result.grounding,
      meta: result.meta,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('captain-adel turn failed', Date.now() - started, String((err && err.stack) || err));
    res.status(502).json({ error: 'engine_error' });
  }
});

// CORS errors raised by express.json (e.g. body too large) -> clean 400.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large' });
    return;
  }
  if (err) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }
  next();
});

// Static captadel.com site. Served last so /health and /v1/* win.
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

function start() {
  try {
    brain.warmUp();
    // eslint-disable-next-line no-console
    console.log('BM25 corpus warmed at startup');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('BM25 warm-up deferred:', String((err && err.message) || err));
  }
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Captain Adel listening on :${config.port} (provider=${config.provider})`);
  });
}

if (require.main === module) start();

module.exports = { app, start };
