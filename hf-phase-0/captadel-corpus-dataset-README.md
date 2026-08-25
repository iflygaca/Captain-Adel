---
annotations_creators:
  - expert-generated
language:
  - ar
  - en
license: apache-2.0
multilinguality:
  - multilingual
pretty_name: GACAR Assistant Evaluation Cases
size_categories:
  - 1K<n<10K
source_datasets:
  - general-authority-of-civil-aviation-regulations
tags:
  - aviation
  - gacar
  - saudi-arabia
  - rag
  - grounding
  - bilingual
task_categories:
  - question-answering
task_ids:
  - closed-domain-qa
  - qa
---

# GACAR Assistant Evaluation Cases

Evaluation test set for Captain Adel, a retrieval-grounded AI flight instructor for Saudi civil aviation.

## Dataset Summary

This dataset contains 113 test cases in both English and Arabic for evaluating how well the Captain Adel system:
- Retrieves relevant GACAR (General Authority of Civil Aviation Regulations) passages
- Grounds answers in cited regulations
- Refuses when regulations don't cover a topic
- Maintains bilingual parity

## Dataset Structure

Each case includes:
- `question` (str) — User question in English or Arabic
- `expected_answer` (str) — Model's expected answer
- `cites_part` (str or null) — Which GACAR Part should be cited (null if refusal expected)
- `must_include` (list[str]) — Phrases/keywords the answer must contain
- `answer_lang` (str) — Expected response language (`en` or `ar`)
- `kind` (str) — Answer type: `grounded`, `partial`, `refusal`, `na`

## Source

Cases are derived from real user questions to Captain Adel and verified against the GACAR corpus.

## Citation

```bibtex
@dataset{flygaca2026gacar,
  title={GACAR Assistant Evaluation Cases},
  author={FlyGACA and Captain Adel},
  year={2026},
  publisher={Hugging Face},
  url={https://huggingface.co/datasets/flygaca/gacar-assistant-evals}
}
```
