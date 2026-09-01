<div align="center">

# 🤖 Multi-Agent Eval-Case Generator
### Automated, Grounded Generation of Rigorous GACAR Benchmark Test Cases
#### توليد حالات التقييم الآلي · التوليد المبني على اللوائح الحقيقية · مراجعة الجودة

<p align="center">
  <img src="https://img.shields.io/badge/Made%20in-Saudi%20Arabia-006C35?style=for-the-badge&labelColor=0a0e12" alt="صنع في السعودية" />
  <img src="https://img.shields.io/badge/Architecture-Lead%2BWorker%20Swarm-C8A04A?style=for-the-badge&labelColor=0a0e12" alt="Swarm" />
  <img src="https://img.shields.io/badge/Validation-Verbatim%20Regex%20Pass-0D96F6?style=for-the-badge&labelColor=0a0e12" alt="Validation" />
  <img src="https://img.shields.io/badge/Language-EN%20%26%20AR%20Mixed-8E75B2?style=for-the-badge&labelColor=0a0e12" alt="Bilingual" />
</p>

</div>

---

## 🎯 Purpose & Overview

The `gen-cases` tool automates the creation of high-quality evaluation cases for [`evals/cases.json`](../cases.json).

Instead of manually drafting hundreds of test cases or relying on ungrounded synthetic prompts, this tool imports Captain Adel's **real retrieval engine** (`src/brain/retrieve.js`) to extract authentic regulatory passages across all 74 GACAR Parts. A hierarchical multi-agent swarm then constructs question-answer-assertion triplets with strict verbatim validation.

```
┌────────────────────────────────────────────────────────┐
│               GACAR Regulatory Corpus Chunks           │
│                   (src/brain/_chunks.json.gz)          │
└───────────────────────────┬────────────────────────────┘
                            │ Real Retrieval
                            ▼
┌────────────────────────────────────────────────────────┐
│             Lead Orchestrator (Sonnet-5)               │
│         Decomposes Part into Thematic Sections         │
└───────────────────────────┬────────────────────────────┘
                            │ Parallel Tasks
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│     Worker Agent 1        │   │     Worker Agent 2        │
│   (Drafts Citations/Q&A)  │   │   (Drafts Refusals/Edges) │
└─────────────┬─────────────┘   └─────────────┬─────────────┘
              │                           │
              └─────────────┬─────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│            Automated Validation & Filter Gate          │
│   • Verifies sourceQuote is exact substring in corpus  │
│   • Verifies citesPart matches regex of target Part    │
│   • Rejects ungrounded claims or hallucinated sections │
└───────────────────────────┬────────────────────────────┘
                            │ Validated Drafts
                            ▼
┌────────────────────────────────────────────────────────┐
│             Human Review & Curation Workflow           │
│        (Manual merge into evals/cases.json)            │
└────────────────────────────────────────────────────────┘
```

---

## ⚡ Execution & Usage

### 1. Setup Environment
```bash
cd evals/gen-cases
npm install
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 2. Generate Drafts
```bash
# Generate 6 English draft cases for GACAR Part 121
node generate.js 121

# Generate 8 mixed-language cases (Arabic & English) for Part 145
node generate.js 145 --count 8 --language mixed

# Pipe validated JSON output directly to a file
node generate.js 91 > drafts/part-91.json
```

---

## 🛡️ Automated Validation Rules

Every generated draft must pass automated programmatic gates before being emitted:

1. **Sub-string Verbatim Verification:** The draft's `sourceQuote` must exist verbatim within the retrieved GACAR chunk. Any worker hallucinating a single word is immediately rejected.
2. **Citation Syntax Check:** The citation string must match the exact regex pattern used by `src/brain/grounding.js` in production (`GACAR Part <N>, §<N>.<M>`).
3. **Category Integrity:** Refusal cases must test realistic traps (e.g. asking for FAA-specific rules or non-existent GACAR sections).

---

## 👨‍✈️ Human Curation Playbook

This tool **never** modifies `evals/cases.json` automatically. The developer workflow is:

1. Run the generator for a targeted GACAR Part.
2. Review the generated JSON array in `drafts/`.
3. Refine `mustInclude` and `mustIncludeAny` keywords to focus on critical aviation safety concepts.
4. Append vetted cases into `evals/cases.json`.
5. Verify suite integrity using `npm run eval:dry` and `npm run eval`.

---

<div align="center">

<sub>🇸🇦 صنع في السعودية · Made in Saudi Arabia</sub>

</div>
