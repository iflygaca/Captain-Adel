# Captain Adel: Cross-Lingual Retrieval Roadmap

> [!WARNING]
> **This is a plan, not a status report. Every metric in it is a target or a
> placeholder — none are measured.**
>
> Read the ✅ marks below as "specified", never as "done and verified". No ablation has
> been run (`src/brain/_embeddings.bin` does not exist, so there is no dense index), no
> embedder has been fine-tuned, and no recall, citation-accuracy or latency figure here
> has been observed. Numbers like "44% Arabic recall@5" originate in the template blocks
> of [`phase-2-retrieval-metrics.md`](phase-2-retrieval-metrics.md) and are illustrative.
> Do not quote any figure from this file as a baseline or a result, and do not copy them
> into the README, a model card or a dataset card.
>
> **Naming:** `scripts/finetune-embedder.py` defaults `HUB_MODEL_ID` to
> `flygaca/CaptAdel-finetuned`, which does not exist on the Hub. The model repo that
> does exist is [`flygaca/CaptAdel`](https://huggingface.co/flygaca/CaptAdel) (no weights
> published yet). References below use the script's current default; decide which name is
> canonical before the first push.

**Vision:** Enable Captain Adel to answer Arabic pilot questions by retrieving English GACAR regulations through cross-lingual dense retrieval, fine-tuned for aviation domain, and proven live.

**4-phase delivery** (Aug 2026 – Dec 2026, est.)

---

## Phase 1: Retrieval Unlock (8 weeks)

**Goal:** Enable hybrid (dense + BM25 + rerank) retrieval for both English and Arabic paths. Unlock Arabic via cross-lingual embeddings. Deploy in-Kingdom TEI for PDPL compliance.

**Deliverables:**

1. **Arabic evaluation cases** (`evals/cases.json` +25 cases)
   - 25 new Arabic questions with English GACAR citations
   - Real citesPart assertions (Part 91, Part 135, etc.)
   - Cases measure cross-lingual retrieval quality (was unmeasurable with BM25-only)
   - Status: ✅ Spec & cases implemented

2. **Binary index format** (`src/brain/_embeddings.bin`, scripts/build-embeddings.js)
   - Replace JSON (580 MB, 300ms parse) with binary (194 MB, 50ms read)
   - Matryoshka Representation Learning (MRL): truncate to 512-d or 256-d at runtime
   - Backward compatible with existing JSON format
   - Status: ✅ Spec ready

3. **HF Jobs build script** (`scripts/submit-embeddings-job.js`)
   - Shard corpus into 8 parallel jobs on Hugging Face GPU infrastructure
   - Output: binary index pushed to `flygaca/CaptAdel` model repo
   - 10-15 minute wall time, ~$2-5 cost per build
   - Reproducible, no local GPU needed
   - Status: ✅ Spec ready

4. **Async tool loop** (`src/brain/providers/gemini.js`)
   - Refactor `answerAgentic()` to support async operations
   - Route `search_library` tool call through `retrieveSmart()` (hybrid)
   - Fallback to BM25 if dense/rerank fails
   - No behavioral change (same output shape)
   - Status: ✅ Spec ready

5. **In-Kingdom TEI endpoint** (Cloud Run, me-central2)
   - Text Embeddings Inference service in KSA region
   - Query embedding runs in-Kingdom (PDPL-safe)
   - Corpus embedding via HF Jobs (public data, no region constraint)
   - Service-to-service auth, no public access
   - Status: ✅ Spec ready

**Phase 1 gate:**
```
npm run eval
```
- All 138 cases (113 EN + 25 AR) must pass
- Arabic cases that were unreachable via BM25 now retrieve correctly
- No regression on English

**Hoped-for outcome** *(targets, not measurements — nothing below has been observed)*:
- Arabic recall rises materially off a BM25-only floor that is expected to be very low,
  because the corpus is English and a pure-Arabic query scores few or no lexical hits
- English recall stays strong
- Both paths benefit from hybrid retrieval

---

## Phase 2: Retrieval Metrics & Ablations (4 weeks)

**Goal:** Measure the cross-lingual unlock. Quantify impact of embeddings, reranking, dimension trade-offs. Decide production configuration.

**Deliverables:**

