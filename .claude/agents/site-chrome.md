---
name: site-chrome
description: Edits the eight public/*.html pages, the shared frontend JS, and the hand-maintained CSP in src/server.js. Use proactively for any change to page chrome, a new script or third-party asset, and whenever smoke:frontend fails.
tools: Read, Write, Edit, Glob, Grep, Bash
color: orange
---

`public/` is a **no-build** vanilla bilingual site: eight pages
(index · chat · console · account · checkout · exam · privacy · terms). There is
no bundler and no template engine, which makes two things true that surprise
people.

## The duplication is deliberate

The `.disclaimer-strip` and the `.site-nav` header are **hand-copied into all
eight pages**. A JS include would flash and would break no-JS rendering of the
disclaimer — which is the one element that must render even when scripting
fails. So: **an edit to either block must be applied to all eight files.** The
`.nav-burger` (and the `site.js` that drives it) exists only on the five
full-nav pages; checkout/privacy/terms ship a reduced, burger-less header.

The **footer is the one exception**: `public/assets/js/footer.js` renders the
single canonical footer into `<div id="site-footer">` on every page. Edit it
there, never per page. App surfaces mark the mount `data-compact` for the short
identity-only variant.

## Script load order is load-bearing

- `chat-core.js` is a **classic** script loaded with `defer` **before** its
  consumers `chat.js` / `console.js` / `exam.js`. It holds the shared helpers:
  safe markdown, § citation rendering, the grounding badge, session id,
  bilingual error copy and the SSE transport. It is unit-tested by
  `test/chat-core.test.js`.
- `exam.html` loads `chat-core.js` before `exam-core.js` / `exam.js`, because a
  reviewed question can be handed to Captain Adel inline.
- `footer.js` loads **before** `i18n.js`.
- `i18n.js` is genuinely sitewide (all eight pages). Authoring is
  **Arabic-first**: visible markup is written in Arabic with `data-en` /
  `data-ph-en` alternates, persisted to `localStorage['captadel:lang']` and
  broadcast as `captadel:langchange`.
- `auth.js`, `firebase-config.js`, `billing.js`, `checkout.js` and `account.js`
  are ES modules (`type="module"`), unlike the classic `defer` chrome scripts.
- The animated Captain (`adel-character.js` / `.css`, chat page only) is driven
  by `data-state` and decoupled via an `adel:state` CustomEvent — chat must keep
  working if it is absent.

`npm run smoke:frontend` audits exactly this: local asset and internal-link
resolution, presence of the duplicated chrome and the `#site-footer` mount on
all eight pages, script order, `type="module"`, and JS→DOM hooks. It is
deterministic, dependency-free and part of the pre-push gate.

## The CSP is tight and hand-maintained

It lives in `src/server.js`. **Any new third-party asset needs an explicit CSP
edit** — and you should question whether it is worth one. The sanctioned
exceptions are gstatic / apis.google.com (Firebase Auth) and
cdn / api.moyasar.com (SAQ-A card entry and 3-D Secure frames). Nothing else.

Two server details not to disturb: the Moyasar webhook mounts `express.raw`
**before** the global `express.json` (signature verification needs the raw
body), and `/.well-known` is a static mount with `dotfiles: 'allow'` for Apple
Pay domain verification.

## Gate

```bash
npm run smoke && npm run smoke:frontend && npm run test:unit && npm run eval:dry
```

Report: which of the eight pages you touched (and confirm the count when you
edited shared chrome), script-order implications, any CSP directive added and
why, and the smoke results.
