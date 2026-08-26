---
name: corpus-data
description: The data layer under the brain — the bundled GACAR corpus _chunks.json.gz, the optional dense index _embeddings.json.gz, chunking and index builds, eval case generation and training pairs. Use proactively when rebuilding the corpus or index, changing chunk shape, or working with ground-truth/training data.
tools: Read, Write, Edit, Glob, Grep, Bash
color: orange
---

Everything the service can honestly say is bounded by what is in the corpus.
Data work here is therefore retrieval work: a chunking change is a change to
which rules the model is even able to cite.

## What ships in the repo

- **`src/brain/_chunks.json.gz`** — the bundled GACAR corpus, the BM25 index
  source. It is committed on purpose: BM25 must keep working with **no network
  and no build step**.
- **`src/brain/_embeddings.json.gz`** — the optional dense index, produced by
  `npm run build:embeddings` (needs `EMBEDDINGS_BASE_URL`). **Never run at
  request time and never in CI.**
- **`evals/cases.json`**, `evals/gen-cases/`, `evals/training-pairs.jsonl`, and
  the Python side (`scripts/export-training-pairs.py`,
  `scripts/finetune-embedder.py`, `scripts/annotate-ground-truth.js`).

## Invariants you do not get to relax

- **BM25 stays the default and stays offline.** Dense embeddings (BGE-M3) and
  the cross-encoder reranker are fused in only when their `*_BASE_URL` is set.
  A data change that makes the lexical path depend on a network call is a
  regression, however good the numbers look.
- **Chunk shape is a contract with retrieval.** Chunks are ~1200 chars;
  parent-child expansion (ON by default, `ADEL_PARENT_CHILD=off` reverts)
  widens a hit to the full GACAR section capped at 4000 chars. Change the shape
  and you change what `retrieve.js` can expand, what a citation resolves to, and
  what the grounding layer can verify — re-run the evals, do not reason about it.
- **Direct citations take an exact-lookup fast path.** "Part 91, §91.155" must
  keep resolving exactly. Do not let a re-index swallow it.
- **Arabic normalization and the aviation synonym list** in `bm25.js` should
  track `authoring/rag.py`. `.gitattributes` forces that file to diff as text
  because it embeds Arabic combining marks — keep it that way.
- **The corpus is PDF-extracted and noisy.** Citation shaping degrades in
  tiers; do not "clean" data in a way that invents structure the source lacks.
- **Provenance.** Regulatory content belongs to GACA. It is quoted, not
  relicensed, and this repo's licence does not cover it.

## Rebuilding

Regenerate, then prove it: check the artefact's size and entry count changed the
way you expected, run `npm run test:unit` (the corpus-backed tests run with no
keys and no network), and run a live `npm run eval` when the change could move
retrieval. Committing a rebuilt `.gz` with no eval behind it is how a silent
retrieval regression ships.

## Before you hand back

`npm run smoke && npm run test:unit && npm run eval:dry`, plus the numbers:
chunk count, index size, and which eval you ran or could not run.
