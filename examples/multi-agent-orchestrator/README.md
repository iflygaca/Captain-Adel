<div align="center">

# 🐝 Multi-Agent Orchestrator — Reference Boilerplate
### High-Concurrency Hierarchical Task Decomposition, Execution & Synthesis
#### نمط الوكلاء المتعددين · تفكيك المهام المتوازية · التوليف المتدفق

<p align="center">
  <img src="https://img.shields.io/badge/Made%20in-Saudi%20Arabia-006C35?style=for-the-badge&labelColor=0a0e12" alt="صنع في السعودية" />
  <img src="https://img.shields.io/badge/Implementations-Python%20%7C%20TypeScript-C8A04A?style=for-the-badge&labelColor=0a0e12" alt="Languages" />
  <img src="https://img.shields.io/badge/Architecture-Lead%20%2B%20Worker%20Swarm-0D96F6?style=for-the-badge&labelColor=0a0e12" alt="Architecture" />
  <img src="https://img.shields.io/badge/Optimization-Prompt%20Caching-8E75B2?style=for-the-badge&labelColor=0a0e12" alt="Prompt Caching" />
</p>

</div>

---

## 🧭 Overview & Architectural Pattern

This reference implementation demonstrates an enterprise multi-agent pattern for deep research and complex regulatory analysis.

Rather than feeding an entire large document corpus to a single LLM turn, the system applies a **Decompose → Fan-Out → Reconcile** architecture:

```
┌────────────────────────────────────────────────────────┐
│               Complex Aviation Question                │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Lead Orchestrator (Sonnet-5)               │
│   Decomposes question into 5–15 atomic research tasks  │
└───────────────────────────┬────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
     │ Worker 1    │ │ Worker 2    │ │ Worker N    │
     │ (Haiku-4.5) │ │ (Haiku-4.5) │ │ (Sonnet-5)  │
     └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
            │               │               │
            └───────────────┼───────────────┘
                            │ Parallel Results
                            ▼
┌────────────────────────────────────────────────────────┐
│             Synthesis Engine (Streamed)                │
│    Reconciles findings into structured markdown report │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Real-Time Token & Cost Ledger              │
│       (Tracks prompt tokens, cache hits, USD cost)     │
└────────────────────────────────────────────────────────┘
```

---

## ⚡ Quickstart

Both Python and TypeScript implementations are fully standalone and feature-parity.

### Prerequisites
- **Anthropic API Key** (`export ANTHROPIC_API_KEY=sk-ant-...`)

### Option A: Python Implementation (3.10+)
```bash
cd examples/multi-agent-orchestrator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run built-in demo question
python orchestrator.py

# Run custom question with concurrency tuning
python orchestrator.py "Analyze VFR fuel reserves across GACAR Part 91, 121, and 135" --concurrency 6
```

### Option B: TypeScript Implementation (Node.js 20+)
```bash
cd examples/multi-agent-orchestrator
npm install

# Run built-in demo question
npm start

# Run custom query
npm start -- "Compare pilot flight duty time limitations under GACAR Part 121 vs 135" --concurrency 8
```

---

## 💡 Prompt Caching Optimization

The architecture leverages Anthropic's prompt caching to minimize latency and operational costs:
- **Shared Context Prefix:** Common background documents and regulatory definitions are positioned at the beginning of system instructions.
- **Warm-First Fan-Out:** Workers share the cached prefix, reducing subsequent token processing costs by up to **90%**.

---

<div align="center">

<sub>🇸🇦 صنع في السعودية · Made in Saudi Arabia</sub>

</div>
