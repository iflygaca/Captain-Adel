#!/usr/bin/env node
/* ============================================================================
 * Captain Adel — front-end smoke check.
 *
 * There is no build step for public/: the pages are hand-written HTML loading
 * classic scripts, so a renamed asset, a dropped chrome block or a reordered
 * <script> tag ships silently and only breaks in the browser. This is the gate
 * for that class of regression — deterministic, dependency-free, no network.
 *
 *   node scripts/frontend-smoke.js        # or: npm run smoke:frontend
 *
 * What it checks, per public/*.html:
 *   1. every local asset (script/link/img/source) resolves on disk
 *   2. every internal page link resolves to a real file or a real #anchor
 *   3. the two hand-duplicated chrome blocks (.disclaimer-strip, .site-nav)
 *      are present on all eight pages — CLAUDE.md flags these as copy-pasted
 *   4. the #site-footer mount exists, since footer.js renders into it
 *   5. script load order: chat-core.js before its consumers, footer.js before
 *      i18n.js, and the ES-module scripts carry type="module"
 *   6. JS -> DOM hooks: an id or class a script reaches for must exist in the
 *      HTML it is loaded on, or in the CSS
 *
 * Exit 0 = clean, 1 = at least one error. Warnings never fail the build.
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const errors = [];
const warnings = [];
const err = (page, msg) => errors.push(`${page}: ${msg}`);
const warn = (page, msg) => warnings.push(`${page}: ${msg}`);

/* Chrome blocks that CLAUDE.md documents as hand-duplicated across every page:
 * an edit has to be applied eight times, so a missing one is a real defect. */
const REQUIRED_CHROME = [
  { needle: 'class="disclaimer-strip"', label: '.disclaimer-strip block' },
  { needle: 'class="site-nav"', label: '.site-nav header' },
  { needle: 'id="site-footer"', label: '#site-footer mount (footer.js renders into it)' },
];

/* Scripts that must load before their consumers. */
const ORDER_RULES = [
  { first: 'chat-core.js', then: ['chat.js', 'console.js', 'exam.js'] },
  { first: 'exam-core.js', then: ['exam.js'] },
  { first: 'footer.js', then: ['i18n.js'] },
];

/* Auth/billing front-end is ES modules; the chrome scripts are classic+defer. */
const MODULE_SCRIPTS = new Set([
  'auth.js', 'firebase-config.js', 'billing.js', 'checkout.js', 'account.js',
]);

const htmlFiles = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html')).sort();
if (htmlFiles.length === 0) {
  console.error('frontend-smoke: no public/*.html found');
  process.exit(1);
}

/* ---- collect every CSS/JS source once, for the DOM-hook audit -------------*/
function readAll(dir, ext) {
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(ext)) out.set(f, fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return out;
}
const jsSources = readAll(path.join(PUBLIC, 'assets', 'js'), '.js');
const cssText = [...readAll(path.join(PUBLIC, 'assets', 'css'), '.css').values()].join('\n');

/* Attribute values that point at a local file. */
const ASSET_ATTR_RE = /\b(?:src|href)\s*=\s*"([^"]+)"/gi;

function isExternal(u) {
  return /^(?:https?:)?\/\//i.test(u) || /^(?:data|mailto|tel|javascript):/i.test(u);
}