1. **Retrieval metrics** (`evals/metrics.js`)
   - Recall@5, @10, @20 per language
   - Citation accuracy (% of cases that cite the correct Part)
   - Source presence (% of cases that retrieved ≥1 passage)
   - Status: ✅ Spec ready

2. **Ablation configurations** (`evals/ablations.js`)
   - BM25-only (baseline)
   - Dense 1024-d, no rerank
   - Dense 512-d, no rerank
   - Dense 256-d, no rerank
   - Dense 512-d + reranker
   - Hybrid RRF + reranker (full stack)
   - Status: ✅ Spec ready

3. **Per-language aggregation** (`evals/ablations.js`)
   - Separate metrics for English vs. Arabic
   - Spot hard cases where fine-tuning will help
   - Status: ✅ Spec ready

4. **Latency instrumentation** (`src/brain/retrieve.js`)
   - Measure dense embedding time, BM25, RRF, reranking separately
   - Log to Cloud Logging (structured JSON)
   - Latency breakdown visible in Phase 4 proof surface
   - Status: ✅ Spec ready

5. **Decision document** (`evals/phase-2-ablation-report.md`)
   - Production config recommendation
   - Expected impact (recall, citation, latency, memory)
   - Ship gates (Arabic recall ≥40%, citation ≥75%, latency p95 ≤2s)
   - Status: ✅ Spec ready

**Phase 2 gate:**
```
npm run eval -- --phase2-ablations
```
- Arabic recall@5 ≥ 40% *(threshold to hit — not yet measured)*
- Citation accuracy Arabic ≥ 75% *(threshold to hit — not yet measured)*
- Latency p95 ≤ 2s (acceptable for agentic loop)
- No regression on English

**Hypotheses to test** *(not findings — the ablation has not run)*:
- The full hybrid stack (RRF + rerank) wins
- Truncating to 512-d costs little recall relative to 1024-d while halving the index
- If both hold, ship 512-d by default. The memory saving is arithmetic (half the
  dimensions, half the bytes); the recall cost is the part that needs measuring

---

## Phase 3: Fine-tuned Embedder (6 weeks)

**Goal:** Close the remaining gap via domain-specific fine-tuning. Train on GACAR-specific retrieval pairs. The size of the achievable lift is unknown until Phase 2 produces a real baseline.

**Deliverables:**

1. **Training pair export** (`scripts/export-training-pairs.py`)
   - Mine contrastive pairs from `evals/cases.json` groundTruthChunks
   - Positives: all ground-truth chunks
   - Negatives: stratified sampling (in-Part wrong-section, cross-Part hard)
   - Output: `evals/training-pairs.jsonl` — **66 pairs** from 99 annotated cases (39
     Arabic-only cases returned no BM25 hits, so they carry no ground truth to mine)
   - Status: ✅ implemented and run

2. **Fine-tuning script** (`scripts/finetune-embedder.py`)
   - Load base Qwen3-Embedding-0.6B
   - MultipleNegativesRankingLoss (in-batch contrastive)
   - 3 epochs, 2e-5 LR
   - Validate on held-out test set (15%, MRR@5)
   - Status: ✅ Spec ready

3. **Fine-tuned model** (`flygaca/CaptAdel-finetuned`)
   - Push to Hugging Face Hub
   - Model card with training data, methodology, expected improvements
   - Status: Spec ready, awaits Phase 1 foundation

4. **Validation via Phase 2 re-run** (`evals/ablations.js` with fine-tuned model)
   - Re-run ablations with the fine-tuned model
   - Compare side-by-side: base Qwen3 vs. fine-tuned CaptAdel
   - Expected: a measurable Arabic lift. Size unknown — there is no baseline to lift from
     until Phase 2 actually runs
   - Status: Spec ready

**Phase 3 gate:**
```
EMBEDDINGS_MODEL=flygaca/CaptAdel-finetuned npm run eval -- --phase2-ablations
```
*Thresholds cannot be set responsibly yet — each was written as "≥ X (was Y baseline)"
and every Y traces to a placeholder. Set them from the real Phase 2 numbers once those
exist, then treat them as the gate.*

- Arabic recall@5 clears its threshold
- English recall shows no regression
- Arabic citation accuracy clears its threshold
- Training converges (MRR@5 on held-out test set ≥ 0.55)

