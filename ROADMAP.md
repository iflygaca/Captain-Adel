<div align="center">

# 🧭 Captain Adel — Roadmap

### Making the captain sharper, safer, and more useful — one verified answer at a time.

</div>

This roadmap is how we keep improving **Captain Adel**: the standalone, retrieval-grounded
AI flight instructor for Saudi civil aviation. It is organised by horizon — **Now / Next /
Later** — under a few long-lived tracks. Items are concrete and reference the code they touch.

> [!IMPORTANT]
> **Every change is eval-gated.** Captain Adel is safety-adjacent: a wrong limit is worse than
> no answer. No prompt, model, retrieval or routing change ships until it matches-or-beats the
> current bar on `captadel/evals` (citations, refusals, injection resistance) in **both**
> English and Arabic. New capabilities arrive with new eval cases.

---

## 🎯 Vision

Captain Adel should feel like a calm, precise senior captain who **always cites the
regulation, refuses rather than guesses, answers equally well in Arabic and English, and runs
in-Kingdom**. He is a product in his own right (captadel.com) and the brain other products —
starting with Fly GACA — plug into.

## 🧱 Principles (don't regress these)

- **Grounded or silent** — answer only from retrieved GACAR text; never fabricate a section
  number or a limit.
- **Cite everything** — every regulatory claim carries a Part + section.
- **Bilingual parity** — Arabic is first-class, not a translation afterthought.
- **In-Kingdom** — user questions are personal data; keep inference in a KSA region (PDPL).
- **Eval-gated** — measure before/after; ship on green.

## ✅ Status today (the baseline we build on)

- [x] Standalone service (`src/server.js`): captadel.com site + `POST /v1/chat` + `GET /health`
- [x] Model-pluggable brain: **Gemini** (agentic tool-calling) + **ALLaM** (retrieve-then-read)
- [x] Lexical **BM25** retriever over the GACAR corpus (`src/brain/bm25.js`)
- [x] Product-aware system prompt (`system-prompt.js` + `tenants.js`)
- [x] Input guards + per-process rate limiter + optional server-to-server API key
- [x] Language routing (`route.js`) with cross-provider fallback
- [x] Eval harness with `--provider` and EN + AR cases (`evals/`)
- [x] Docker + vLLM runbook; Fly GACA plugs in via the gateway proxy

---

## 🚦 Now — quality & trust (highest leverage)

The fastest wins are in retrieval quality, evaluation depth, and hardening the public API.

### 🔍 Retrieval
- [ ] **Hybrid retrieval** — add embedding recall and fuse with BM25 (Reciprocal Rank Fusion).
  BM25 alone misses paraphrases beyond the hand-built `SYNONYMS` map in `bm25.js`.
- [ ] **Cross-encoder rerank** of the top-k before the answer step, for sharper passage choice.
- [ ] **Parent-child chunks** — retrieve a chunk, expand to its full section so limits/tables
  aren't truncated mid-rule (today `retrieve.js` caps passages at 1200 chars).
- [ ] **Citation precision** — harden `citationOf`/`sectionRefOf` against mangled PDF titles
  (the "AIRCRAFTONTHEWATER" class of bugs already noted in `bm25.js`).

### 🧪 Evaluation
- [ ] **Grow the case set** — per-Part coverage, numeric-limit precision, more AR cases, an
  expanded adversarial/injection suite.
- [ ] **LLM-as-judge grader** for groundedness + citation correctness (beyond keyword heuristics).
- [ ] **Citation-faithfulness check** — automatically verify the cited section actually contains
  the claimed text; flag/strip uncited claims post-hoc.
- [ ] **CI gate** — run the live eval (Gemini, and ALLaM when an endpoint is available) as a
  required check, not just `--dry`.

### 🛡️ Safety & ops
- [ ] **App Check / abuse hardening** for the public API (monitoring → enforce).
- [ ] **Distributed rate limiting** — move the per-process limiter (`ratelimit.js`) to a shared
  store (Redis/Firestore) so it holds across replicas.
