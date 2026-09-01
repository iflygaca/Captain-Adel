---
annotations_creators:
  - expert-generated
language:
  - ar
  - en
license: apache-2.0
multilinguality:
  - multilingual
pretty_name: GACAR Assistant Evaluation Benchmark
size_categories:
  - n<1K
source_datasets:
  - original
tags:
  - aviation
  - gacar
  - saudi-arabia
  - rag
  - grounding
  - bilingual
  - evaluation
task_categories:
  - question-answering
task_ids:
  - closed-domain-qa
  - qa
---

<div align="center">

# 📊 GACAR Assistant Evaluation Benchmark (`gacar-assistant-evals`)
### Standardized Bilingual Grounding & Refusal Benchmark for Saudi Civil Aviation AI
#### مجموعة بيانات تقييم الذكاء الاصطناعي لأنظمة الطيران المدني السعودي

<p align="center">
  <img src="https://img.shields.io/badge/Made%20in-Saudi%20Arabia-006C35?style=for-the-badge&labelColor=0a0e12" alt="صنع في السعودية" />
  <img src="https://img.shields.io/badge/Cases-138%20Bilingual-C8A04A?style=for-the-badge&labelColor=0a0e12" alt="138 Cases" />
  <img src="https://img.shields.io/badge/Coverage-31%20GACAR%20Parts-0D96F6?style=for-the-badge&labelColor=0a0e12" alt="31 GACAR Parts" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-8E75B2?style=for-the-badge&labelColor=0a0e12" alt="Apache 2.0" />
</p>

</div>

---

## 🧭 Dataset Summary

The **GACAR Assistant Evaluation Benchmark** is a curated, bilingual evaluation dataset designed to measure the grounding accuracy, citation fidelity, and refusal compliance of LLMs in Saudi civil aviation.

It covers critical flight operations, pilot licensing, aircraft maintenance, airspace classifications, and flight academy standards under the **General Authority of Civil Aviation (GACA)**.

---

## 📋 Dataset Schema & Structure

```json
{
  "id": "case-gacar-91-155-vfr-minima",
  "category": "citation",
  "language": "en",
  "question": "What are the basic VFR weather minima in Class G airspace below 10,000 feet AMSL?",
  "expected_answer": "Under GACAR Part 91, §91.155, the basic VFR weather minima in Class G airspace require 5 km flight visibility and cloud clearance of 1,500 m horizontal and 1,000 ft vertical.",
  "cites_part": ["91"],
  "must_include": ["5 km", "1,500 m", "1,000 ft"],
  "must_not_include": ["FAR Part 91", "Class B"],
  "answer_lang": "en",
  "kind": "grounded"
}
```

| Field | Type | Description |
|:---|:---|:---|
| `id` | `string` | Unique identifier for the benchmark case. |
| `category` | `string` | Evaluation category: `citation`, `refusal`, `multiturn`, `compute`, or `injection`. |
| `language` | `string` | Primary query language: `en` (English) or `ar` (Arabic). |
| `question` | `string` | Pilot aviation query. |
| `expected_answer` | `string` | Reference grounded answer verified by flight instructors. |
| `cites_part` | `list[string]` | Acceptable GACAR Part numbers that must be cited. |
| `must_include` | `list[string]` | Critical keywords and numerical constraints that must appear. |
| `must_not_include`| `list[string]` | Blacklisted phrases and hallucinations. |
| `kind` | `string` | Expected grounding classification (`grounded`, `refusal`, `partial`). |

---

## ⚡ Usage with Hugging Face `datasets`

```python
from datasets import load_dataset

# Load evaluation cases
dataset = load_dataset("flygaca/gacar-assistant-evals", split="train")

print(f"Total benchmark cases: {len(dataset)}")
sample = dataset[0]
print("Question:", sample["question"])
print("Expected Part Citation:", sample["cites_part"])
```

---

## 🛡️ Citation

```bibtex
@dataset{flygaca2026gacar_evals,
  title={GACAR Assistant Evaluation Benchmark: Bilingual Grounding Evaluation for Saudi Aviation},
  author={FlyGACA},
  year={2026},
  publisher={Hugging Face},
  url={https://huggingface.co/datasets/flygaca/gacar-assistant-evals}
}
```

---

<div align="center">

<sub>🇸🇦 صنع في السعودية · Made in Saudi Arabia</sub>

</div>