**Hoped-for outcome** *(untested)*:
- Hard cases (cross-lingual, multi-Part ambiguity) improve most — by how much is unknown
- Regulatory terminology (minimum equipment list, type ratings) better understood
- Cross-lingual synonymy (Arabic intent → English regulation) captured

---

## Phase 4: Public Proof Surface (4 weeks)

**Goal:** Demonstrate the retrieval stack live. Build public trust via transparency. Serve as integration proof for Fly GACA adoption.

**Deliverables:**

1. **Gradio app** (`src/gradio_app.py`)
   - User enters Arabic or English question
   - Hybrid retrieval live (dense + BM25 + RRF + rerank)
   - Display top-10 passages with Part/section anchors
   - Latency breakdown (dense, recall, BM25, RRF, rerank times)
   - Status: ✅ Spec ready

2. **A/B toggle**
   - Compare fine-tuned vs. base embedder side-by-side
   - Show score differences (e.g., "Fine-tuned +0.07 (7% improvement)")
   - Quantify the benefit
   - Status: ✅ Spec ready

3. **Bilingual UI**
   - Arabic/English toggle (persistent)
   - Hero with example queries in both languages
   - Status: ✅ Spec ready

4. **Hugging Face Spaces deployment** (`flygaca/captain-adel`)
   - Public, live demo
   - Preload corpus & binary embeddings index
   - Inference-only (no writing, no DB)
   - CPU + 16 GB RAM sufficient
   - Status: Spec ready

5. **Usage analytics**
   - Queries per day, language distribution
   - Latency metrics (average, p50, p95)
   - Most popular queries (trending)
   - A/B model preference tracking
   - Status: Spec ready

**Phase 4 gate:**
- App deployed & live at `https://huggingface.co/spaces/flygaca/captain-adel`
- Latency <2s per query
- A/B comparison working
- Bilingual UI functional
- Example queries demonstrate Arabic→English retrieval
- Shared with Fly GACA team for feedback

**Expected outcome:**
- Public proof that cross-lingual retrieval works
- Trust via transparency (latency breakdown, citation anchors)
- Marketing anchor for ecosystem adoption
- Integration proof for Fly GACA

---

## Timeline & Milestones

| Phase | Duration | Start | Finish | Output |
|-------|----------|-------|--------|--------|
| 0 (HF repo fixes) | 1 week | Aug 25 | Sep 1 | Phase 0 specs, HF repos fixed |
| 1 (Retrieval unlock) | 8 weeks | Sep 2 | Oct 27 | Arabic cases + binary index + HF Jobs + async loop + TEI |
| 2 (Metrics & ablations) | 4 weeks | Oct 28 | Nov 24 | Ablation report + production config decision |
| 3 (Fine-tuned embedder) | 6 weeks | Nov 25 | Dec 28 | `flygaca/CaptAdel-finetuned` model + validation |
| 4 (Proof surface) | 4 weeks | Dec 29 | Jan 25 | Live Spaces demo + Fly GACA integration |

---

## Architecture: Full Stack

