---
name: test-driven-development
description: Use when implementing any new feature, bug fix, or behavior change
  in Captain Adel's src/, before writing implementation code. Write the failing
  test first (node --test), watch it fail, then write the minimal code to pass.
  Distinct from evals/ — TDD covers unit-level code correctness; evals/ is the
  separate answer-quality regression gate (see eval-warden agent).
domain: engineering
subdomain: testing-methodology
tags:
- tdd
- unit-testing
- node-test-runner
version: '1.0'
author: adapted-from-obra-superpowers
license: MIT
---
# Test-Driven Development (TDD)

> Adapted from the `test-driven-development` skill in
> [obra/superpowers](https://github.com/obra/superpowers) (MIT license — see
> `LICENSE` in this folder), trimmed and re-scoped for this repo's `node --test`
> workflow, with the upstream examples ported from Jest-style TypeScript to
> this codebase's plain Node.js test runner.

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** if you didn't watch the test fail, you don't know it
tests the right thing.

## The iron law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? Delete it — don't keep it "as reference," don't
adapt it while writing the test. Implement fresh from the test.

## Red-Green-Refactor, with this repo's tooling

**RED — write one failing test.** This repo uses Node's built-in test runner
(`node:test` + `node:assert`), run via `npm run test:unit`
(`node --test test/*.test.js`). One behavior per test, a name that describes
that behavior, real code over mocks unless a dependency is genuinely
unavailable in-process (e.g. an outbound provider call).

```js
test('retries a failed provider call up to 3 times', async () => {
  let attempts = 0;
  const call = async () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'ok';
  };
  const result = await withRetry(call);
  assert.strictEqual(result, 'ok');
  assert.strictEqual(attempts, 3);
});
```

**Verify RED — mandatory, never skip.**

```bash
node --test test/your-file.test.js
```

Confirm it fails for the expected reason (feature missing), not a typo or
setup error.

**GREEN — minimal code to pass.** Don't add options, config, or "while I'm
here" generality the test doesn't require. YAGNI applies especially to
provider/tool code, which already carries real config surface
(`src/brain/providers/*`, `src/brain/tools/*`).

**Verify GREEN — mandatory.** Re-run the target file, then the full suite
(`npm run test:unit`) to confirm nothing else broke, with clean output (no
stray console warnings).

**REFACTOR.** Only after green. Keep tests passing; don't add behavior.

## Where this does and doesn't apply

- **Applies:** `src/brain/*` logic (retrieval, grounding, routing, tools),
  `src/server.js` request handling, anything under `test/`.
- **Does not replace evals:** `evals/cases.json` and `npm run eval` /
  `eval:parity` measure answer *quality* and *provider parity* against real
  model calls — that's the `eval-warden` / `eval-curator` agents' domain, not
  a unit-test loop. A grounding bug still starts with a unit test for the
  grounding function itself; the eval case documents the regression at the
  answer level.
- **Exceptions (use judgment, don't rationalize):** one-off scripts in
  `scripts/`, generated fixtures (`scripts/record-sse-fixtures.js` output),
  throwaway exploration you intend to delete.

## Common rationalizations to reject

| Excuse | Reality |
|---|---|
| "I'll test after" | Tests written after pass immediately — proves nothing about whether they'd have caught the bug. |
| "Already manually tested" | No record of what was covered, no re-run on the next change. |
| "Too simple to test" | Simple code breaks too; the test costs 30 seconds. |
| "Existing code has no tests" | You're touching it now — add coverage for the path you're changing. |

## Verification checklist before marking work done

- [ ] Every changed/added function has a test
- [ ] Watched each test fail before implementing
- [ ] Each failure was for the expected reason
- [ ] Wrote minimal code to pass
- [ ] `npm run test:unit` passes clean, no stray warnings
- [ ] Bug fixes include a regression test that reproduces the original bug
