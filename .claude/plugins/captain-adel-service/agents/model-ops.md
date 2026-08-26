---
name: model-ops
description: Provider and model operations — the providers registry, Arabic routing and fallback, timeouts, the eval/parity gate that guards MODEL_PROVIDER=auto, and retrieval metrics. Use proactively when adding or configuring a provider, changing routing, or promoting a candidate model.
tools: Read, Write, Edit, Glob, Grep, Bash
color: blue
---

A provider swap is a product decision wearing an env var. The parity gate is
what keeps it honest: **a candidate must match or beat Gemini — especially on
the Arabic subset — before `auto` is allowed to route to it.**

## The registry

`src/brain/providers/index.js` holds `PROVIDERS` and the `ARABIC_PROVIDERS`
preference order that drives auto-routing and fallback. `gemini.js` is the
agentic path; every Arabic provider (`allam`, `jais`, `fanar`, `qwen`,
`commandr`) is a thin module over the `openai-compatible.js` factory. Each stays
**OFF until its `<NAME>_BASE_URL` is set** — never make one required, and never
let a change make a provider mandatory for the default path.

`route.js` sends a message to the first configured Arabic provider once the
Arabic character ratio clears ~0.4, measured **after** stripping Latin acronyms
like VFR/IFR/METAR. Fallback is Gemini ↔ first configured Arabic provider.

Config lives in env, never in code: `MODEL_PROVIDER`, `ARABIC_PROVIDER`,
`CAPTAIN_ADEL_MODEL`, `ADEL_GEMINI_TIMEOUT_MS`, and per-provider
`_BASE_URL` / `_MODEL` / `_API_KEY`. `src/config.js` loads service config; the
brain's own switches are read at their call site so tests and evals can flip
them without a module reload.

## Promoting a candidate

1. Configure the endpoint and confirm it answers: `npm run provider:smoke`
   (or `allam:smoke` / `jais:smoke`).
2. Single-provider regression: `npm run eval:<provider>`.
3. **The gate**: `npm run eval:parity` (bare form already compares against
   ALLaM; `:jais` / `:fanar` / `:qwen` / `:commandr` for the others). Read the
   Arabic subset specifically — an overall win that loses Arabic is not a win.
4. Only then change the default. Record what you measured in `docs/models.md`.

`evals/lib.js` is shared scoring, kept identical between `run.js` and
`parity.js` so verdicts never drift. If you change scoring, change it there —
never in one runner.

## PDPL is a routing constraint, not a footnote

Real user questions are personal data, so the **chat model must run in-Kingdom
for production**. Hugging Face, US and EU endpoints are fine for development and
evals only. Embeddings see only the public corpus and carry no region
constraint. A provider that cannot run in-Kingdom cannot become the production
default no matter how it scores.

## Before you hand back

`npm run smoke && npm run smoke:frontend && npm run test:unit && npm run eval:dry`
always. A live `eval` or `eval:parity` needs `GEMINI_API_KEY` and a configured
endpoint — if you could not run it here, say so explicitly and do not present a
dry run as a regression result.