```
┌─────────────────────────────────────────────────────────┐
│ CAPTAIN ADEL — CROSS-LINGUAL RETRIEVAL STACK            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Phase 4: Public Proof (Gradio Spaces)                   │
│                                                          │
│  Query (AR/EN) → Hybrid retrieve → Display results      │
│  ✓ Latency breakdown                                     │
│  ✓ Citation anchors (Part/section)                       │
│  ✓ A/B side-by-side (fine-tuned vs. base)               │
│  ✓ Bilingual UI                                          │
└─────────────────────────────────────────────────────────┘
         ↑
┌─────────────────────────────────────────────────────────┐
│ Phase 3: Fine-Tuned Embedder                            │
│                                                          │
│  flygaca/CaptAdel-finetuned (lift unmeasured)           │
│  Trained on 66 GACAR retrieval pairs                    │
│  ✓ MultipleNegativesRankingLoss                         │
│  ✓ MRR@5 ≥ 0.55 on held-out test                        │
└─────────────────────────────────────────────────────────┘
         ↑
┌─────────────────────────────────────────────────────────┐
│ Phase 2: Retrieval Metrics & Ablations                  │
│                                                          │
│  Measure impact per language & config                   │
│  ✓ Recall@5, @10, @20                                   │
│  ✓ Citation accuracy                                    │
│  ✓ Latency breakdown (dense, BM25, RRF, rerank)         │
│  ✓ Production config decision (512-d recommended)       │
└─────────────────────────────────────────────────────────┘
         ↑
┌─────────────────────────────────────────────────────────┐
│ Phase 1: Retrieval Unlock (5 components)                │
│                                                          │
│  1. Arabic eval cases (25 new)                          │
│  2. Binary index format (194 MB → 97 MB resident)       │
│  3. HF Jobs corpus build (8× parallel)                  │
│  4. Async tool loop (search_library → hybrid)           │
│  5. In-Kingdom TEI (Cloud Run me-central2, PDPL-safe)   │
│                                                          │
│  · BM25 weak for AR → Hybrid targets a lift             │
│  · No regression on English (target)                    │
└─────────────────────────────────────────────────────────┘
         ↑
┌─────────────────────────────────────────────────────────┐
│ Phase 0: HF Repo Fixes (Foundation)                     │
│                                                          │
│  - flygaca/CaptAdel (model repo): Update card, binary   │
│  - flygaca/captadel-corpus (dataset): Add Arabic        │
│  - flygaca/captadel-space (space): Gradio UI fix        │
│                                                          │
│  ✓ Repos functional, credentials wired, docs complete  │
└─────────────────────────────────────────────────────────┘
```

---

## Why This Order

1. **Phase 0 first:** Prepare HF infrastructure (repos, auth, credentials). Blocker for everything downstream.

2. **Phase 1 core:** Arabic cases + binary index + HF Jobs + async loop + TEI are **independent**, can be worked in parallel:
   - Arabic cases: pure data, no infra
   - Binary format: code change, no external deps
   - HF Jobs: infra/script, no code change needed
   - Async loop: code change, self-contained
   - TEI: cloud deployment, self-contained
   
   All 5 together unlock cross-lingual retrieval (was impossible with BM25).

3. **Phase 2 measures:** Can't measure Phase 1 without ablations. Phase 2 is the **decision gate** — should we ship, and at what config? (Answer: yes, 512-d recommended.)

4. **Phase 3 improves:** Phase 2 is what reveals the gap between off-the-shelf retrieval and the goal; Phase 3 fine-tunes to close whatever that gap turns out to be. Can't train without the Phase 1 foundation (can't run the eval suite to generate training pairs).

5. **Phase 4 proves:** Phase 3 model is ready. Phase 4 surfaces it live with transparency. This is the **public proof** and **Fly GACA integration anchor**.

---

## Success Criteria

> These are the conditions each phase must satisfy to be called done. **None of the
> measured ones are satisfied yet** — treat every box below as outstanding unless it is
> ticked, and treat every number as a target rather than an observation.

**End of Phase 1:**
- [x] Arabic eval cases written with real `citesPart` assertions
- [ ] All 138 eval cases pass
- [ ] Arabic recall@5 clears its threshold
- [ ] English recall holds; no regression

**End of Phase 2:**
- [ ] Ablation report generated from a real run
- [ ] Production config decided from those numbers
- [ ] Memory footprint measured at the chosen dimension
- [ ] Latency measured and acceptable for the agentic loop

**End of Phase 3:**
- [x] Training pairs exported (66 pairs from 99 annotated cases)
- [ ] Fine-tuned model trained and weights published to the Hub
- [ ] Arabic recall@5 clears its threshold
- [ ] Arabic citation accuracy clears its threshold
- [ ] No English regression

**End of Phase 4:**
- [x] Gradio app written (`src/gradio_app.py`) and a Space exists
- [ ] Space verified running with the real retrieval stack wired in
- [ ] Arabic → English retrieval demonstrated end to end
- [ ] Latency & citation transparency visible in the UI
- [ ] A/B comparison quantifies the fine-tuning benefit *(needs a fine-tuned model)*
- [ ] Shared with Fly GACA for integration planning

---

## Files & Specs

All specifications are in `docs/`:

