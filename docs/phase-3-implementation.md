# Phase 3: Implementation Guide

> [!WARNING]
> **Every metric in this guide is a target or a placeholder — none are measured.** No
> ablation has run (`src/brain/_embeddings.bin` does not exist, so there is no dense
> index) and no embedder has been fine-tuned. The "baseline" figures quoted below
> originate in the template blocks of
> [`phase-2-retrieval-metrics.md`](phase-2-retrieval-metrics.md) and are illustrative.
> Do not quote any figure from this file as a baseline or a result, and do not copy them
> into the README, a model card or a dataset card.
>
> **Naming:** `scripts/finetune-embedder.py` defaults `HUB_MODEL_ID` to
> `flygaca/CaptAdel-finetuned`, which does not exist on the Hub. The model repo that
> does exist is [`flygaca/CaptAdel`](https://huggingface.co/flygaca/CaptAdel) (no weights
> published yet). Commands below use the script's current default; decide which name is
> canonical before the first push.

**Goal:** Fine-tune Qwen3-Embedding-0.6B on GACAR-specific retrieval tasks to improve Arabic recall@5. The starting point and the achievable gain are both unknown until Phase 2 produces a real baseline.

---

## Step 1: Prepare eval cases with ground-truth chunks

The `export-training-pairs.py` script mines training data from `evals/cases.json`, but it requires each case to have a `groundTruthChunks` field listing the chunk IDs that should be retrieved for that question.

### Option A: Manual annotation (slow, precise)

For the most important cases, manually add `groundTruthChunks`:

```json
{
  "id": "vfr-weather-minima",
  "category": "citation",
  "question": "What are the basic VFR weather minimums for uncontrolled airspace by day?",
  "groundTruthChunks": ["00123", "00124", "00125"],
  "expect": {
    "citesPart": ["91"],
    "mustInclude": ["visibility"],
    "shouldHaveSources": true
  }
}
```

**Where to find chunk IDs:**
1. Run `npm start` to start the server
2. Make a request to `/v1/chat` with the question
3. Look at the `sources` array in the response — each source has a chunk ID or position
4. Add those IDs to `groundTruthChunks`

### Option B: BM25 retrieval mining (fast, heuristic)

```python
# Pseudo-code: for each case, run BM25 retrieval
# and assume the top-3 hits are ground truth.
# Works well for straightforward questions.

for case in cases:
  hits = bm25.search_library(case['question'], top_k=5)
  case['groundTruthChunks'] = [h['chunk_id'] for h in hits[:3]]
```

### Option C: Hybrid approach (recommended)

1. Start with BM25-mined chunks for all cases
2. Manually verify/correct for the hardest 25 cases (Arabic cross-lingual, multi-Part)
3. Use semi-automated approach for remaining cases

---

## Step 2: Export training pairs

Once `evals/cases.json` has `groundTruthChunks` for ~100+ cases:

```bash
# Export contrastive pairs from eval cases
python scripts/export-training-pairs.py

# Output: evals/training-pairs.jsonl (~100 pairs, one per line)
```

**Output format (JSONL):**

```jsonl
{
  "query": "What are the basic VFR weather minimums?",
  "query_lang": "en",
  "positive": [{"text": "...", "chunk_id": "00123", "part": 91, "section": 155}],
  "negative": [
    {"text": "...", "chunk_id": "00124", "part": 91, "section": 121, "reason": "same_part_wrong_section"},
    {"text": "...", "chunk_id": "03401", "part": 135, "section": 401, "reason": "wrong_part"}
  ],
  "eval_case_id": "vfr-weather-minima",
  "difficulty": "easy"
}
```

**Verification:**

```bash
# Count pairs
wc -l evals/training-pairs.jsonl

# Check structure
head -1 evals/training-pairs.jsonl | jq .
```

---

## Step 3: Set up training environment

```bash
# Install training dependencies
pip install sentence-transformers accelerate wandb torch

# Optional: authenticate with Hugging Face
huggingface-cli login  # Requires HF_TOKEN

# Optional: set up Weights & Biases for experiment tracking
wandb login  # Requires WANDB_API_KEY
```

---

## Step 4: Run fine-tuning

```bash
# Local GPU training (recommended for M1/M2 Mac or CUDA GPU)
EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-0.6B \
EMBED_DIMS=1024 \
EPOCHS=3 \
BATCH_SIZE=32 \
LEARNING_RATE=2e-5 \
HF_TOKEN=hf_xxx \
  python scripts/finetune-embedder.py
```

**Configuration tuning:**

| Setting | Default | Notes |
|---|---|---|
| `EPOCHS` | 3 | Increase to 5 if training loss still decreasing at epoch 3 |
| `BATCH_SIZE` | 32 | Reduce to 16 if OOM on GPU; increase to 64 if GPU memory available |
| `LEARNING_RATE` | 2e-5 | Lower (1e-5) if loss is noisy; higher (5e-5) if convergence is slow |
| `EMBED_DIMS` | 1024 | Set to 512 for MRL (Matryoshka Representation Learning) truncation |

