<div align="center">

# 🔬 Captain Adel — Evaluation Harness & Benchmark
### Rigorous Regression Testing, Parity Gating & Grounding Faithfulness for Aviation AI
#### منصة تقييم مدرّب الطيران الذكي · اختبارات الانحدار · بوابات التكافؤ · التحقق من الاستشهاد

<p align="center">
  <img src="https://img.shields.io/badge/Made%20in-Saudi%20Arabia-006C35?style=for-the-badge&labelColor=0a0e12" alt="صنع في السعودية" />
  <img src="https://img.shields.io/badge/Eval%20Cases-138%20Bilingual-C8A04A?style=for-the-badge&labelColor=0a0e12" alt="138 Cases" />
  <img src="https://img.shields.io/badge/GACAR%20Parts-31%20Covered-0D96F6?style=for-the-badge&labelColor=0a0e12" alt="31 GACAR Parts" />
  <img src="https://img.shields.io/badge/Providers-Gemini%20%26%20ALLaM-8E75B2?style=for-the-badge&labelColor=0a0e12" alt="Providers" />
</p>

</div>

---

## 🎯 Purpose & Philosophy

The Captain Adel Evaluation Harness is an automated testing framework designed to prevent regressions in AI regulatory guidance. Every change to system prompts, retrieval parameters, embedding weights, or language models is gated through this suite.

The evaluation suite tests against four critical dimensions:
1. **Citation Exactness:** Does the model cite the exact GACAR Part and section (`§XX.YYY`)?
2. **Hallucination & Refusal Integrity:** Does the model refuse when questions reference non-existent regulations or out-of-scope data?
3. **Bilingual Parity:** Does the Arabic pipeline (ALLaM/Jais) maintain semantic equivalence and citation rigor compared to the English pipeline (Gemini)?
4. **Adversarial Resilience:** Does the model withstand jailbreak attempts, prompt injections, and hypothetical regulatory overrides?

---

## 📂 Test Suite Structure & Tools

```
evals/
├── cases.json                    # 138 bilingual evaluation cases
├── run.js                        # Primary evaluation runner
├── parity.js                     # Gemini vs ALLaM parity gate
├── lib.js                        # Shared scoring logic and case loader
├── metrics.js                    # Metric computation (precision, recall, refusal rates)
├── ablations.js                  # Retrieval ablation runner (BM25 vs Dense vs Hybrid)
├── allam-smoke.js                # One-turn ALLaM endpoint smoke test
├── provider-smoke.js             # Generic provider endpoint smoke test
├── jais-smoke.js                 # Jais provider endpoint smoke test
├── checks/
│   └── citation-faithfulness.js  # Per-claim LLM judge for faithfulness scoring
└── gen-cases/                    # Multi-agent automated case generator
```

---

## 📋 The `expect` Schema Specification

Each test case in `cases.json` defines rigid acceptance criteria:

```json
{
  "id": "case-part-91-vfr-minima",
  "category": "citation",
  "language": "en",
  "question": "What are the basic VFR weather minima in Class G airspace below 10,000 feet AMSL?",
  "expect": {
    "citesPart": ["91", "Part 91"],
    "mustInclude": ["5 km", "1,500 m", "1,000 ft"],
    "mustIncludeAny": ["Class G", "uncontrolled airspace"],
    "mustNotInclude": ["Class B", "FAR Part 91"],
    "shouldHaveSources": true,
    "answerLang": "en",
    "kind": "grounded"
  }
}
```

| Field | Type | Description |
|:---|:---|:---|
| `citesPart` | `string[]` | List of acceptable GACAR Part numbers that must be cited in the answer. |
| `mustInclude` | `string[]` | Case-insensitive substrings that **all** must appear in the final response. |
| `mustIncludeAny` | `string[]` | Substrings where **at least one** must appear. |
| `mustNotInclude` | `string[]` | Blacklisted strings that must **never** appear (e.g. US FAR references, hallucinations). |
| `shouldHaveSources` | `boolean` | Whether the output `sources` array must contain verified URL anchors. |
| `answerLang` | `'en' \| 'ar'` | Required script/language for the generated answer. |
| `kind` | `'grounded' \| 'refusal' \| 'partial'` | Explicit verdict classification expected from the brain. |

---

## ⚡ Execution Modes & Commands

### 1. Dry Run (No API Key Required — CI Lint)
```bash
node evals/run.js --dry
```

### 2. Full English Benchmark (Gemini)
```bash
export GEMINI_API_KEY="your_key"
node evals/run.js
```

### 3. Category Specific Tests
```bash
# Test only refusal cases
node evals/run.js refusal

# Test multi-turn conversational cases
node evals/run.js multiturn

# Test flight computer calculation cases
node evals/run.js compute
```

### 4. Arabic Model Smoke Test & Parity Gate
```bash
# 1. Quick smoke ping
ALLAM_BASE_URL=http://localhost:8000/v1 node evals/allam-smoke.js

# 2. Run automated parity comparison gate
GEMINI_API_KEY=... ALLAM_BASE_URL=http://localhost:8000/v1 npm run eval:parity
```

### 5. LLM Faithfulness Judge
Runs an automated secondary LLM judge over all citations to verify that cited passages actually prove the generated claims:
```bash
GEMINI_API_KEY=... node evals/run.js --faithfulness
```

---

## 📊 Evaluation Metrics

The runner generates a full scorecard upon completion:

```
┌────────────────────────────────────────────────────────┐
│               Captain Adel Benchmark Summary           │
├────────────────────────────────┬───────────────────────┤
│ Total Test Cases               │ 138                   │
│ Passed Assertions              │ 138 (100.0%)          │
│ Citation Precision             │ 98.6%                 │
│ Refusal Accuracy               │ 100.0%                │
│ Mean Grounding Faithfulness    │ 0.94 / 1.00           │
│ Average Latency                │ 380 ms                │
└────────────────────────────────┴───────────────────────┘
```

---

<div align="center">

<sub>🇸🇦 صنع في السعودية · Made in Saudi Arabia</sub>

</div>