function resolveLocal(pageFile, url) {
  const clean = url.split('#')[0].split('?')[0];
  if (!clean) return null;                       // pure #anchor
  if (clean.startsWith('/')) {
    // Root-relative: served from public/, so '/' is the site index.
    const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
    return path.join(PUBLIC, rel);
  }
  return path.join(path.dirname(path.join(PUBLIC, pageFile)), clean);
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  const isReactLanding = html.includes('id="root"');

  // 3 + 4. hand-duplicated chrome and the footer mount (vanilla pages only).
  if (!isReactLanding) {
    for (const { needle, label } of REQUIRED_CHROME) {
      if (!html.includes(needle)) err(file, `missing ${label}`);
    }
  }

  // 1 + 2. every local asset and internal link resolves.
  ASSET_ATTR_RE.lastIndex = 0;
  let m;
  const seen = new Set();
  while ((m = ASSET_ATTR_RE.exec(html)) !== null) {
    const url = m[1].trim();
    if (!url || isExternal(url) || seen.has(url)) continue;
    seen.add(url);
    if (url.startsWith('#')) {
      const id = url.slice(1);
      if (id && !html.includes(`id="${id}"`)) err(file, `dead in-page anchor "${url}"`);
      continue;
    }
    const abs = resolveLocal(file, url);
    if (!abs) continue;
    if (!fs.existsSync(abs)) {
      err(file, `broken reference "${url}" -> ${path.relative(PUBLIC, abs)} does not exist`);
    }
  }

  if (isReactLanding) continue;

  // 5. script load order + module typing.
  const scripts = [];
  const scriptRe = /<script\b([^>]*)>/gi;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1];
    const srcM = /\bsrc\s*=\s*"([^"]+)"/i.exec(attrs);
    if (!srcM) continue;                                  // inline script
    scripts.push({ name: path.basename(srcM[1].split('?')[0]), attrs });
  }
  const order = scripts.map((s) => s.name);
  for (const rule of ORDER_RULES) {
    const i = order.indexOf(rule.first);
    if (i === -1) continue;
    for (const later of rule.then) {
      const j = order.indexOf(later);
      if (j !== -1 && j < i) err(file, `${rule.first} must load before ${later}`);
    }
  }
  for (const later of ['chat.js', 'console.js', 'exam.js']) {
    if (order.includes(later) && !order.includes('chat-core.js')) {
      err(file, `loads ${later} without chat-core.js`);
    }
  }
  if (order.includes('i18n.js') && !order.includes('footer.js')) {
    warn(file, 'loads i18n.js without footer.js — the footer will not render');
  }
  for (const s of scripts) {
    const isModule = /\btype\s*=\s*"module"/i.test(s.attrs);
    if (MODULE_SCRIPTS.has(s.name) && !isModule) {
      err(file, `${s.name} is an ES module and needs type="module"`);
    }
    if (!MODULE_SCRIPTS.has(s.name) && !isModule && !/\b(?:defer|async)\b/i.test(s.attrs)) {
      warn(file, `${s.name} is loaded without defer/async`);
    }
  }

  // 6. DOM hooks a loaded script reaches for must exist here or in the CSS.
  for (const { name } of scripts) {
    const src = jsSources.get(name);
    if (!src) continue;
    for (const [re, kind] of [
      [/getElementById\(\s*['"]([A-Za-z][\w-]*)['"]\s*\)/g, 'id'],
      [/querySelector(?:All)?\(\s*['"]#([A-Za-z][\w-]*)['"]\s*\)/g, 'id'],
      [/querySelector(?:All)?\(\s*['"]\.([A-Za-z][\w-]*)['"]\s*\)/g, 'class'],
    ]) {
      re.lastIndex = 0;
      let h;
      while ((h = re.exec(src)) !== null) {
        const hook = h[1];
        const inHtml = kind === 'id'
          ? html.includes(`id="${hook}"`)
          : new RegExp(`class="[^"]*\\b${hook}\\b`).test(html);
        if (inHtml) continue;
        // A hook the script creates itself, or that only styling defines, is
        // fine — flag it as a warning so a genuine typo is still visible.
        const inCss = kind === 'class' && new RegExp(`\\.${hook}\\b`).test(cssText);
        const created = new RegExp(`['"\`][^'"\`]*\\b${hook}\\b`).test(src)
          && /createElement|innerHTML|insertAdjacentHTML|classList\.add/.test(src);
        if (!inCss && !created) {
          warn(file, `${name} looks for ${kind === 'id' ? '#' : '.'}${hook}, not found in this page or the CSS`);
        }
      }
    }
  }
}

/* ---- report --------------------------------------------------------------*/
const pageCount = htmlFiles.length;
if (warnings.length) {
  console.log(`frontend-smoke: ${warnings.length} warning(s)`);
  for (const w of warnings) console.log(`  warn  ${w}`);
}
if (errors.length) {
  console.error(`\nfrontend-smoke: ${errors.length} error(s) across ${pageCount} pages`);
  for (const e of errors) console.error(`  FAIL  ${e}`);
  process.exit(1);
}
console.log(`frontend-smoke: ${pageCount} pages OK — assets, links, chrome, script order, DOM hooks.`);
