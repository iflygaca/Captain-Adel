<div align="center">

<img src="public/assets/img/captain/avatar.png" alt="Captain Adel" width="140" />

# 👨‍✈️ Captain Adel

### The AI Flight Instructor & Regulatory RAG Service for Saudi Civil Aviation

<p>
  <a href="https://github.com/FlyGACA/Captain-Adel/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/FlyGACA/Captain-Adel/ci.yml?style=for-the-badge&label=CI&labelColor=0a0e12&color=2d6e8a" alt="CI Status" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-20-2d6e8a?style=for-the-badge&logo=node.js&logoColor=white&labelColor=0a0e12" alt="Node 20" /></a>
  <a href="https://captadel.com"><img src="https://img.shields.io/badge/service-captadel.com-8fc9a8?style=for-the-badge&labelColor=0a0e12" alt="captadel.com" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-proprietary-2d6e8a?style=for-the-badge&labelColor=0a0e12" alt="License" /></a>
</p>

</div>

**Captain Adel** is an independent AI flight instructor engineered specifically for Saudi civil aviation. He answers **GACAR** (General Authority of Civil Aviation Regulations) questions with exact Part and section citations, performing strict cite-or-refuse grounding to prevent hallucinations. 

Captain Adel runs as a standalone Web service at [captadel.com](https://captadel.com) — and serves as the core AI engine powering chat across the entire [Fly GACA](https://flygaca.com) platform via its REST & SSE API.

> [!IMPORTANT]
> **Unofficial & Educational.** Captain Adel is not affiliated with, endorsed by, or operated by GACA (General Authority of Civil Aviation). The authoritative source for any regulation is always official GACA publications at [gaca.gov.sa](https://gaca.gov.sa).

---

## 🏗 System Architecture

Captain Adel consists of two main operational surfaces contained within one single repository:

1. **captadel.com Landing Surface (`landing/`)** — A high-performance static Vite + React marketing and landing experience (supporting English `/` and Arabic `/ar/`), served globally via a Cloudflare Worker (`captadel`).
2. **Product App & RAG API Service (`src/server.js`)** — A strict Node.js / Express microservice that hosts the chat interface, SaaS account/billing routes, and the core RAG intelligence engine.

```
Captain-Adel/
├── landing/             # captadel.com landing page (Vite + React, EN + AR) → Cloudflare Worker
├── public/              # Web application interface (chat, account, console, exam, checkout)
├── src/
│   ├── server.js        # Express application: API router, CORS, health checks, Apple Pay
│   ├── middleware/      # Firebase Auth, CORS allowlist, API key verification
│   ├── quota/           # Firestore-backed usage meter & daily cap enforcer
│   ├── billing/         # Moyasar + Firebase SaaS entitlement layer
│   └── brain/           # 🧠 THE BRAIN — Core AI RAG & Grounding Engine
│       ├── answer.js    # Master orchestrator: strategy selection & provider execution
│       ├── retrieve.js  # BM25 lexical + dense vector hybrid retrieval pipeline
│       ├── route.js     # Language detection & provider router (Gemini vs ALLaM/Arabic)
│       ├── grounding.js # Strict citation, claim verification, and refusal classifier
│       ├── bm25.js      # Lexical index search over bundled GACAR corpus
│       ├── system-prompt.js # Core system prompts & tenant framing
│       ├── tenants.js   # Per-product framing (CaptAdel vs FlyGACA)
│       ├── guards.js    # Prompt injection hardening & input cleaning
│       ├── ratelimit.js # IP & session-based rate limiter
│       ├── providers/   # Gemini (function-calling) & OpenAI-compatible clients (ALLaM, Jais, etc.)
│       ├── tools/       # Pure-math flight calculators (Wind, Fuel, W&B, Recency, Density Alt)
│       └── _chunks.json.gz # Bundled GACAR regulatory corpus chunks
├── test/                # Comprehensive unit test suite (node --test)
├── evals/               # Automated regression & faithfulness evaluation harness
├── deploy/              # Docker Compose & KSA vLLM deployment runbooks
└── docs/                # Architecture specs, model catalog, refusal taxonomy, and runbooks
```

---

## ⚡ API Reference

### `POST /v1/chat`

Main conversational endpoint for grounded regulatory Q&A.

**Request Payload:**
```json
{
  "message": "What are the basic VFR weather minima in Class E airspace?",
  "history": [],
  "session": "sess_8f9a2b1c",
  "product": "captadel",
  "provider": "auto"
}
```

- `product`: `"captadel"` (default) or `"flygaca"` (selects persona framing).
- `provider`: `"gemini"` | `"allam"` | `"jais"` | `"fanar"` | `"qwen"` | `"commandr"` | `"auto"`.
- `session`: Stable client identifier for rate-limiting (or pass `X-Adel-Session` header).
- `X-Adel-Api-Key`: Header for trusted service-to-service callers to skip browser rate limits.
- `Accept: text/event-stream` or `?stream=1`: Enables SSE streaming response.

**Response Payload:**
```json
{
  "answer": "Under GACAR Part 91, §91.155, basic VFR flight rules require...",
  "sources": [
    {
      "citation": "GACAR Part 91, §91.155",
      "title": "Basic VFR Weather Minima",
      "url": "https://flygaca.com/library/gacar-part-91#91.155"
    }
  ],
  "kind": "grounded",
  "refusalClass": null,
  "suggestions": [
    "What are the VFR visibility requirements at night?",
    "What are the cloud clearance requirements in Class B airspace?"
  ],
  "meta": {
    "provider": "gemini-2.5-flash",
    "model": "gemini-2.5-flash",
    "rewrittenQuery": "VFR weather minima Class E airspace GACAR",
    "toolCalls": []
  }
}
```

### Additional Endpoints:
- `POST /v1/feedback` — Submit thumbs rating (`{ rating, turnId, provider, ts }`).
- `GET /health` — Service health & version diagnostic (`{ status: "ok", service: "captain-adel" }`).
- `POST /v1/account/delete` — GDPR/PDPL user account deletion request.

---

## 🤖 Supported Models & RAG Strategy

| Provider / Model | Strategy | Primary Use Case |
|---|---|---|
| **Gemini 2.5 Flash** | Agentic Function-Calling | Default English flight instructor & real-time tool caller |
| **ALLaM-7B-Instruct** (HUMAIN) | Retrieve-then-Read RAG | Primary In-Kingdom Arabic model *(Apache 2.0)* |
| **Jais 13B / 30B** (Inception/G42) | Retrieve-then-Read RAG | Arabic candidate for complex reasoning |
| **Fanar** (QCRI) | Retrieve-then-Read RAG | Arabic regulatory candidate |
| **Qwen 2.5 Instruct** (Alibaba) | Retrieve-then-Read RAG | Instruction-following workhorse *(Apache 2.0)* |
| **Command R** (Cohere) | Grounded-Citation Candidate | Research & eval baseline *(CC-BY-NC)* |

### Retrieve-Then-Read RAG Flow:
Local and open-weights Arabic models often struggle with complex agentic function calling. Captain Adel implements a strict **Retrieve-then-Read** strategy for Arabic queries:
1. Lexical BM25 + dense vector embeddings search over `_chunks.json.gz`.
2. Relevant GACAR text sections are injected into the model context.
3. The model synthesizes an answer strictly from the retrieved text, outputting verified citations or triggering refusal protocols.

---

## 🛠 Local Development & Setup

### Prerequisites
- Node.js 20+
- Gemini API Key (`GEMINI_API_KEY`)

### Setup Commands

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and supply your GEMINI_API_KEY

# Start local dev server (http://localhost:8787)
npm start

# Test service health
curl http://localhost:8787/health

# Send a test chat query
curl -X POST http://localhost:8787/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What are the currency requirements for carrying passengers?"}'
```

### Unit Tests & Quality Control

```bash
# Run unit tests (no API key required)
npm run test:unit

# Run test coverage report
npm run test:coverage
```

### Evaluation Harness

```bash
# Run dry-run eval (structure validation)
node evals/run.js --dry

# Run live Gemini evaluation
GEMINI_API_KEY=your_key node evals/run.js

# Run Arabic provider evaluation
ALLAM_BASE_URL=http://localhost:8000/v1 node evals/run.js --provider allam
```

---

## 🔒 Deployment & KSA Data Residency

To comply with the Saudi Personal Data Protection Law (**PDPL**), real user queries and account data must be processed within Saudi Arabia:

- Deploy the production Node service to Google Cloud Run in region **`me-central1`** (Dammam/Riyadh) or a Kingdom-hosted VPS.
- Connect local Arabic endpoints (ALLaM / vLLM GPU servers) inside KSA infrastructure.
- See [`deploy/allam-vllm.md`](deploy/allam-vllm.md) and [`docs/RUNBOOK-captain-adel.md`](docs/RUNBOOK-captain-adel.md) for full deployment steps.

---

## 🌐 The Fly GACA Family

Captain Adel is part of the Fly GACA repository family. See [**The Book of Fly GACA**](https://github.com/ay2m/FlyGACA/blob/main/THE-BOOK-OF-FLY-GACA.md) for complete architecture details:

- **[FlyGACA/Captain-Adel](https://github.com/FlyGACA/Captain-Adel)** (this repo) — AI flight instructor service & shared brain.
- **[FlyGACA/FlyGACA-app](https://github.com/FlyGACA/FlyGACA-app)** — Primary Web PWA application (`flygaca.com`).
- **[ay2m/FlyGACA](https://github.com/ay2m/FlyGACA)** — Native iOS app family (`FlyGACAKit` package + store targets).
- **[FlyGACA/Office](https://github.com/FlyGACA/Office)** — Business operating system, legal, compliance, and strategy docs.

---

<div align="center">

*Engineered for flight safety. Powered by grounded AI.*

</div>

Where Captain Adel is headed — retrieval quality, ALLaM to production, deeper evals, and
Captain Adel as a platform — is tracked in [`ROADMAP.md`](ROADMAP.md). Every change is
eval-gated.