**Expected training progression** — 🧪 *illustrative console output; the loss curve and
the MRR@5 value are invented, showing only what a healthy run looks like:*

```
Epoch 1/3, Step 10: loss=0.45          # ← EXAMPLE, NUMBERS ARE PLACEHOLDERS
Epoch 1/3, Step 20: loss=0.38
Epoch 1/3, Step 30: loss=0.32
Epoch 2/3, Step 10: loss=0.28
Epoch 2/3, Step 20: loss=0.24
...
[MRR@5: 0.562]  # Test set metric
```

**Outputs:**

- `checkpoints/captadel-finetuned/`: Local checkpoint (best epoch saved)
- `flygaca/CaptAdel-finetuned` on Hub: Uploaded model (if `HF_TOKEN` set)

---

## Step 5: Validate: Re-run Phase 2 ablations

Once the fine-tuned model is on Hub:

```bash
# Test with fine-tuned embedder
EMBEDDINGS_MODEL="${HUB_MODEL_ID:-flygaca/CaptAdel-finetuned}" \
EMBED_DIMS=1024 \
  node evals/ablations.js
```

**Hypothesised improvements (Arabic recall@5):**

> [!CAUTION]
> 🧪 **Template — both columns are invented.** The "Baseline (Phase 2)" column is *not a
> baseline*: those values come from the placeholder tables in
> `phase-2-retrieval-metrics.md` and were never measured. The "Fine-tuned" column is a
> guess relative to a guess, so every Δ is meaningless until both sides are real. This
> table shows the shape of the A/B comparison, nothing more.

| Config | "Baseline (Phase 2)" *(placeholder)* | "Fine-tuned" *(guess)* | Δ *(meaningless)* |
|---|---|---|---|
| Dense-512d-no-rerank | 36% | 44–48% | +8–12% |
| Dense-512d-with-rerank | 42% | 50–56% | +8–14% |
| Hybrid-RRF-512d-rerank | 44% | 54–60% | +10–16% |

---

## Step 6: Ship decision gates

Phase 3 is complete when:

- [x] Training pairs exported — `evals/training-pairs.jsonl`, **66 pairs** from 99
      annotated cases (39 Arabic-only cases returned no BM25 hits)
- [ ] Fine-tuning converged (MRR@5 ≥ 0.55 on held-out test set)
- [ ] Weights published to the Hub
- [ ] Phase 2 ablations re-run with the fine-tuned embedder
- [ ] Arabic recall@5 clears its threshold
- [ ] English recall shows no regression
- [ ] Arabic citation accuracy clears its threshold

The last three were written as "≥ X (was Y baseline)", and every Y traces to a
placeholder. **Set these thresholds from the real Phase 2 numbers once those exist**,
then treat them as the gate.

---

## Troubleshooting

### "No training pairs found"

→ Add `groundTruthChunks` to eval cases first (Step 1)

### Training loss stuck or diverging

→ Reduce `LEARNING_RATE` to 1e-5, or use warm-up by increasing `WARMUP_STEPS`

### MRR@5 < 0.50

→ Check that positive chunks are actually in the training data
→ Verify that BM25-mined chunks are correct (Option B validation)

### GPU out of memory (OOM)

→ Reduce `BATCH_SIZE` to 16 or 8
→ Reduce `EPOCHS` for a quick test

### Model won't push to Hub

→ Check `HF_TOKEN` is set: `echo $HF_TOKEN`
→ Verify token has write access: https://huggingface.co/settings/tokens

---

## Next: Phase 4 — Public HF proof surface

Once fine-tuned embedder is validated:

```bash
npm run build:embeddings  # Rebuild dense index with new embedder
npm start                  # Verify locally
npm run eval              # Full eval suite check
```

Then Phase 4 builds a public demo on Hugging Face Spaces.

---

## Appendix: Debugging & instrumentation

### Check export output

```bash
python scripts/export-training-pairs.py

# Actual output as of the last run:
# ✅ Exported 66 training pairs
#    EN: 66 | AR: 0
#    Easy: 63 | Medium: 0 | Hard: 3
#    Output: evals/training-pairs.jsonl
```

Note the shape of that result. All 66 pairs are English: the 39 Arabic-only eval cases
score no BM25 hits against an English corpus, so ground-truth mining finds nothing to
annotate them with, and they contribute no pairs. **The training set therefore contains
no Arabic queries at all** — which is a real limitation for a model whose whole purpose
is cross-lingual retrieval. Worth solving (translated queries, manual annotation, or
mining once dense retrieval is live) before reading much into any fine-tuning result.

### Inspect a training pair

```bash
head -1 evals/training-pairs.jsonl | jq '.'
```

### Check fine-tuning checkpoint

```bash
ls -lh checkpoints/captadel-finetuned/
# Should have: config.json, pytorch_model.bin, tokenizer.json, etc.
```

### Load and test locally

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('checkpoints/captadel-finetuned')
# or: model = SentenceTransformer('flygaca/CaptAdel-finetuned')

query = "What are the minimum equipment requirements?"
emb = model.encode(query)
print(f"Embedding shape: {emb.shape}")  # (1024,) or (512,) depending on EMBED_DIMS
```

