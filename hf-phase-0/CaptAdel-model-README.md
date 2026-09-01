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

<div align="center">

# ✈️ CaptAdel — Aviation Retrieval Embeddings for GACAR
### Cross-Lingual Semantic Retrieval Model for Saudi Civil Aviation Regulations
#### نموذج التضمين الدلالي لأنظمة ولوائح الطيران المدني السعودي

<p align="center">
  <img src="https://img.shields.io/badge/Made%20in-Saudi%20Arabia-006C35?style=for-the-badge&labelColor=0a0e12" alt="صنع في السعودية" />
  <img src="https://img.shields.io/badge/Base-Qwen3--Embedding--0.6B-C8A04A?style=for-the-badge&labelColor=0a0e12" alt="Base Model" />
  <img src="https://img.shields.io/badge/Context-32k%20Tokens-0D96F6?style=for-the-badge&labelColor=0a0e12" alt="Context Window" />
  <img src="https://img.shields.io/badge/Languages-Arabic%20%26%20English-8E75B2?style=for-the-badge&labelColor=0a0e12" alt="Bilingual" />
</p>

</div>

---

## 🧭 Model Overview

**CaptAdel** is a specialized, bilingual dense retrieval embedding model fine-tuned on the Saudi General Authority of Civil Aviation Regulations (GACAR), Advisory Circulars, Aeronautical Information Publications (AIP), and domain-expert question-answer pairs.

It powers the semantic retrieval backbone of the [Captain Adel AI Flight Instructor](https://captadel.com) and the [FlyGACA Educational Platform](https://flygaca.com).

---

## 🔬 Model Specifications

| Parameter | Specification |
|:---|:---|
| **Base Architecture** | `Qwen/Qwen3-Embedding-0.6B` |
| **Parameters** | 600 Million |
| **Embedding Dimension** | 1024 (Flexible down to 256 / 512 via Matryoshka Representation Learning) |
| **Context Window** | 32,768 Tokens |
| **Supported Languages** | Modern Standard Arabic (MSA), Aviation English, Multilingual |
| **Primary Domain** | Saudi Civil Aviation (GACAR Parts 1 through 183, Saudi AIP) |
| **License** | Apache 2.0 |

---

## ⚡ Usage & Code Examples

### Python with `sentence-transformers`

```python
from sentence_transformers import SentenceTransformer

# Load fine-tuned CaptAdel embedding model
model = SentenceTransformer("flygaca/CaptAdel")

# 1. Embed user query with asymmetric instruction prefix
query = "ما هي متطلبات احتياطي الوقود للرحلات الليلية VFR؟"
query_embedding = model.encode(
    query,
    prompt="Retrieve the official GACAR regulatory passage that answers this aviation question:",
    normalize_embeddings=True
)

# 2. Embed regulatory corpus passages (without instruction prefix)
passages = [
    "GACAR Part 91, §91.151: Fuel requirements for flight in VFR conditions. No person may begin a flight in an airplane under VFR conditions unless there is enough fuel to fly to the first point of intended landing and, assuming normal cruising fuel consumption, at night, to fly after that for at least 45 minutes.",
    "GACAR Part 91, §91.155: Basic VFR weather minima for Class G airspace..."
]
passage_embeddings = model.encode(passages, normalize_embeddings=True)

# 3. Compute cosine similarity
similarities = query_embedding @ passage_embeddings.T
print("Top matching passage index:", similarities.argmax())
```

---

## 📊 Training Data & Optimization

- **Corpus Coverage:** 47,361 chunked regulatory passages across all 74 GACAR Parts.
- **Evaluation Alignment:** Aligned directly with the 138-case [`flygaca/gacar-assistant-evals`](https://huggingface.co/datasets/flygaca/gacar-assistant-evals) benchmark.
- **Hard Negative Mining:** Hard negatives mined from BM25 false positives and cross-part regulatory ambiguities.
- **Loss Function:** Multi-task Matryoshka MultipleNegativesRankingLoss with asymmetric query instruction prefixes.

---

## 🛡️ Citation & Reference

```bibtex
@model{flygaca2026captadel,
  title={CaptAdel: Cross-Lingual Regulatory Retrieval Embeddings for Saudi Civil Aviation},
  author={FlyGACA Research Team},
  year={2026},
  publisher={Hugging Face},
  url={https://huggingface.co/flygaca/CaptAdel}
}
```

---

<div align="center">

<sub>🇸🇦 صنع في السعودية · Made in Saudi Arabia</sub>

</div>
