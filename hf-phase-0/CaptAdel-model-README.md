---
library_name: sentence-transformers
tags:
  - sentence-transformers
  - feature-extraction
  - sentence-similarity
  - multilingual
  - arabic
  - aviation
  - gacar
  - saudi-arabia
  - rag
  - embeddings
language:
  - ar
  - en
license: apache-2.0
base_model:
  - Qwen/Qwen3-Embedding-0.6B
datasets:
  - flygaca/gacar-assistant-evals
pipeline_tag: feature-extraction
inference: false
model_type: transformer
---

# CaptAdel — Aviation Retrieval Embeddings for GACAR

A multilingual embedding model fine-tuned for retrieving relevant GACAR (General Authority of Civil Aviation Regulations) passages to ground Captain Adel's answers.

## Model Details

- **Base Model:** `Qwen/Qwen3-Embedding-0.6B` (Apache-2.0, 0.6B parameters)
- **Fine-tuned on:** Captain Adel evaluation cases and GACAR corpus
- **Output dimension:** 1024 (truncatable via MRL to 256/512)
- **Languages:** Arabic (MSA), English, 100+ others
- **Context window:** 32k tokens

## Usage

When complete, this model will be deployed as the embedding backbone for Captain Adel's hybrid retrieval pipeline (dense + BM25 reciprocal-rank-fusion).

### Inference with sentence-transformers

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("flygaca/CaptAdel")

# Embedding a question (with instruction)
query = "What is the minimum cruise altitude over Saudi airspace?"
query_embedding = model.encode(
    query,
    prompt="Retrieve the GACAR passage that answers this aviation question:",
    normalize_embeddings=True
)

# Embedding GACAR passages (corpus, no instruction)
passage = "GACAR Part 91, §91.119: The minimum cruise altitude..."
passage_embeddings = model.encode(
    passage,
    normalize_embeddings=True
)
```

## Performance

Evaluation against 113 bilingual test cases (GACAR subset):
- **English recall@5:** TBD (in progress)
- **Arabic recall@5:** TBD (cross-lingual unlock phase)
- **Rerank robustness:** Tested with `Alibaba-NLP/gte-multilingual-reranker-base`

## Training Data

- GACAR corpus: 47,361 chunks across 95 documents
- Evaluation set: 113 grounded Q&A cases in EN+AR
- Hard negatives: Selected from BM25 misses

## Architecture

Based on Qwen3-Embedding-0.6B, with:
- **MRL (Matryoshka Representation Learning):** Output any dimension 32–1024
- **Instruction-aware queries:** Prefix with retrieval task to improve domain specificity
- **Bilingual optimization:** Arabic and English equally weighted

## Licensing

Apache-2.0 — free for research, production, and commercial use.

## Citation

```bibtex
@model{flygaca2026captadel,
  title={CaptAdel — Aviation Retrieval Embeddings for GACAR},
  author={FlyGACA},
  year={2026},
  publisher={Hugging Face},
  url={https://huggingface.co/flygaca/CaptAdel}
}
```

## Related

- **Captain Adel app:** https://captadel.com
- **Fly GACA library:** https://flygaca.com
- **Evaluation dataset:** https://huggingface.co/datasets/flygaca/gacar-assistant-evals
- **Base model:** https://huggingface.co/Qwen/Qwen3-Embedding-0.6B

---

**Status:** This model card is maintained as part of Phase 1 of the [Hugging Face plan](https://github.com/ay2m/Captain-Adel/blob/main/docs/hugging-face-plan.md). Weights will be published when the cross-lingual retrieval unlock is complete.
