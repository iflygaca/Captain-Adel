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
const authMiddleware = require('./middleware/auth');
const billing = require('./billing/routes');
const firebase = require('./firebase');
const quota = require('./quota/quota');
const { resolveTier } = require('./billing/tier-core');

const PRODUCTS = new Set(['captadel', 'flygaca']);
const PROVIDERS = new Set(['gemini', 'allam', 'jais', 'fanar', 'qwen', 'commandr', 'auto']);

// The /v1/chat contract version this service speaks. Echoed on every response as
// X-Adel-Api-Version so a caller (the Fly GACA gateway) can detect a contract
// mismatch. Additive: a request without the header is treated as v1. Bump only
// on a breaking change to the request/response shape (see the contract doc).
const ADEL_API_VERSION = '1';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

/* Stripe needs the raw request body to verify the webhook signature, so this
 * route is mounted with express.raw BEFORE the global express.json below —
 * ordering is load-bearing (a route-scoped express.raw after a global
 * express.json would never see the unparsed stream). */
app.post('/v1/billing/webhook', express.raw({ type: 'application/json' }), billing.webhookHandler);

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
  // Firebase Auth (the only client-side Google SDK we load) needs gstatic for
  // the SDK, the identitytoolkit/securetoken endpoints for sign-in, and a frame
  // for the popup helper. The client never opens Firestore — plan/quota come
  // from /v1/me — so no firestore.googleapis.com here.
  res.set('Content-Security-Policy',
    "default-src 'self'; "
    + "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com; "
    + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com; "
    + "font-src 'self'; "
    + "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; "
    + "frame-src https://apis.google.com https://*.firebaseapp.com; "
    + "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'");
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

app.post('/v1/chat', corsMiddleware, apiKeyMiddleware, authMiddleware, async (req, res) => {
  const body = req.body || {};
  const session = clientSession(req, body);

  // Echo the contract version on every response (success or error), and warn if
  // the caller assumes a different one. Set before any branch so it covers the
  // streaming, JSON and early-return paths alike.
  res.set('X-Adel-Api-Version', ADEL_API_VERSION);
  const callerVersion = req.get('X-Adel-Api-Version');
  if (callerVersion && callerVersion !== ADEL_API_VERSION) {
    // eslint-disable-next-line no-console
    console.warn('captain-adel /v1/chat version mismatch',
      { caller: callerVersion, service: ADEL_API_VERSION });
  }

  if (!req.trusted) {
    // 1) Abuse rate limiter — protects model spend for everyone (Pro included).
    const rl = brain.ratelimit.check({ ip: clientIp(req), session });
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

    // 2) Product quota — only metered tiers (free signed-in, anonymous) are
    //    counted; trusted/launch/Pro resolve as unmetered. Dormant until
    //    ADEL_DAILY_FREE / ADEL_DAILY_ANON are set.
    const tier = resolveTier({
      trusted: false,
      launchFree: config.launchMode === 'free',
      uid: req.user && req.user.uid,
      isPro: req.user && req.user.isPro,
      session,
      ip: clientIp(req),
      freeDaily: config.freeDaily,
      anonDaily: config.anonDaily,
    });
    if (tier.metered && firebase.available()) {
      const q = await quota.check(firebase.db(), {
        key: tier.quotaKey, limit: tier.limit, period: config.freePeriod,
      });
      if (!q.ok) {
        res.set('Retry-After', String(q.retryAfter));
        res.status(402).json({
          error: 'quota_exceeded',
          retryAfter: q.retryAfter,
          limit: q.limit,
          upgrade: '/#pricing',
          message: 'You\'ve used your free questions for now, Captain. '
            + 'Upgrade to keep flying, or come back when the allowance resets.',
        });
        return;
      }
      if (typeof q.remaining === 'number') res.set('X-Adel-Quota-Remaining', String(q.remaining));
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

  const brainOpts = {
    apiKey: config.geminiApiKey,
    product,
    provider,
    mode: body.mode === 'exam' ? 'exam' : undefined,
    systemSuffix: injection ? brain.guards.HARDENING_NOTE : '',
  };

  // Opt-in streaming: ?stream=1 or Accept: text/event-stream. The non-streaming
  // JSON contract below is unchanged for existing callers.
  const wantsStream = req.query.stream === '1' ||
    String(req.headers.accept || '').includes('text/event-stream');

  const started = Date.now();

  if (wantsStream) {
    res.set('Content-Type', 'text/event-stream; charset=utf-8');
    res.set('Cache-Control', 'no-cache, no-transform');
    res.set('Connection', 'keep-alive');
    res.set('X-Accel-Buffering', 'no');
    res.flushHeaders && res.flushHeaders();
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    try {
      for await (const ev of brain.answerStream(inspected.message, history, brainOpts)) {
        send(ev);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('captain-adel stream failed', Date.now() - started, String((err && err.stack) || err));
      // If headers are already flushed we can only signal via the stream.
      send({ type: 'error', error: 'engine_error' });
      res.end();
    }
    return;
  }

  try {
    const result = await brain.answer(inspected.message, history, brainOpts);
    res.json({
      answer: result.answer,
      sources: result.sources,
      kind: result.kind,
      refusalClass: result.refusalClass,
      grounding: result.grounding,
      suggestions: result.suggestions,
      meta: result.meta,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('captain-adel turn failed', Date.now() - started, String((err && err.stack) || err));
    res.status(502).json({ error: 'engine_error' });
  }
});

/* Lightweight answer feedback. PDPL-safe: we log only a coarse rating, the turn
 * id, and the provider — never the question text or the answer. */
app.post('/v1/feedback', corsMiddleware, (req, res) => {
  const b = req.body || {};
  const rating = b.rating === 'up' ? 'up' : b.rating === 'down' ? 'down' : null;
  if (!rating) { res.status(400).json({ error: 'bad_rating' }); return; }
  const turnId = String(b.turnId || '').slice(0, 64).replace(/[^A-Za-z0-9._-]/g, '');
  const prov = String(b.provider || '').slice(0, 24).replace(/[^A-Za-z0-9._-]/g, '');
  // eslint-disable-next-line no-console
  console.log('adel-feedback', JSON.stringify({ rating, turnId, provider: prov, ts: Date.now() }));
  res.json({ ok: true });
});

/* Account & billing API: /v1/billing/checkout, /v1/billing/portal, /v1/me,
 * /v1/config. The webhook is mounted separately above (raw body). All ship dark
 * until the Stripe / Firebase env is set. */
app.use('/v1', corsMiddleware, billing.router);

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
