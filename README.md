---
title: Captain Adel AI Flight Instructor
emoji: ✈️
colorFrom: yellow
colorTo: blue
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
license: mit
short_description: Grounded Saudi Civil Aviation (GACAR & AIP) AI Flight Instructor
---

<div align="center">

<img src="public/assets/img/captain/avatar.png" alt="Captain Adel Avatar" width="128" />

# 🤖 Captain Adel (كابتن عادل)
### The AI Flight Instructor That Refuses to Guess
#### مدرّب الطيران الذكي لأنظمة الطيران المدني السعودي (GACAR)

<p align="center">
  <img src="https://img.shields.io/badge/Made%20in-Saudi%20Arabia-006C35?style=for-the-badge&labelColor=0a0e12" alt="صنع في السعودية" />
  <a href="https://github.com/ay2m/Captain-Adel/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ay2m/Captain-Adel/ci.yml?style=for-the-badge&label=CI&labelColor=0a0e12&color=006C35" alt="CI" /></a>
  <img src="https://img.shields.io/badge/tests-501%20passing-C8A04A?style=for-the-badge&labelColor=0a0e12" alt="501 tests" />
  <a href="https://captadel.com"><img src="https://img.shields.io/badge/live-captadel.com-0D96F6?style=for-the-badge&labelColor=0a0e12" alt="captadel.com" /></a>
  <a href="https://huggingface.co/spaces/flygaca/captain-adel"><img src="https://img.shields.io/badge/%F0%9F%A4%97-Hugging%20Face%20Space-8E75B2?style=for-the-badge&labelColor=0a0e12" alt="Hugging Face Space" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20-5FA04E?style=flat-square&logo=node.js&logoColor=white&labelColor=0a0e12" alt="Node.js 20" />
  <img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white&labelColor=0a0e12" alt="Express 5" />
  <img src="https://img.shields.io/badge/RAG-Hybrid%20Dense%2BBM25-3178C6?style=flat-square&labelColor=0a0e12" alt="Hybrid RAG" />
  <img src="https://img.shields.io/badge/Models-Gemini%20%7C%20ALLaM-8E75B2?style=flat-square&labelColor=0a0e12" alt="Gemini & ALLaM" />
  <img src="https://img.shields.io/badge/Embeddings-BGE--M3-FF6B00?style=flat-square&labelColor=0a0e12" alt="BGE-M3" />
</p>

[**🌐 Try Live on captadel.com**](https://captadel.com) · [**⚡ Quickstart**](#-quickstart) · [**🧠 Architecture**](#-how-it-works) · [**🔬 Hugging Face Evals**](#-evaluation-benchmark-138-cases)

</div>

---

> [!IMPORTANT]
> **Independent & Educational.** Captain Adel is an independent AI flight instructor and is not affiliated with, endorsed by, or operated by GACA. All answers cite official GACAR sections for study purposes. Always verify flight decisions against official GACA publications at [gaca.gov.sa](https://gaca.gov.sa).

---

## 🎯 The "Cite or Refuse" Philosophy

Ask a typical LLM about Saudi aviation regulations and it will hallucinate fictional section numbers. **Captain Adel operates differently**:

1. **Exact Retrieval:** Retrieves actual regulatory text across 74 GACAR Parts and Saudi AIP.
2. **Strict Grounding:** Answers *only* from verified passages, citing the exact Part and section (`§91.155`).
3. **Honest Refusals:** When retrieval fails to support a claim, Captain Adel refuses rather than guesses.
4. **Bilingual Routing:** English queries route to Gemini with SSE streaming; Arabic queries route to in-Kingdom Arabic LLMs (ALLaM).

---

## ⚡ Quickstart

### 1. Installation
```bash
git clone https://github.com/ay2m/Captain-Adel.git
cd Captain-Adel
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Set your GEMINI_API_KEY in .env
```

### 3. Start the Server
```bash
npm start
# 🚀 Server listening at http://localhost:8787
```

### 4. Query the API
```bash
curl -X POST http://localhost:8787/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"What are the basic VFR weather minima in Class G airspace?"}'
```

<details>
<summary><b>View Response Payload</b></summary>

```json
{
  "answer": "Under GACAR Part 91, §91.155, the basic VFR weather minima in Class G airspace below 10,000 ft AMSL require 5 km flight visibility...",
  "sources": [
    {
      "citation": "GACAR Part 91, §91.155",
      "title": "Basic VFR Weather Minima",
      "url": "https://flygaca.com/library/gacar-part-91#91.155"
    }
  ],
  "kind": "grounded",
  "suggestions": [
    "What are the night VFR fuel reserve requirements in Saudi Arabia?",
    "How does GACAR define Class G cloud clearance?"
  ],
  "meta": {
    "provider": "gemini",
    "model": "gemini-2.0-flash",
    "toolCalls": []
  }
}
```

</details>

---

## 🔬 Evaluation Benchmark (138 Cases)

Captain Adel ships with **138 rigorous evaluation test cases** covering 31 GACAR Parts and Saudi AIP:

- **Bilingual Coverage:** 69 English + 69 Arabic test cases.
- **Strict Grading:** Tests citation accuracy, hallucination resistance, refusal compliance, and math accuracy.
- **Open Dataset:** Published on Hugging Face at [`flygaca/gacar-assistant-evals`](https://huggingface.co/datasets/flygaca/gacar-assistant-evals).

Run evals locally:
```bash
npm run evals
```

---

## 🧪 Testing & Validation

```bash
# Run all 501 test assertions
npm test

# Test SSE streaming endpoint
npm run test:stream
```

---

## 🛡️ License

Software licensed under the **MIT License**.
