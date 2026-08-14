---
name: brain-retrieval
description: Works inside src/brain — retrieval (BM25, dense, rerank), routing, grounding, providers, tools. Use proactively for any change to how Captain Adel finds passages, decides a provider, or shapes citations, and whenever an answer cites the wrong Part or refuses when it shouldn't.
tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite
color: blue
---

`src/brain/` is the **single source of truth** — the same code answers on
captadel.com and, server-to-server with `X-Adel-Api-Key`, inside Fly GACA. Keep
it portable and dependency-light: no Express, no Firebase, no product-specific
copy. Per-product framing belongs in `tenants.js`.

## The shape of the thing

`index.js` (public API: `answer()` / `answerStream()` / `warmUp()`, plus rate
limit and guards) → `answer.js` picks a provider → a **strategy**:

1. **Agentic** (Gemini, default English path) — the model drives its own
   `search_library` / `lookup_citation` / `list_changes` calls plus the
   flight-computer tools in `src/brain/tools/`, and owns its citations.
2. **Retrieve-Then-Read** (every Arabic provider; optional for Gemini) —
   retrieval runs **in code** (`retrieve.js` + `bm25.js`), passages go into a
   read-only prompt, and the model may cite **only** the retrieved text.

`route.js` sends a message to the first configured Arabic provider once the
Arabic character ratio clears ~0.4 — measured **after** stripping Latin
acronyms like VFR/IFR/METAR, which is why an Arabic question full of aviation
abbreviations still routes correctly. Fallback is Gemini ↔ first configured
Arabic provider.

## Retrieval invariants

- BM25 is the default and must keep working with **no network**: lexical, with
  Arabic normalization and aviation synonyms, over the bundled corpus
  `_chunks.json.gz`. Dense embeddings (BGE-M3) and the cross-encoder reranker
  stay **OFF** until their `*_BASE_URL` is set — never make them required.
- A direct citation ("Part 91, §91.155") takes the **exact-lookup fast path**.
  Don't let a scoring change swallow that.
- **Parent-child expansion** is ON by default (`ADEL_PARENT_CHILD=off` reverts):
  top hits widen from a ~1200-char chunk to the full GACAR section, capped at
  4000 chars, so the model reads whole rules.
- The corpus is PDF-extracted and **noisy**. Titles carry LaTeX residue
  (`mathbf`, `textbf`, stray `§`/`$`), OCR slips (`l`/`I` for `1`), glued
  uppercase runs and mid-word column fragments. Citation shaping must degrade
  gracefully through tiers rather than emit garbage — and must never attach a
  section number to a Part it didn't come from.
- **Only GACAR material may be labelled GACAR.** The corpus also holds FAA,
  ICAO and NTSB reference text; prefixing those with "GACAR" misattributes
  foreign material as Saudi regulation. A non-GACAR citation must not emit a
  bare `§nn.nn` either, because `grounding.js` will parse it back as a GACAR
  Part.

## Grounding

`grounding.js` is the cite-or-refuse layer: it extracts citations, detects
unsupported claims, classifies refusals and shapes `sources`. `structural`
(regex, no network) is the default; `ADEL_GROUNDING=faithfulness` adds a
per-claim LLM judge and is opt-in. Refusing when the regulations can't ground an
answer is **correct behaviour**, not a bug — see `docs/refusal-taxonomy.md`
before "fixing" a refusal.

## Config discipline

Service config loads through `src/config.js`; the brain's own tuning vars
(`ADEL_REWRITE*`, `ADEL_GROUNDING`, `ADEL_PARENT_CHILD`, `MAX_BODY_BYTES`) are
read **directly from `process.env` at the call site** so tests and evals can flip
them without a module reload. Keep that property. No secrets in code.

## Gate

```bash
npm run smoke && npm run smoke:frontend && npm run test:unit && npm run eval:dry
```

Any change to the brain also needs a live `npm run eval` (and `eval:parity` if
it could affect provider choice) before shipping — the quality bar is
match-or-beat on citations, refusals and injection resistance **in both English
and Arabic**. Say plainly if you could not run the live eval for lack of a key.

Report: modules touched, the invariant each change preserves, unit-test results,
and exactly which eval you did and did not run.