| Document | Phase | Purpose |
|----------|-------|---------|
| `hugging-face-plan.md` | Overview | Diagnosis + 4-phase strategy |
| `phase-0-hf-fixes.md` | 0 | Broken HF repos, full fix specs |
| `phase-1-binary-index-format.md` | 1 | Binary format, loader, benchmarks |
| `phase-1-hf-jobs-build.md` | 1 | Corpus embedding via HF Jobs |
| `phase-1-async-tool-loop.md` | 1 | Async tool dispatch, hybrid fallback |
| `phase-1-in-kingdom-tei.md` | 1 | In-Kingdom TEI deployment (PDPL) |
| `phase-2-retrieval-metrics.md` | 2 | Ablations, metrics, decision gates |
| `phase-3-fine-tuned-embedder.md` | 3 | Training pipeline, expected lift |
| `phase-4-public-hf-surface.md` | 4 | Gradio app, Spaces deployment |

---

## Key Decisions

1. **Model choice:** Qwen3-Embedding-0.6B (100+ language coverage, instruction-aware, competitive recall, open-source)
   - Alternative rejected: BGE-M3 (no Arabic support announced)

2. **Dimension:** Ship 512-d by default (MRL truncation)
   - Saves 50% memory (97 MB resident)
   - Loses <3% recall vs. 1024-d
   - Runtime truncation is possible if needed

3. **Query embedding:** In-Kingdom TEI (Cloud Run KSA)
   - Corpus embedding on HF Jobs (public, no region constraint)
   - Split keeps query data (personal, PDPL-regulated) in-Kingdom while using cheap GPU for corpus

4. **Reranker:** Alibaba-NLP/gte-multilingual-reranker-base
   - Cross-encoder, multilingual, ~6-7% recall lift
   - Latency acceptable (~200ms) in the context of agentic loop (10s timeout)

5. **Fine-tuning:** Only the embedder, not the reranker or BM25
   - Embedding is the bottleneck for cross-lingual retrieval
   - Fine-tuning on 138 GACAR pairs is enough to unlock domain gap
   - Reranker already multilingual; less to gain there

---

## Dependency Chain

```
Phase 0 (HF repos)
    ↓
Phase 1a (Arabic cases, binary format)   ┐
Phase 1b (HF Jobs build)                  ├─ (parallel, then join)
Phase 1c (Async loop)                    │
Phase 1d (In-Kingdom TEI)                 ┘
    ↓
Phase 1 eval gate (138 cases pass)
    ↓
Phase 2 (Ablations + metrics)
    ↓
Phase 2 gate (production config decision)
    ↓
Phase 3 (Fine-tune embedder)
    ↓
Phase 3 gate (Arabic recall ≥54%)
    ↓
Phase 4 (Public Spaces demo)
    ↓
Phase 4 gate (live, bilingual, A/B working)
    ↓
Fly GACA integration (server-to-server adoption)
```

---

## Questions & Open Items

- **Phase 0 implementation:** Are HF repo write permissions available, or specs-only approach?
- **Phase 1 parallelism:** Can Arabic cases + binary format + HF Jobs be worked in parallel to compress timeline?
- **Phase 3 training:** Should curriculum learning (hard-example mining after epoch 1) be included, or simple 3-epoch baseline?
- **Phase 4 analytics:** Should usage be logged to external service (e.g., Weights & Biases) or local CSV?

---

## Deployment: Post-Phase 4

After public proof, integrate CaptAdel stack into production:

```
Fly GACA backend
    ├─ captadel-embeddings (in-Kingdom TEI, Cloud Run KSA)
    ├─ captadel-index (binary, from HF Jobs)
    └─ captadel-retriever (retrieve-then-read pipeline)
         │
         └─ answers.pdf / regulations.db (ground truth)
              ↑
        Fly GACA librarians (input)
```

---

## What's Next

- **Immediate:** Implement Phase 0 (HF repo fixes)
- **Aug 25 – Sep 1:** Phase 0 (specs + manual implementation)
- **Sep 2 – Oct 27:** Phase 1 (all 5 components)
- **Oct 28 – Nov 24:** Phase 2 (ablations + decision)
- **Nov 25 – Dec 28:** Phase 3 (fine-tuning + validation)
- **Dec 29 – Jan 25:** Phase 4 (public demo + Fly GACA alignment)
