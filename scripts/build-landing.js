#!/usr/bin/env node
/* ============================================================================
 * Build the Vite/React marketing landing page from landing/ and copy the
 * built output to public/ for static serving.
 * ==========================================================================*/

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANDING = path.join(ROOT, 'landing');
const DIST = path.join(LANDING, 'dist');
const PUBLIC = path.join(ROOT, 'public');

console.log('Building landing page (Vite + React)...');
execSync('npm run build', { cwd: LANDING, stdio: 'inherit' });

if (!fs.existsSync(DIST)) {
  console.error('Landing build output directory not found:', DIST);
  process.exit(1);
}

console.log('Syncing landing dist to public/...');
fs.cpSync(DIST, PUBLIC, { recursive: true });
console.log('Landing page synced to public/ successfully.');
