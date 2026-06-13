# Captain Adel — model catalog

Captain Adel is **retrieval-grounded**: the BM25/hybrid retriever (and, on the
Gemini path, the model's own tool calls) pull GACAR passages, and the model
answers *only* from them. So a model is judged on how faithfully it follows the
read-mode contract — cite the passages, quote critical limits verbatim, refuse
when the passages don't cover it, and emit the `<<adel …>>` control line — not
on what it "knows" about aviation.

Models slot into three tiers.

---

## A. English / agentic slot — `answerAgentic()`

The default English path. The model drives the retrieval tools
(`search_library`, `lookup_citation`, `list_changes`) itself, so it needs solid
function-calling.

| Model | Notes |
|-------|-------|
| **Gemini 2.5 Flash** *(current default)* | Fast, cheap, reliable tool-calling. |
| Gemini 2.5 Pro | For harder multi-step questions; slower/costlier. |
| Claude Sonnet / Haiku 4.x | Strong tool-calling alternative. |
| GPT tool-calling models | Alternative; needs an `answerAgentic()` implementation. |

Adding a model here means implementing `answerAgentic()` for it (more work than
the `complete()` path below).

---

## B. Arabic / in-Kingdom slot — `complete()` (retrieve-then-read)

The focus tier. Retrieval runs in **code** (retrieve.js), the grounded passages
are handed to the model, and it answers from them — a small model need not be
good at function-calling, only at following the read contract. Every model here
plugs in through `providers/openai-compatible.js` (a self-hosted vLLM/TGI
`/chat/completions` endpoint): a new one is a few lines + a `*_BASE_URL`.

**Why this tier matters and where it's weak today.** Real user questions are
personal data and must be processed in-Kingdom (PDPL), so the Arabic path wants
a model servable on KSA infrastructure. The current bottleneck is **not** the
model — it's retrieval: the GACAR corpus is essentially English, so an Arabic
question retrieves almost nothing by lexical BM25 (~70 of ~47k chunks contain
Arabic). Cross-lingual **dense** retrieval (BGE-M3, tier C + hybrid mode) is the
unlock; until it's on, an Arabic model will (correctly) refuse a lot. Arabic
orthographic normalization (alef/hamza/ta-marbuta folding) is in `bm25.js` so the
Arabic that *is* in the corpus matches regardless of spelling.

### Ranking (best fit first)

| Model | Arabic (MSA/dialect) | Read-contract following | Citation fidelity | Ctx | License | Footprint | Sovereignty |
|-------|----------------------|--------------------------|-------------------|-----|---------|-----------|-------------|
| **ALLaM-7B-Instruct** *(default)* | Excellent native MSA | Fair (7B preview) | Good with the Arabic scaffold | 4k+ | Apache-2.0 | Light (1×GPU) | **Strongest** — SDAIA/HUMAIN, Saudi-origin |
| **Jais 13B/30B/70B** | Excellent, Arabic-first | Good (bigger sizes) | Good | 2k–8k | Apache-2.0 (13B) / custom | Medium–heavy | Strong (G42/Inception, UAE) |
| **Fanar-1-9B-Instruct** | Excellent MSA | Good | Good | 4k+ | Check model card | Light–medium | Strong (QCRI, Qatar) |
| **Qwen2.5-Instruct (7/14/32B)** | Good, not native MSA | **Best** instruction-following | Very good | 32k+ | Apache-2.0 (most sizes) | Medium | Neutral (Alibaba) — self-host in-Kingdom |
| **Command R (35B)** | Good multilingual | Very good, RAG-tuned | **Best** (built for grounded citations) | 128k | **CC-BY-NC** ⚠️ | Heavy | Neutral — self-host |
| AceGPT-13B | Good (Arabic-aligned Llama) | Fair | Fair | 4k | Llama community | Medium | Neutral |

Selection criteria, in order for this product: **Arabic register**,
**read-contract reliability** (this is what retrieve-then-read leans on),
**citation fidelity** (must keep the Latin `GACAR Part X, §X.YYY` form so
grounding.js parses it), context window (fit the passages), **license**, GPU
footprint/serveability, and **in-Kingdom sovereignty** (PDPL).

- **Default: ALLaM.** Best Saudi MSA + the cleanest sovereignty/PDPL story. Its
  7B-preview instruction-following is the main risk, mitigated by retrieve-then-read
  and the Arabic scaffolding (below).
- **If ALLaM's instruction-following proves too weak:** Qwen2.5-14B/32B is the
  workhorse — strongest at obeying the cite-only/trailer contract, permissive
  license, decent Arabic.
- **For citation-heavy grounding specifically:** Command R is purpose-built, but
  the open weights are **CC-BY-NC** — research/eval only unless a commercial
  licence is obtained. Do not ship it to production on the NC weights.
- **Jais / Fanar** are strong Arabic-first alternatives to evaluate against ALLaM.

### Arabic prompt scaffolding (slot-B specific)

For Arabic-dominant turns the read-mode scaffolding is **localized to Arabic**
(system note + the `النصوص المسترجعة … السؤال:` user-turn wrapper) because small
Arabic models follow Arabic instructions far more reliably. The product-neutral
CORE stays English by design. Two things are pinned in Arabic so localization
can't break the pipeline: citations stay in the Latin `GACAR Part X, §X.YYY`
shape (grounding.js parses it), and the `<<adel …>>` control line is still
emitted. See `src/brain/system-prompt.js` (`READ_STRATEGY_NOTE_AR`,
`ARABIC_DIRECTIVE`) and `answer.js`.

### Choosing one: the parity gate

Don't flip Arabic routing on by vibes. `evals/parity.js --provider <name>` runs
every case through Gemini and the candidate and only passes if the candidate
matches-or-beats Gemini on the **Arabic subset** without regressing overall.
Smoke-test the endpoint first: `node evals/provider-smoke.js <name>`.

---

## C. Retrieval support tier — not answerers

These raise accuracy for every model above; config-gated (off by default).

| Role | Model | Notes |
|------|-------|-------|
| Embeddings (dense recall) | **BGE-M3** | Multilingual dense+sparse; the cross-lingual unlock for Arabic→English corpus. |
| Embeddings (alt) | multilingual-e5-large | Solid multilingual alternative. |
| Reranker | **bge-reranker-v2-m3** | Cross-encoder; reorders the fused top-N. |
| Reranker (alt) | Cohere Rerank | Hosted alternative. |

Enable with `EMBEDDINGS_BASE_URL` (+ build the dense index via
`npm run build:embeddings`) and optionally `RERANK_BASE_URL`. With neither set,
retrieval is pure BM25 and byte-identical to before. See `src/brain/embeddings.js`
and `src/brain/retrieve.js` (`retrieveSmart`).

---

## Out of scope: vision/imagery systems

**Baseer (بصير)** and **Sawaher (سواهر)** are SDAIA computer-vision / imagery
platforms, not conversational text LLMs. Captain Adel is a text-only RAG engine
(retrieve GACAR passages → text model), so they have no slot here. They are not
ALLaM alternatives.
