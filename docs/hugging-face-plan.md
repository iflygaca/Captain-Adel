# Captain Adel — the Hugging Face plan

**What this is:** a sequenced plan to make Captain Adel materially better, with Hugging Face
carrying the parts it is actually good at — cross-lingual retrieval models, one-off GPU builds,
and the public proof surface. Written against the code as it stands (commit `728d75c`), not
against the aspiration.

> Every phase below ends at an **eval gate**. Nothing ships on vibes — see `evals/README.md`
> and the eval-gated principle in [`ROADMAP.md`](../ROADMAP.md).

---

## 1. The diagnosis

Six findings, all verified against the repo and the live Hub, in order of how much they cost us.

### 1.1 Arabic is structurally broken, not merely weak

The bundled corpus is **47,361 chunks across 95 documents, of which 70 contain any Arabic at
all** (0.15%). `bm25.js` normalizes Arabic orthography beautifully — alef/hamza/ta-marbuta
folding, aviation synonyms — and it does not matter, because there is almost nothing Arabic to
match. An Arabic question scores ~zero lexical hits, so `retrieve()` hands the model an empty
context and the Arabic path (correctly, per the grounding contract) refuses.

This is visible in the eval suite as a hole rather than a failure: of 113 cases, 40 are
Arabic-ish, and `docs/models.md` records the reason those cases assert only `answerLang` +
keywords — a `citesPart` assertion is *unreachable* for a pure-Arabic query today. We are not
measuring Arabic quality. We cannot, yet.

**Half the product's promise — "bilingual parity, Arabic is first-class" — is currently
unenforceable.** Everything else on this page is smaller than this.

### 1.2 The unlock is built, dark, and has never been switched on

`src/brain/embeddings.js` and `retrieveSmart()` in `retrieve.js` are complete: dense recall,
reciprocal-rank fusion, optional cross-encoder rerank, a `Float32Array` index loader, unit
tests. They are gated on two things that have never existed — an `EMBEDDINGS_BASE_URL` and a
prebuilt `src/brain/_embeddings.json.gz`.

The scaffolding is genuinely good. It just needs a model, an index, and a place to run.

### 1.3 Turning hybrid on today would only fix half the traffic

`answer.js:55` calls `retrieveSmart()` — so the retrieve-then-read path (all Arabic providers)
gets hybrid the moment it is configured. But the **default English path is agentic**, and its
`search_library` tool calls `bm25.searchLibrary()` directly and synchronously
(`src/brain/providers/gemini.js:121`). Gemini never touches `retrieveSmart()`.

So hybrid retrieval, as wired today, would improve the Arabic path and leave the majority path
untouched. Making the Gemini tool loop hybrid-aware is a required part of this work, not a
follow-up.

### 1.4 The dense index format will not survive contact with Cloud Run

`build-embeddings.js` writes gzipped **JSON arrays of floats**. At 47,361 chunks × 1024 dims:

| Format | On disk (pre-gzip) | Resident |
|---|---|---|
| JSON text, 1024-d (as written today) | ~580 MB | 194 MB |
| Binary `float32`, 1024-d | 194 MB | 194 MB |
| Binary `float32`, 512-d (MRL) | 97 MB | 97 MB |
| Binary `int8`, 512-d | 24 MB | 24 MB |
| Binary `int8`, 256-d | 12 MB | 12 MB |

The loader already converts to `Float32Array` to halve memory — the right instinct — but it
still has to `JSON.parse` roughly half a gigabyte of text on first request, inside a container
the Dockerfile sizes at 2 GiB with a 15 MB BM25 corpus already resident. **Change the format
before building the index, not after.**

Brute-force cosine over 47k × 512 is ~24M multiply-adds — tens of milliseconds in Node. No
vector database is needed, and adding one would be a mistake at this size.

### 1.5 PDPL cuts a precise line through "use Hugging Face"

The corpus is public GACA text. The user's question is **personal data** and must be processed
in-Kingdom. Dense retrieval touches both:

- **Embedding the corpus** (the one-off index build) → public data → *may run anywhere*, including
  HF Jobs on a GPU. ✅
- **Embedding the user's question** (every single request) → personal data → **must run
  in-Kingdom**. A hosted HF Inference Endpoint at query time would ship every Arabic question a
  Saudi pilot types to us-east-1. ❌

`CLAUDE.md` says "embeddings see only the public corpus, so they have no region constraint."
That is true of the *build* and false of the *query*. This plan treats them as two different
systems, and that distinction decides where HF sits everywhere below.

### 1.6 The three public HF repos are actively hurting us

Verified live on the Hub, all created 29 May 2026:

| Repo | State |
|---|---|
| `flygaca/captain-adel` (Space) | `README.md` + `.gitattributes` only. Declares `sdk: gradio`, `app_file: app.py` — **there is no `app.py`**, so every visitor gets a build error. |
| `flygaca/gacar-assistant-evals` (Dataset) | `.gitattributes` only. No data, no card. |
| `flygaca/CaptAdel` (Model) | `README.md` only — a well-written card that is entirely TBD, tagged `sentence-transformers` with no weights (so the widget and the snippet both fail), linking to `github.com/FlyGACA/flygaca` (**404**), never mentioning captadel.com. |

This matches `docs/brand-audit-2026-08.md`. It is the cheapest thing on this page to fix and the
only item that is currently *negative* value.

---

## 2. Model selections

### 2.1 Embeddings — switch the default from BGE-M3 to Qwen3-Embedding-0.6B

`embeddings.js` defaults to `BAAI/bge-m3`. BGE-M3 is still an excellent multilingual retriever
(36M downloads) but was last updated **July 2024**. For this corpus specifically,
**`Qwen/Qwen3-Embedding-0.6B`** is the better pick:

| | Qwen3-Embedding-0.6B | BAAI/bge-m3 |
|---|---|---|
| License | Apache-2.0 | MIT |
| Params / context | 0.6B / **32k** | 568M / 8k |
| Languages | 100+ (Arabic included) | 100+ |
| **MRL (truncatable dims)** | **Yes — any dim 32–1024** | No (fixed 1024) |
| Instruction-aware queries | Yes (+1–5% per the model card) | No |
| TEI-servable | Yes (`text-embeddings-inference` tag) | Yes |
| Vintage | Apr 2026 | Jul 2024 |

