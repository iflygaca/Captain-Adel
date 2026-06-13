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
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.CAPTAIN_ADEL_MODEL || 'gemini-2.5-flash',
  allamBaseUrl: process.env.ALLAM_BASE_URL || '',
  allamModel: process.env.ALLAM_MODEL || 'humain-ai/ALLaM-7B-Instruct-preview',

  // Optional server-to-server key — grants the trusted tier (skips the
  // browser rate limiter). Empty = feature off.
  apiKey: process.env.ADEL_API_KEY || '',

  allowedOrigins: list('ALLOWED_ORIGINS').length ? list('ALLOWED_ORIGINS') : DEFAULT_ORIGINS,
  maxBodyBytes: parseInt(process.env.MAX_BODY_BYTES, 10) || 64 * 1024,
};
