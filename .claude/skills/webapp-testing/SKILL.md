---
name: webapp-testing
description: Use when verifying a change to public/*.html, the landing/ React
  app, or any browser-facing behavior (chat SSE rendering, exam-mode flow,
  checkout) before calling the work done. Complements scripts/frontend-smoke.js
  (static, dependency-free, no browser) with actual browser automation via
  Playwright for things static checks structurally can't catch — JS execution,
  visual state, real network round-trips against a running server.
domain: engineering
subdomain: frontend-testing
tags:
- playwright
- browser-testing
- frontend
- smoke-testing
version: '1.0'
author: adapted-from-anthropics-skills
license: Apache-2.0
---
# Web Application Testing

> Adapted from the `webapp-testing` skill in
> [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/webapp-testing)
> (Apache-2.0 — see `LICENSE` in this folder). The upstream skill is Python +
> Playwright; this version is rewritten for this repo's pure-Node stack (no
> Python here) and the `scripts/with-server.js` helper is original code
> written for this port, not a copy of upstream's `with_server.py`.

## Where this fits next to what's already here

This repo already has `scripts/frontend-smoke.js` (`npm run smoke:frontend`):
a fast, deterministic, no-browser check that every `public/*.html` page's
assets resolve, chrome blocks are present, script load order is correct, and
JS-to-DOM hooks exist. It catches structural regressions but **cannot** catch
anything that only shows up once JavaScript actually runs in a browser —
whether `chat.html`'s SSE stream renders correctly, whether `exam.html`'s
`sessionStorage` resume actually resumes, whether a CSP change silently
blocks a script, or how the `landing/` Vite+React app actually looks.

Run `npm run smoke:frontend` first — it's instant and catches the
easy stuff. Reach for this skill when you need to see the page actually
render and behave, per this repo's own system-prompt convention: *"For UI or
frontend changes, start the dev server and use the feature in a browser
before reporting the task as complete."*

## Setup

Playwright's Chromium binary is pre-installed in this environment
(`PLAYWRIGHT_BROWSERS_PATH` is already set — do not run `playwright install`).
This repo does not declare `@playwright/test` as a dependency, so drive it
directly with `npx playwright` for one-off scripts, or add it as a
`devDependency` if you're committing a reusable test. If a pinned
`@playwright/test` version in a `devDependency` doesn't match the
pre-installed browsers, launch with
`executablePath: '/opt/pw-browsers/chromium'` instead of letting Playwright
try to re-download.

## Workflow

**1. Static or dynamic?** `public/*.html` pages are hand-written, no build
step — open the file directly or serve `public/` with any static server.
`landing/` is a Vite app — it needs `npm run dev` (or the built output)
actually running.

**2. Start what needs starting, then wait for it.** Use
`scripts/with-server.js` in this folder to start one or more servers and
block until their ports accept connections, then run your Playwright script,
then always tear the servers down:

```bash
node .claude/skills/webapp-testing/scripts/with-server.js \
  --server "node src/server.js" --port 3000 \
  -- node my-check.mjs
```

For the landing app: `--server "cd landing && npm run dev" --port 5173`.

**3. Reconnaissance before action.** Navigate, then
`await page.waitForLoadState('networkidle')` before inspecting the DOM on
anything dynamic (`chat.html`'s streamed response, the exam palette, the
landing SPA). Take a screenshot or dump the DOM to find real selectors —
don't guess them from the HTML source, since scripts mutate it.

```js
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3000/chat.html');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: '/tmp/chat.png' });
console.log(await page.content());
await browser.close();
```

**4. Then act**, using the selectors you just confirmed exist — click,
type, submit — and assert on the resulting DOM state or a captured console
message (`page.on('console', ...)`), not on internal implementation details.

**5. Always close the browser** and let `with-server.js`'s cleanup kill the
server(s), even on failure.

## What to check for this repo specifically

- **`chat.html`**: SSE stream renders progressively, § citations render,
  markdown from `chat-core.js` doesn't break on RTL/Arabic input.
- **`exam.html`**: timed exam mode, topic practice selection, `sessionStorage`
  resume after reload, post-exam debrief hand-off to chat.
- **CSP regressions**: a new script or asset silently blocked shows as a
  browser console error, not a build failure — check `page.on('console')`
  and `page.on('pageerror')` after any change touching
  `src/server.js`'s CSP or a new third-party asset.
- **`landing/`**: both `/` (EN) and `/ar/` render, RTL layout doesn't break.
