#!/usr/bin/env node
/* ============================================================================
 * Captain Adel — ALLaM endpoint smoke test (thin shim).
 *
 * Delegates to the generic provider-smoke runner. Kept as a named entry point
 * for muscle memory and docs.
 *
 * Usage:
 *   ALLAM_BASE_URL=http://host:8000/v1  node evals/allam-smoke.js
 * ==========================================================================*/

'use strict';

require('./provider-smoke').smoke('allam').catch((err) => {
  console.error('smoke runner crashed:', err);
  process.exit(1);
});
