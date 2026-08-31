---
name: systematic-debugging
description: Use when investigating a bug, a wrong or refused answer, a failing
  eval case, or an unexpected provider/retrieval result in Captain Adel — before
  writing any fix. Forces root-cause investigation over symptom patching across
  provider fallback chains, retrieval/grounding boundaries, and multi-tenant
  routing.
domain: engineering
subdomain: debugging-methodology
tags:
- debugging
- root-cause-analysis
- rag
- eval-regression
version: '1.0'
author: adapted-from-obra-superpowers
license: MIT
---
# Systematic Debugging

> Adapted from the `systematic-debugging` skill in
> [obra/superpowers](https://github.com/obra/superpowers) (MIT license — see
> `LICENSE` in this folder). Rewritten and re-scoped for Captain Adel's
> Node.js RAG stack; not a verbatim copy of the upstream file.

## Core principle

**Find the root cause before attempting any fix. A symptom fix is a failure**,
even if the symptom goes away — it usually resurfaces in `evals/`, in a
different tenant, or in production. This matters more here than in a typical
CRUD app because a wrong answer can travel through several boundaries before
it's visible: retrieval (`src/brain/bm25.js`, `retrieve.js`) → provider call
(`src/brain/providers/*`) → grounding (`src/brain/grounding.js`) → route
(`src/brain/route.js`) → tenant framing (`src/brain/tenants.js`). A fix
applied at the wrong layer looks like it worked and isn't.

## The four phases

**1. Root cause investigation.** Read the actual error or the actual bad
output — don't paraphrase it from memory. Reproduce it deterministically: for
answer-quality bugs, capture the exact question, tenant, and provider
(`MODEL_PROVIDER`); for eval failures, run the single failing case in
isolation (`node evals/run.js` accepts scoping — check `evals/run.js --help`
equivalent usage) rather than the whole suite. Check recent changes with
`git log -p` on the files in the suspect path. In this codebase, most bugs
that *look* like a model problem are actually a boundary problem: wrong
chunks retrieved, citations stripped in `grounding.js`, or a provider-specific
quirk in `openai-compatible.js` vs. `gemini.js`.

**2. Pattern analysis.** Find the nearest working equivalent and diff against
it line by line. A bug in one provider module (say `allam.js`) against a
working `qwen.js` is almost always a divergence from the shared
`openai-compatible.js` contract, not a new problem. A bug in one tenant is
usually a difference in `tenants.js` framing, not the shared retrieval path.

**3. Hypothesis and minimal test.** State one hypothesis, change exactly one
variable, and verify. Don't touch retrieval, grounding, and provider code in
the same experiment — you won't know which change mattered.

**4. Fix with a regression case.** Before implementing, add or update a
failing test (`test/*.test.js` for unit-level logic) or eval case
(`evals/cases.json` — coordinate with the `eval-warden` / `eval-curator`
agents) that reproduces the bug. Apply the smallest fix that addresses the
actual root cause. If three fix attempts fail, stop — the architecture
assumption is probably wrong, not the code. Re-open phase 1.

## Red flags — go back to phase 1

- "Quick fix now, investigate properly later"
- Changing retrieval, grounding, and a provider module in the same commit
- A fix with no accompanying test or eval case
- Time pressure as a reason to skip reproduction

## Applying this in Captain Adel

- **Provider parity bugs** (`npm run eval:parity*`): the fix almost always
  belongs in the shared code path (`openai-compatible.js`, `route.js`), not
  in one provider file — confirm with pattern analysis before touching a
  single provider.
- **Grounding/refusal bugs**: reproduce with the exact question against
  `grounding.js`'s cite-or-refuse logic before assuming it's a retrieval gap.
- **Arabic-path bugs**: check whether `ALLAM_BASE_URL` is actually set before
  debugging ALLaM behavior — an empty value silently changes the code path
  (see CLAUDE.md's data-residency note on this).
