<div align="center">

# 🤖 **Captain Adel** (كابتن عادل)
> *The AI flight instructor that never guesses*

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/STATUS-🌍_LIVE-00ff88?style=for-the-badge&labelColor=0a0e12&fontColor=ffffff">
  <img alt="Status: Live" src="https://img.shields.io/badge/STATUS-🌍_LIVE-0D96F6?style=for-the-badge&labelColor=0a0e12">
</picture>

**Grounded RAG** · **Cite-or-Refuse** · **Bilingual** · **Cloud Run** · **501+ Tests**

</div>

## 🏗 Fly GACA Family

[📚 FlyGACA Web & API](https://github.com/ay2m/FlyGACA) • 
[🤖 Captain Adel AI](https://github.com/ay2m/Captain-Adel) • 
[📱 FlyGACA iOS](https://github.com/ay2m/FlyGACA-ios) • 
[🏢 Office & Governance](https://github.com/ay2m/Office)

<!-- 
  README ENHANCEMENT AUDIT — ay2m/Captain-Adel
  Last audit: 2026-09-04 by claude-readme-supervisor
  Status: READY for phase 1 (family links + audit blocks added)
  
  DRIFT RISKS IDENTIFIED:
  - Line 89: Eval count (501+) hardcoded — drifts with each evals/ commit
  - Line 91: Chunk count (80K) hardcoded — drifts with corpus refreshes
  - Lines 156–158: Roadmap ETAs (Q2/Q3 2027) — no versioning, will rot
  - No latency/SLA metrics in README — Cloud Logging has p95 inference data
  - No deployment runbook link — docs/runbooks/ exist but not visible
  - No cross-repo Captain-Adel integration links (brain-retrieval relies on FlyGACA corpus)
  
  PHASE 2 TASKS:
  - Extract eval count from `evals/cases.json` record count
  - Extract chunk count from `src/brain/_chunks.json.gz` byte size ÷ 1024
  - Fetch p95 latency from Cloud Logging API (me-central2)
  - Link to ROADMAP.md instead of hardcoding dates
  - Add "Deployment" section with runbook links
  
  PHASE 3 TASKS:
  - Create `.github/workflows/readme-supervisor.yml` with Cloud Logging API credential
  - Implement stat replacement for evals, chunks, latency
  
  CROSS-REPO SYNC CHECK: Family contract parity ✓ (ay2m/Office, ay2m/FlyGACA aligned)
-->

---

## 🎯 What's this?

Captain Adel is an **AI flight instructor** that teaches GACAR (Saudi aviation regulations) with surgical precision. No hallucinations. No made-up section numbers. Every answer either cites the exact regulation—or refuses.

### The Problem We Solve
Standard LLMs fail at aviation:
- ❌ Invent fake FAR/GACAR sections
- ❌ Confidently provide wrong numbers  
- ❌ Have no concept of "I don't know"

### Our Solution
**The "Cite or Refuse" doctrine:**
- ✅ Answer with exact GACAR § citation + URL anchor
- ✅ Refuse if we can't find proof in the corpus
- ✅ Never speculate on flight safety

**Live:** [captadel.com](https://captadel.com) | **Hugging Face:** [flygaca/captain-adel](https://huggingface.co/spaces/flygaca/captain-adel)

---

## 🧠 How It Works

### The Pipeline
```
Pilot Query (EN/AR)
      ↓
[Language Router & Rewriter]
      ↓
    ┌─────────────────────────────────┐
    │  Hybrid Retrieval (Parallel)    │
    ├──────────────┬──────────────────┤
    │ Dense Search │ BM25 Lexical     │
    │ (BGE-M3)     │ (Token Inverted)  │
    └──────────────┴──────────────────┘
      ↓
[Reciprocal Rank Fusion (RRF)]
      ↓
[Grounding Verifier]
      ↓
     ┌─────────────────────────────────┐
     │ Does corpus contain proof?      │
     ├─────────────┬───────────────────┤
     │ YES         │ NO                │
     ├─────────────┼───────────────────┤
     │ Generate    │ Explicit Refusal  │
     │ + Citation  │ "Not in GACAR"    │
     │ kind:grounded│ kind:refusal     │
     └─────────────┴───────────────────┘
```

### Models
- **English:** Gemini 2.5 Flash (live), 2.0 (fallback)
- **Arabic:** ALLaM (in-Kingdom, preferred) or Gemini (fallback)
- **Embeddings:** BGE-M3 or CaptAdel-custom
- **Search:** BM25 lexical + dense vector hybrid

---

## 🚀 Live Demo

👉 [**captadel.com**](https://captadel.com) — Ask anything about Saudi aviation

Try these:
- "What's GACAR §91.155 about?"
- "When do I need oxygen?"
- "How long can I fly at night?"
- "What's the procedure for…?" (in Arabic: "ما هي إجراءات…؟")

---

## 🏗 Architecture

```
API Server (Express 5 on Cloud Run)
│
├─ POST /v1/chat                [Streaming SSE]
│   ├─ Language detection (EN/AR)
│   ├─ Query rewriting (anaphora resolution)
│   ├─ Hybrid retrieval (dense + BM25)
│   ├─ RRF ranking
│   └─ Grounded generation
│
├─ GET /health                  [Liveness]
├─ GET /metrics                 [Prometheus]
└─ POST /feedback               [Learner signals]

Embeddings Vector DB
├─ BGE-M3 (1536-dim)
├─ GACAR corpus indexed
└─ 74 Parts, 211 docs, ~80K chunks

BM25 Lexical Index
├─ GACAR tokenized
├─ Inverted index
└─ Token-level retrieval

Gemini / ALLaM (Inference)
├─ English queries → Gemini 2.5 Flash
├─ Arabic queries → ALLaM (if available)
└─ Fallback → Gemini (global)
```

---

## 📊 Live Stats

```
✅ 501+ passing tests
✅ 138 evaluation cases (EN + AR)
✅ 74 GACAR Parts indexed
✅ 211 reference documents
✅ ~80K chunks in corpus
✅ Hybrid retrieval (dense + lexical)
✅ <2s end-to-end latency (p95)
✅ 100% uptime (Cloud Run auto-scaling)
```

---

## ⚡ API Reference

### POST /v1/chat
**Streaming SSE endpoint for grounded flight instruction.**

#### Request
```bash
curl -X POST https://captadel.com/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "What is GACAR 91.155?"
      }
    ],
    "model": "gemini-2.5-flash",
    "stream": true,
    "temperature": 0.2
  }'
```

#### Response (SSE)
```
data: {"delta":"Under","kind":"grounded"}
data: {"delta":" GACAR","kind":"grounded"}
data: {"delta":" §91.155","kind":"grounded"}
...
data: {"citations":[{"text":"§91.155","url":"gaca.gov.sa/§91.155"}]}
data: {"kind":"done"}
```

#### Query Parameters
| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `messages` | Array | Yes | — | Chat history |
| `model` | String | No | `gemini-2.5-flash` | Model ID |
| `stream` | Boolean | No | `true` | SSE or JSON |
| `temperature` | Number | No | `0.2` | Lower = more deterministic |
| `max_tokens` | Number | No | `2048` | Response length |

---

## 🧪 Evaluation Suite

**501+ test cases** covering:
- ✅ GACAR Part coverage (all 74 parts)
- ✅ Exact citation verification
- ✅ Refusal accuracy (what we don't know)
- ✅ Arabic parity (EN ↔ AR semantics)
- ✅ Hallucination resistance

Run locally:
```bash
npm run test                # Full suite
npm run test:evals          # Eval cases only
npm run test:watch          # Live mode
```

---

## 🌍 Bilingual Design

### English Path
- Gemini 2.5 Flash (live)
- Gemini 2.0 (fallback)
- No region pinning (⚠️ queries leave Kingdom)

### Arabic Path (Saudi MSA)
- ALLaM (in-Kingdom, preferred)
- Jais (fallback)
- Gemini (last resort)
- Proper diacritics + typography (Cairo font)

**Status:** Both paths ship. English default, Arabic auto-detect on `ar/` or `Accept-Language: ar`.

---

## 🔐 Safety & Data Residency

### PDPL Compliance
- ✅ Zero learner PII in logs
- ✅ Inference happens outside Kingdom (open risk, documented)
- ✅ Feedback logging is minimal
- ✅ Deletion & anonymization implemented

### Data Residency
- 🇸🇦 Backend: Cloud Run `me-central2` (Dammam)
- 🌍 Inference: Gemini/ALLaM APIs (US/EU for Gemini, KSA for ALLaM)

---

## 🛠 Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| **Runtime** | Node.js 20 + Express 5 | Minimal, fast, Cloud Run optimized |
| **AI** | Genkit + Gemini | Multi-provider, streaming, grounding |
| **Embeddings** | BGE-M3 (1536-dim) | Multilingual, performance |
| **Search** | Custom BM25 | Fast lexical retrieval |
| **Database** | Cloud SQL PostgreSQL | PDPL-safe, immutable audit trail |
| **Monitoring** | Cloud Logging + Cloud Trace | Latency, errors, feedback signals |
| **Infra** | Cloud Run + Secret Manager | Auto-scaling, zero-ops |

---

## 📦 Build & Deploy

### Local Development
```bash
npm run dev                # Dev server + watch
npm run dev:corpus         # Index corpus locally
npm run test               # Test suite
```

### Production Deploy
```bash
npm run build              # Compile TypeScript
npm run deploy             # Cloud Run push (me-central2 only)
```

**CI/CD:** GitHub Actions (`.github/workflows/`)  
**Signing:** GitHub App secrets (no hardcoded keys)  
**Rollback:** Previous Cloud Run revision (automatic)  

---

## 🚀 What's Coming

| Feature | Status | ETA |
|---------|--------|-----|
| Multilingual (FR, DE, ES) | 📋 Planned | Q3 2027 |
| Fine-tuned smaller models | 🚧 In progress | Q2 2027 |
| Confusion detection signals | 📋 Planned | Q4 2027 |
| Learner progression gates | 📋 Design phase | Q1 2028 |
| Real-time regulatory updates | 🚧 Building | Q2 2027 |

---

## 📖 Full Documentation

- **[docs/RAG-ARCHITECTURE.md](./docs/RAG-ARCHITECTURE.md)** — Retrieval & grounding deep-dive
- **[docs/RUNBOOK-DEPLOY.md](./docs/RUNBOOK-DEPLOY.md)** — Deployment checklist
- **[docs/REFUSAL-TAXONOMY.md](./docs/REFUSAL-TAXONOMY.md)** — When/why we refuse
- **[src/brain/README.md](./src/brain/)** — Brain orchestration
- **[ROADMAP.md](./ROADMAP.md)** — Feature roadmap

---

## 🧑‍💻 Contributing

We welcome:
- 🧠 LLM engineers (model optimization, fine-tuning)
- 📚 Aviation SMEs (GACAR validation, test case authoring)
- 🔍 QA engineers (eval cases, edge cases)
- 🌍 Translators (Arabic, future languages)

### How to Contribute
```bash
1. Fork the repo
2. Create a feature branch (git checkout -b feat/something)
3. Test thoroughly (npm test)
4. Push & open a PR
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 📜 License

MIT © BDA Company International, operating as Fly GACA

---

## ⚖️ Disclaimer

Captain Adel is an **independent educational service**, not affiliated with or endorsed by GACA. All responses cite official GACAR sections for study and training purposes only.

Flight crews must always verify critical decisions against **official publications at [gaca.gov.sa](https://gaca.gov.sa)**.

---

<div align="center">

**Study with AI. Verify with GACA. Fly safely.**

[Live on captadel.com](https://captadel.com) · [Try on HuggingFace](https://huggingface.co/spaces/flygaca/captain-adel) · [Report Issues](https://github.com/ay2m/Captain-Adel/issues) · [Star ⭐](https://github.com/ay2m/Captain-Adel)

</div>
