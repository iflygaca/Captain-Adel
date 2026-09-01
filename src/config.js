/* ============================================================================
 * Captain Adel — service configuration (from environment).
 * ==========================================================================*/

'use strict';

function list(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function intEnv(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v >= 0 ? v : def;
}

const DEFAULT_ORIGINS = [
  'https://captadel.com',
  'https://www.captadel.com',
  'https://flygaca.com',
  'https://www.flygaca.com',
];

module.exports = {
  port: parseInt(process.env.PORT, 10) || 8787,

  // Model routing. 'gemini' | 'allam' | 'auto'. See src/brain/route.js.
  provider: process.env.MODEL_PROVIDER || 'gemini',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '',
  geminiModel: process.env.CAPTAIN_ADEL_MODEL || 'gemini-3.6-flash',
  allamBaseUrl: process.env.ALLAM_BASE_URL || '',
  allamModel: process.env.ALLAM_MODEL || 'humain-ai/ALLaM-7B-Instruct-preview',

  // Optional server-to-server key — grants the trusted tier (skips the
  // browser rate limiter). Empty = feature off.
  apiKey: process.env.ADEL_API_KEY || '',

  allowedOrigins: list('ALLOWED_ORIGINS').length ? list('ALLOWED_ORIGINS') : DEFAULT_ORIGINS,
  maxBodyBytes: parseInt(process.env.MAX_BODY_BYTES, 10) || 64 * 1024,

  /* ---- SaaS layer (accounts, billing, quota) ----------------------------
   * The whole layer ships dark: with none of these set, sign-in/billing are
   * inert and the free quota is dormant (every caller is unmetered, exactly as
   * today). See office/RUNBOOK-captadel-saas.md. */

  // Absolute site origin for the Moyasar callback URL (checkout return leg).
  siteUrl: (process.env.SITE_URL || 'https://captadel.com').replace(/\/+$/, ''),

  // LAUNCH MODE — 'free' makes every caller read as Pro (quota dormant) while
  // billing paperwork completes. The abuse rate limiter still runs.
  launchMode: String(process.env.ADEL_LAUNCH_MODE || '').toLowerCase() === 'free' ? 'free' : '',

  // Moyasar — empty = billing endpoints return 503 (the SaaS layer is dark).
  // Prices are SAR strings (e.g. "35", "299"), converted to halalas in
  // billing/moyasar-core.js; the browser never chooses an amount.
  moyasarSecretKey: process.env.MOYASAR_SECRET_KEY || '',
  moyasarPublishableKey: process.env.MOYASAR_PUBLISHABLE_KEY || '',
  moyasarWebhookSecret: process.env.MOYASAR_WEBHOOK_SECRET || '',
  moyasarPriceMonthlySar: process.env.MOYASAR_PRICE_MONTHLY_SAR || '',
  moyasarPriceAnnualSar: process.env.MOYASAR_PRICE_ANNUAL_SAR || '',

  // Shared secret for the renewals cron route (Cloud Scheduler sends it as
  // X-Cron-Key). Empty = the route always 401s.
  cronSecret: process.env.CRON_SECRET || '',

  // Free-tier metering. 0 = dormant (only the abuse rate limiter runs).
  freeDaily: intEnv('ADEL_DAILY_FREE', 0),     // free signed-in allowance / period
  anonDaily: intEnv('ADEL_DAILY_ANON', 0),     // anonymous allowance / period
  freePeriod: String(process.env.ADEL_FREE_PERIOD || 'day').toLowerCase() === 'month'
    ? 'month' : 'day',
};