- [ ] **Structured observability** — per-turn metrics (latency, tool rounds, #sources, refusal
  rate, provider used, fallbacks) + an error beacon.

---

## 🔜 Next — models, conversation & capability

### 🤖 Models
- [ ] **Promote ALLaM to production** — pinned, quantized (AWQ/GPTQ) endpoint in a KSA region;
  benchmark per-language on the eval set; flip `MODEL_PROVIDER=auto` once Arabic reaches parity.
- [ ] **Streaming responses (SSE)** for both providers — far better perceived latency in chat.
- [ ] **LoRA/QLoRA fine-tune ALLaM** for Arabic aviation tone, the exact citation format, and
  refusal discipline (seeded from the corpus + eval set). RAG stays the source of truth.
- [ ] **Query rewriting** — resolve multi-turn follow-ups ("what about at night?") and map
  Arabic terms to corpus vocabulary before retrieval.

### 💬 Conversation & UX
- [ ] **Streaming chat UI** + inline "show the passage" expanders on the source links.
- [ ] **Arabic / RTL parity** on the captadel.com site (today the standalone site is EN-only).
- [ ] **Feedback loop** — 👍/👎 on answers, logged (PDPL-safe) to feed evals and fine-tuning.
- [x] **Context-aware follow-ups** — suggestions are derived from the Parts the
  answer cited (`src/brain/followups.js`), not a fixed list; curated set is the fallback.

### 🎓 Domain capability (a better instructor, not just a lookup)
- [ ] **Compute, don't just cite** — wire the flight tools (E6B, W&B, fuel, VFR minima) as tools
  so Adel can calculate and show its working.
- [ ] **Scenario / oral-exam coach** — checkride prep, structured lesson plans.
- [ ] **"What changed" digests** — surface `list_changes` proactively per Part / GACAR version.
- [ ] **AIP-KSA + charts** in the corpus, with the same citation discipline.

---

## 🌅 Later — Captain Adel as a platform

- [x] **Accounts, billing & quota** on captadel.com (the daily-quota concept exists in Fly GACA;
  give Captain Adel its own metering).
- [ ] **Public multi-tenant API** — API keys, per-tenant rate tiers, usage metering, OpenAPI docs.
  The `X-Adel-Api-Key` trusted tier is the seed.
- [ ] **Embeddable widget / SDK** so any site (beyond Fly GACA) can drop Captain Adel in.
- [ ] **Voice** — Saudi-accented English + Khaleeji Arabic TTS/STT (per the character sheet's
  future-variants note).
- [ ] **Personalization** (opt-in) — tailor to a pilot's licence level and currency; tie into the
  Fly GACA logbook.
- [ ] **Scale & resilience** — CDN for the static site, autoscaling API, GPU autoscaling for ALLaM.
- [ ] **Promote to the standalone repo** — `git subtree split --prefix=captadel` → `FlyGACA/captadel`.

---

## 📈 Metrics we watch

| Signal | Why it matters |
|--------|----------------|
| Eval pass rate (EN + AR) | The release gate — citations, refusals, injection resistance |
| Citation faithfulness | Share of claims whose cited section actually supports them |
| Refusal calibration | Refuses the unanswerable, answers the answerable — neither over nor under |
| Groundedness (judge) | Answers traceable to retrieved passages, not memory |
| p50 / p95 latency | Especially once streaming + ALLaM land |
| Provider mix & fallback rate | Health of Gemini vs ALLaM routing |
| Cost per 1k answers | Sustainability of the free educational tier |

## 🤝 How we ship a change

1. Make the change behind the brain interface (`src/brain/`).
2. Add or update eval cases that capture the intended behaviour.
3. Run `node evals/run.js` (and `--provider allam` when relevant); compare against baseline.
4. Open a PR; CI runs the structure check (and live eval where a key is set).
5. Merge on green. Roll model/routing changes out behind `MODEL_PROVIDER` first.

> See [`README.md`](README.md) for the architecture and [`deploy/allam-vllm.md`](deploy/allam-vllm.md)
> for serving ALLaM.
