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
#### مدرّب الطيران الذكي لأنظمة الطيران المدني السعودي (GACAR & Saudi AIP)

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
  <img src="https://img.shields.io/badge/Embeddings-BGE--M3%20%7C%20CaptAdel-FF6B00?style=flat-square&labelColor=0a0e12" alt="Embeddings" />
  <img src="https://img.shields.io/badge/Streaming-SSE%20POST-006C35?style=flat-square&labelColor=0a0e12" alt="SSE Streaming" />
</p>

[**🌐 Try Live on captadel.com**](https://captadel.com) · [**⚡ Quickstart**](#-quickstart) · [**🧠 How It Works**](#-how-it-works--rag-architecture) · [**📡 API Reference**](#-api-specification) · [**🔬 Evaluation Suite**](#-evaluation-benchmark-138-cases)

</div>

---

> [!IMPORTANT]
> **Independent Educational Service.** Captain Adel is an independent AI flight instructor and is not affiliated with, endorsed by, or operated by GACA. All answers cite official GACAR sections for study and training purposes. Flight crew and operators must always verify critical decisions against official publications at [gaca.gov.sa](https://gaca.gov.sa).
>
> **مدرّب طيران تعليمي مستقل.** كابتن عادل مبادرة تعليمية مستقلة غير تابعة للهيئة العامة للطيران المدني. جميع الإجابات تُرفق بالأرقام المرجعية للوائح GACAR لأغراض الدراسة والتدريب فقط.

---

## 🎯 The "Cite or Refuse" Doctrine

Standard large language models hallucinate fictional aviation regulations, invent non-existent FAR/GACAR section numbers, and provide confidently incorrect numbers. **Captain Adel operates under a zero-tolerance grounding contract**:

```
                       ┌───────────────────────────────────────┐
                       │        Pilot Aviation Query           │
                       └──────────────────┬────────────────────┘
                                          │
                                          ▼
                       ┌───────────────────────────────────────┐
                       │     Language Router & Query Rewriter   │
                       │    (Detects EN/AR, Resolves Anaphora) │
                       └──────────────────┬────────────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
        ┌─────────────────────────┐               ┌─────────────────────────┐
        │  Dense Semantic Search  │               │   Lexical BM25 Search   │
        │  (BGE-M3 / CaptAdel)    │               │   (GACAR Token Inverted)│
        └────────────┬────────────┘               └────────────┬────────────┘
                     │                                         │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                       ┌───────────────────────────────────────┐
                       │      Reciprocal Rank Fusion (RRF)     │
                       │   Combines Top-K Grounded Passages    │
                       └──────────────────┬────────────────────┘
                                          │
                                          ▼
                       ┌───────────────────────────────────────┐
                       │  Grounding Verifier & LLM Generation   │
                       │  • English: Gemini 2.0 / 2.5 Flash    │
                       │  • Arabic: In-Kingdom ALLaM / Jais    │
                       └──────────────────┬────────────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     │                                         │
         [Corpus Contains Proof]                    [Insufficient Grounding]
                     │                                         │
                     ▼                                         ▼
        ┌─────────────────────────┐               ┌─────────────────────────┐
        │   Verbatim Citing Turn  │               │    Explicit Refusal     │
        │  "Under GACAR §91.155…" │               │  "I cannot find this in │
        │  kind: "grounded"       │               │   GACAR regulations."   │
        │  Exact URL Anchors      │               │   kind: "refusal"       │
        └─────────────────────────┘               └─────────────────────────┘
```

1. **Exact Retrieval:** Retrieves actual regulatory text across 74 GACAR Parts and the Saudi AIP.
2. **Strict Grounding:** Answers *only* from verified passages, citing the exact Part and section (`§91.155`).
3. **Honest Refusals:** When retrieval fails to prove a claim, Captain Adel refuses rather than guesses.
4. **Bilingual Routing:** English queries route to Gemini with sub-second SSE streaming; Arabic queries route to Saudi in-Kingdom Arabic LLMs (ALLaM).
5. **No POH Substitution:** Refuses to guess aircraft-specific limits (e.g. V-speeds, weight & balance limits) and directs the pilot to the specific Aircraft Flight Manual (AFM).

---

## ⚡ Quickstart

### Prerequisites
- **Node.js ≥ 20.x**
- **npm ≥ 10.x**
- **Gemini API Key** (or self-hosted ALLaM endpoint)

### 1. Installation
```bash
git clone https://github.com/ay2m/Captain-Adel.git
cd Captain-Adel
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY
```

### 3. Start the Server
```bash
npm start
# 🚀 Server listening at http://localhost:8787
```

### 4. Query the API (Synchronous JSON)
```bash
curl -X POST http://localhost:8787/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"What are the basic VFR weather minima in Class G airspace?"}'
```

### 5. Query the API (Real-Time SSE Streaming)
```bash
curl -N -X POST http://localhost:8787/v1/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"message":"What are the fuel reserve requirements for VFR flight at night?"}'
```

---

## 📡 API Specification

### Endpoint: `POST /v1/chat`

#### Request Body
```json
{
  "message": "What is the minimum flight altitude over congested areas in Saudi Arabia?",
  "history": [
    {"role": "user", "content": "Hello Captain"},
    {"role": "assistant", "content": "Welcome aboard! How can I assist you with GACAR regulations?"}
  ],
  "session": "session-unique-id",
  "temperature": 0.2
}
```

#### Response Body
```json
{
  "answer": "Under GACAR Part 91, §91.119(b), over any congested area of a city, town, or settlement, or over any open-air assembly of persons, an aircraft must operate at an altitude of at least 1,000 feet above the highest obstacle within a horizontal radius of 2,000 feet of the aircraft.",
  "sources": [
    {
      "citation": "GACAR Part 91, §91.119",
      "title": "Minimum Safe Altitudes: General",
      "url": "https://flygaca.com/library/gacar-part-91#91.119"
    }
  ],
  "kind": "grounded",
  "suggestions": [
    "What are the minimum safe altitudes over non-congested areas?",
    "What are the emergency landing exceptions under §91.119?"
  ],
  "meta": {
    "provider": "gemini",
    "model": "gemini-2.0-flash",
    "latencyMs": 412,
    "tokens": {
      "prompt": 1240,
      "completion": 86
    }
  }
}
```

---

## 🔬 Evaluation Benchmark (138 Cases)

Captain Adel includes a benchmark suite of **138 evaluation test cases** covering 31 GACAR Parts and the Saudi AIP:

- **Bilingual Coverage:** 69 English + 69 Arabic test cases.
- **Assertion Engine:** Verifies regex citation matches, must-include keywords, refusal correctness, and source attribution.
- **Faithfulness LLM Judge:** Optional secondary judge verifying per-claim attribution.
- **Open Dataset:** Published on Hugging Face at [`flygaca/gacar-assistant-evals`](https://huggingface.co/datasets/flygaca/gacar-assistant-evals).

### Running Evaluations Locally
```bash
# Run dry structure check (safe for CI without API keys)
npm run eval:dry

# Run full evaluation on Gemini
npm run eval

# Run Arabic ALLaM parity evaluation gate
npm run eval:parity

# Run with LLM faithfulness judge
npm run eval:faithfulness
```

---

## 🧪 Testing & Validation

```bash
# Run all 501 unit and integration test assertions
npm test

# Test SSE streaming protocol and fixture playback
npm run test:stream

# Validate cross-repo family contract parity
npm run test:family-contract
```

---

## 🐳 Docker Deployment

```bash
# Build the production container
docker build -t flygaca/captain-adel:latest .

# Run with environment variables
docker run -d -p 8787:8787 \
  -e GEMINI_API_KEY="your_api_key_here" \
  --name captain-adel \
  flygaca/captain-adel:latest
```

---

## 🛡️ License

Released under the **MIT License**.

---

<div align="center">

<sub>🇸🇦 صنع في السعودية · Made in Saudi Arabia</sub>

</div>