Two of those rows are decisive for us. **MRL** turns §1.4's index-size problem into a config
knob — build at 1024, truncate to 512 or 256, measure the recall cost on the eval set, keep the
smallest dimension that holds. **Instruction-aware queries** let us prefix the retrieval task
("Given an aviation regulation question in Arabic or English, retrieve the GACAR passage that
answers it"), which is exactly the asymmetric AR-query → EN-passage case we need.

The 32k context also means a full GACAR section — the parent-child expansion cap is 4000 chars —
embeds without truncation. Today `build-embeddings.js` clips at `EMBED_MAX_CHARS=1000`.

> Keep BGE-M3 as the fallback default in code so an existing config keeps working; change the
> *recommended* model and build the index with Qwen3.

### 2.2 Reranker — `Alibaba-NLP/gte-multilingual-reranker-base`

`embeddings.js` speaks TEI's `POST /rerank → {results:[{index, relevance_score}]}`. Pick the
reranker that serves that shape natively:

- ✅ **`Alibaba-NLP/gte-multilingual-reranker-base`** — Apache-2.0, 306M params, `ar` explicitly
  in its language list, carries the `text-embeddings-inference` tag. Drops into the existing
  client with zero code change.
- ⚠️ `Qwen/Qwen3-Reranker-0.6B` — likely stronger, Apache-2.0, but it is a **causal LM** that
  scores via yes/no logits, not a sequence-classification cross-encoder. It does not serve TEI's
  `/rerank` without a wrapper. Worth benchmarking later; not the first move.
- ❌ `jinaai/jina-reranker-v2-base-multilingual` — strong and popular, but **CC-BY-NC**. Same
  trap as Command R in `docs/models.md`: do not ship it. Research only.

### 2.3 Nothing changes about the answering models

ALLaM stays the Arabic default (`humain-ai/ALLaM-7B-Instruct-preview`, Apache-2.0 — the repo
already points at the correct post-rename namespace). Gemini stays the English default. Fanar has
a newer `QCRI/Fanar-2-27B-Instruct` worth a parity run when there is GPU headroom, but the
answering models are **not the bottleneck** — §1.1 is. Do not spend the next month on model
swaps.

---

## 3. The plan

### Phase 0 — Stop the bleeding on Hugging Face *(~1 hour, do today)*

Independent of everything else, and currently the only work with negative-to-positive swing.

1. **Space** → rewrite `README.md` front-matter to `sdk: static`, ship a branded `index.html`
   pointing at captadel.com. (Or make it private. Do not leave a build error public.)
2. **Dataset** → publish `evals/cases.json` as JSONL with a real card: the schema (`citesPart`,
   `mustInclude`, `refusalClass`, …), the license, the EN/AR split, and the sentence that is the
   actual selling point — *every change to this system is gated on these cases in both
   languages*. 113 bilingual aviation-RAG eval cases is content nobody else on the Hub has.
3. **Model card** → fix the 404 link, add captadel.com, and either remove the
   `sentence-transformers`/`sentence-similarity` tags until weights exist, or state plainly at the
   top that this repo is a placeholder. Keep the excellent limitations section.

**Gate:** all three repos render correctly for a logged-out visitor.

### Phase 1 — The cross-lingual unlock *(the main event)*

This is one coherent change with five parts. Ship it behind `ADEL_HYBRID` and roll back by
unsetting the env, exactly like every other switch in the brain.

**1.1 — Write the Arabic eval cases first.**
Nothing else in this phase is measurable without them. Today's 40 Arabic-ish cases assert
language and keywords only. We need ~25 Arabic questions carrying **real `citesPart` +
`mustInclude` assertions**, written against the English passage that ought to answer them.
They will all fail on `main`. That is the point: they are the acceptance test for this phase, and
the first honest measurement of bilingual parity the project has ever had.
*Owner: `eval-warden`. Prerequisite for everything below.*

**1.2 — Rebuild the index format.**
Before generating 47k vectors, change `build-embeddings.js` and the `denseIndex()` loader to a
binary layout — a header (`{count, dim, dtype, model, corpusHash}`) plus a raw
`Float32Array`/`Int8Array` buffer — instead of gzipped JSON. Add `EMBED_DIM` (MRL truncation) and
`EMBED_DTYPE`. Store the corpus hash so a stale index fails loudly instead of silently
mis-aligning with `_chunks.json.gz` by index.

**1.3 — Build the index on HF Jobs.**
This is the right use of Hugging Face: a one-off GPU batch job over public data.

```
hf_jobs uv --flavor a10g-small \
  # sentence-transformers, Qwen/Qwen3-Embedding-0.6B, batch the 47,361 chunks,
  # embed at 1024-d with the retrieval instruction prefix,
  # write index.bin + index.json, push to a PRIVATE dataset repo
```

Push the artifact to a **private** `flygaca/captadel-gacar-index` dataset repo (private because
the vectors are derived from GACA's text and are ours to gate), version it by corpus hash, and
pull it at Docker build time rather than committing 100 MB to git. Rebuild is then a single job
run whenever the corpus changes — no laptop, no local GPU, no `EMBEDDINGS_BASE_URL` needed for
the build at all.
*Note: HF Jobs requires a Pro/Team subscription; the account is currently on the free tier.
Confirm before planning around it — the fallback is any rented GPU hour, the script is the same.*

**1.4 — Make the agentic path hybrid-aware.**
`runTool()` in `gemini.js` is synchronous. Make the tool loop `await` its handlers so
`search_library` can call `retrieveSmart()` when hybrid is configured and fall through to
`bm25.searchLibrary()` when it is not. Without this, English — the majority of traffic — sees
none of the benefit (§1.3).

**1.5 — Serve query-time embeddings in-Kingdom.**
Per §1.5, the query embedder cannot be a hosted HF endpoint in production. Run
**TEI as a sidecar** next to the Node service in the same KSA Cloud Run region:
`ghcr.io/huggingface/text-embeddings-inference` with `--model-id Qwen/Qwen3-Embedding-0.6B`.
At 0.6B this is CPU-viable for a single short query per turn; give it a GPU only if p95 says so.
The existing client needs no change — TEI already speaks `POST /v1/embeddings` and `/rerank`.

For **development and evals only**, an HF Inference Endpoint is the fast path and is fine — the
eval corpus and eval questions are not personal data. Document the split in `.env.example` so
nobody promotes a dev URL to prod by accident.

**Gate:** the new Arabic cases go from 0% to a real number; `eval:parity` shows no English
regression; p95 latency stays inside budget with the sidecar in the loop. Ship on green.

### Phase 2 — Measure what we just built

- **Retrieval-only metrics.** Add a `recall@k` / `nDCG@10` harness over the eval questions,
  reported **per language**, so retrieval quality is separable from answer quality. Cross-lingual
  retrieval is asymmetric; a single aggregate number will hide the Arabic story.
- **Ablations, once, honestly:** BM25 alone vs +dense vs +dense+rerank; 1024 vs 512 vs 256 dims;
  Qwen3 vs BGE-M3. Publish the table. It answers "is the reranker worth its latency" and "how
  small can the index get" with evidence instead of taste.
- **Feedback → eval flywheel.** `/v1/feedback` already logs `{rating, turnId, provider}` and
  deliberately not the question. To turn 👎 into eval cases we need a PDPL-clean path — most
  likely explicit opt-in consent on the thumbs-down, storing the question only then. Design it
  before building it.

### Phase 3 — Make `flygaca/CaptAdel` real

Only after Phase 2 has a baseline worth beating. The existing model card already describes this
model in detail; the work is to make it exist.

- **Mine query→passage pairs** from the corpus: section titles, defined terms, and the exam bank
  in `public/assets/data/quiz.json` are natural queries whose answer passage is known. Translate a
  slice to Arabic to create the AR-query → EN-passage pairs that are precisely the hard case.
- **Fine-tune `Qwen3-Embedding-0.6B`** with `sentence-transformers` (MultipleNegativesRanking +
  hard negatives mined from the BM25 top-k) on HF Jobs. A 0.6B embedder LoRA is hours, not days.
- **Gate on the Phase-2 harness**, publish weights + the filled-in eval table, and keep the
  fine-tune *only* if it beats the base model per-language. A published model that loses to its
  own base is worse than no model.
- The corpus itself stays unpublished — it is GACA's text. Publish the model, the eval set, and
  the numbers; not the regulations.

An ALLaM LoRA for Arabic citation format and refusal discipline belongs here too, but strictly
second: retrieval fixed first, style after. RAG stays the source of truth in both cases.

### Phase 4 — Hugging Face as the public proof surface

With real artifacts in hand, the brand track in `ROADMAP.md` becomes easy:

- The **eval dataset** (Phase 0) plus the **parity results** (Phase 2) plus the **embedding model**
  (Phase 3) make `huggingface.co/flygaca` a portfolio rather than a placeholder.
- Rebuild the **Space** as a thin Gradio client against `/v1/chat` — an interactive demo with the
  real grounding badge and citations, rate-limited, pointing at captadel.com. It becomes the
  public front door the private repo can't be.
- A short writeup — *"cross-lingual RAG for Saudi aviation regulation: what it takes to answer an
  Arabic question from an English corpus"* — is genuinely novel content and the strongest
  credibility artifact available from this work.

---

## 4. Two more places Hugging Face earns its keep

**Injection defence with real models.** The repo has already vendored the prompt-injection and
guardrails skills under `.claude/skills/`. `guards.js` does soft heuristic detection today.
`meta-llama/Llama-Prompt-Guard-2-86M` (gated — request access) is small enough to run as a second TEI-style sidecar and would
turn the "flag, don't reject" posture into a measured one — with an expanded adversarial eval
suite (already a `ROADMAP.md` item) to prove it doesn't fire on legitimate Arabic questions.
Sequence this *after* Phase 1; it is hardening, not capability.

**Arabic voice, beyond the browser.** The "Voice, leveled up — Khaleeji Arabic TTS/STT" item in
`ROADMAP.md` is an HF-shaped problem: Whisper-large-v3 Arabic fine-tunes for dictation of
aviation terminology, which the browser's built-in STT mangles. Later horizon, but it is the
natural third act.

---

## 5. What not to do

- **Do not** route query-time embedding through a hosted HF endpoint in production (§1.5).
- **Do not** ship CC-BY-NC weights — `jina-reranker-v2`, Command R — however good the benchmarks.
- **Do not** add a vector database. 47k vectors is a `Float32Array` and a dot product (§1.4).
- **Do not** publish the GACAR corpus or the dense index publicly. Publish the model, the evals,
  and the numbers.
- **Do not** swap answering models before retrieval is fixed. The bottleneck is what the model is
  handed, not which model is handed it.
- **Do not** turn hybrid on without the Arabic eval cases. An unmeasured improvement to a
  safety-adjacent system is not an improvement.

---

## 6. Sequencing

| # | Work | Effort | Impact | Blocks on |
|---|---|---|---|---|
| 0 | Fix the three HF repos | ~1h | Removes an active negative | — |
| 1.1 | Arabic eval cases with real assertions | 1–2d | **Makes Arabic measurable** | — |
| 1.2 | Binary index format + MRL/dtype knobs | 1d | Makes the index deployable | — |
| 1.3 | Build the index on HF Jobs | ~½d + compute | The dense half exists | 1.2 |
| 1.4 | Async tool loop → hybrid for Gemini | 1d | Extends the fix to most traffic | — |
| 1.5 | TEI sidecar in-Kingdom | 1–2d | Makes it shippable under PDPL | 1.3 |
| 2 | Retrieval metrics + ablations | 2–3d | Turns taste into evidence | 1.x |
| 3 | Fine-tuned `CaptAdel` embedder | 1–2w | The differentiator | 2 |
| 4 | HF as public proof surface | ~2d | Brand + credibility | 0, 2, 3 |

**If only one thing gets done: 1.1 + 1.2 + 1.3 + 1.4 + 1.5, in that order.** That is the whole
of "Captain Adel answers Arabic questions." Everything else on this page is an amplifier on top
of it.

---

## 7. Related reading

[`ROADMAP.md`](../ROADMAP.md) · [`docs/models.md`](models.md) ·
[`docs/brand-audit-2026-08.md`](brand-audit-2026-08.md) ·
[`docs/RUNBOOK-arabic-provider.md`](RUNBOOK-arabic-provider.md) ·
[`evals/README.md`](../evals/README.md) · [`deploy/allam-vllm.md`](../deploy/allam-vllm.md)
