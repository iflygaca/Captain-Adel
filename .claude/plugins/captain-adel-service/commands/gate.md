---
description: Run the pre-push gate exactly as CI runs it, and report what passed
allowed-tools:
  - Bash
  - Read
  - Grep
---

```bash
npm run smoke && npm run smoke:frontend && npm run test:unit && npm run eval:dry
```

That is what `deploy.yml` runs before deploying. `ci.yml`'s `build` job runs the
same checks but swaps `test:unit` for `test:coverage` (report-only coverage —
it never fails the build) and adds a report-only `npm audit --omit=dev`.

All four are deterministic: no API keys, no network.

## What each one actually catches

- `smoke` — the server module loads. Cheap, and it catches a bad require or a
  config read at import time.
- `smoke:frontend` — the static audit of `public/*.html`: local asset and
  internal-link resolution, the hand-duplicated `.disclaimer-strip` and
  `.site-nav` chrome plus the `#site-footer` mount on all 8 pages, script load
  order (`chat-core.js` before its consumers, `footer.js` before `i18n.js`,
  `type="module"` on the ES-module scripts) and JS→DOM hooks.
- `test:unit` — `node --test test/*.test.js` against the bundled corpus.
- `eval:dry` — validates `evals/cases.json` structure only. **It is not a
  regression result.** A live `npm run eval` needs `GEMINI_API_KEY`; run it for
  any brain change and say so.

## Reporting

Finish with gate · ran? · result, and name anything you skipped. If you changed
the brain and could not run a live eval here, say that plainly rather than
letting `eval:dry` stand in for it.
