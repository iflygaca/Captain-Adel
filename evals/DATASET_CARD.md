---
language:
- en
- ar
license: mit
task_categories:
- question-answering
tags:
- aviation
- gacar
- saudi-arabia
- rag-evaluation
pretty_name: GACAR Assistant Evals (Saudi Civil Aviation)
size_categories:
- n<1K
---

# GACAR Assistant Evals (Saudi Civil Aviation)

The official evaluation dataset for **Captain Adel** (captadel.com / Fly GACA) — the independent, retrieval-grounded AI flight instructor for Saudi civil aviation regulations (GACAR).

## Dataset Summary

Every prompt or model change to Captain Adel is eval-gated in both **English and Arabic** against this suite.

- **Total Cases:** ${cases.length}
- **Domains Covered:** 30+ GACAR Parts (Part 1, 61, 67, 91, 107, 121, 135, 139, etc.)
- **Categories:** `citation` (exact GACAR section reference), `refusal` (unanswerable / hallucination-resistance), `injection` (prompt-injection security), and `coverage` (per-Part grounding).

## Schema

Each entry contains:
- `id` *(string)*: Unique case identifier
- `category` *(string)*: `citation` | `refusal` | `injection` | `coverage`
- `question` *(string)*: The prompt in English or Arabic
- `expect` *(object)*:
  - `citesPart` *(list[string])*: Required GACAR Part number(s) cited in response
  - `mustInclude` *(list[string])*: Required substring assertions
  - `mustIncludeAny` *(list[string])*: At least one required substring
  - `mustNotInclude` *(list[string])*: Disallowed substring assertions
  - `shouldHaveSources` *(bool)*: Whether retrieved citations are expected
  - `answerLang` *(string)*: `ar` | `en`
- `groundTruthChunks` *(list[int])*: Reference corpus chunk IDs (when available)
