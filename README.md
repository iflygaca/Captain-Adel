<div align="center">

<img src="public/assets/img/captain/avatar.png" alt="Captain Adel" width="140" />

# Captain Adel

<p>
  <a href="https://github.com/FlyGACA/Captain-Adel/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/FlyGACA/Captain-Adel/ci.yml?style=for-the-badge&label=CI&labelColor=0a0e12&color=2d6e8a" alt="CI Status" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-20-2d6e8a?style=for-the-badge&logo=node.js&logoColor=white&labelColor=0a0e12" alt="Node 20" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-proprietary-2d6e8a?style=for-the-badge&labelColor=0a0e12" alt="License" /></a>
</p>

</div>

**An independent AI flight instructor for Saudi civil aviation.** Captain Adel
answers GACAR questions with the exact Part and section cited, and refuses
rather than guess when he can't ground an answer. He runs as a standalone
service on [captadel.com](https://captadel.com) — and is the same **brain**
that Fly GACA plugs into over its API.

> **Unofficial & educational.** Captain Adel is not affiliated with, endorsed by,
> or operated by the General Authority of Civil Aviation (GACA). The authoritative
> source for any regulation is always GACA — [gaca.gov.sa](https://gaca.gov.sa).

---

## What this is

Two surfaces, one repo:

- **captadel.com (the landing)** — a static Vite + React marketing page in
  [`landing/`](landing/), served by the Cloudflare Worker `captadel`
  (English at `/`, Arabic at `/ar/`). Built and deployed **manually** —
  see `landing/README.md` for the wrangler runbook.
- **The product app + API** — a single Node service that serves the app
  pages and the chat API:

```
landing/           captadel.com landing source (Vite + React, EN + /ar/) → Cloudflare Worker
public/            the app pages (chat, account, console, exam, checkout, legal — 8 pages)
src/server.js      Express: GET /health, POST /v1/chat + /v1/feedback, the /v1/me · /v1/config ·
                   /v1/billing/* SaaS routes, POST /v1/account/delete, /.well-known (Apple Pay)
src/middleware/    CORS allowlist, Firebase auth, X-Adel-Api-Key check
src/quota/         Firestore-backed free-tier usage meter (fails open)
src/billing/       Moyasar + Firebase SaaS layer — entitlements, tiers, routes (dark until env set)
src/brain/         THE BRAIN — single source of truth, also powers Fly GACA's API
  answer.js          orchestrator: pick provider + strategy
  retrieve.js        retrieve-then-read (BM25 in code)
  route.js           language/provider routing
  grounding.js       cite-or-refuse layer: citations, refusal classes, source shaping
  providers/         gemini (agentic tool-calls) · allam · jais · fanar · qwen · commandr
                     openai-compatible.js builds every non-Gemini provider from one client
  tools/             compute-only flight tools (wind, fuel, weight & balance, recency, density)
  embeddings.js      dense embeddings + reranker clients (hybrid retrieval, gated off)
  bm25.js            lexical retriever over the GACAR corpus
  system-prompt.js   product-neutral core + per-product framing
  tenants.js         captadel / flygaca framing
  guards.js          input validation + soft injection hardening
  ratelimit.js       per IP / session abuse limiter
  _chunks.json.gz    the GACAR corpus
test/              unit tests (node --test), one file per src/ module
evals/             regression harness (run against either provider)
deploy/            docker-compose + the ALLaM (vLLM) runbook
docs/              models, refusal taxonomy, data contract, iOS app plan, multi-agent orchestrator, RUNBOOKs
examples/          multi-agent orchestrator boilerplate (Claude API, Python + TS) — decoupled from src/
authoring/         source-of-truth system prompt + KB scope + Python reference
ios/               AdelCore Swift package (AdelAPI + AdelSSE) — the Phase-0 iOS spike
```

## The Fly GACA family

Captain Adel is one of ten repositories. [**The Book of Fly GACA**](https://github.com/ay2m/FlyGACA/blob/main/THE-BOOK-OF-FLY-GACA.md) is the whole-family reference — every repo, the shared principles, the data-parity contracts and the glossary in one place.

| Repo | What it holds |
| --- | --- |
| **FlyGACA/Captain-Adel** (this repo) | The AI flight-instructor service (captadel.com) + the shared brain behind chat |
| [FlyGACA/FlyGACA-app](https://github.com/FlyGACA/FlyGACA-app) | flygaca.com — the React/Vite web app, Firebase backend, regulatory corpus + content pipelines |
| [ay2m/FlyGACA](https://github.com/ay2m/FlyGACA) | The native iOS app family — FlyGACAKit + the ELPT and AIP App Store targets |
| [FlyGACA/ELPT](https://github.com/FlyGACA/ELPT) · [AIP](https://github.com/FlyGACA/AIP) · [PPL](https://github.com/FlyGACA/PPL) · [CPL](https://github.com/FlyGACA/CPL) · [IR](https://github.com/FlyGACA/IR) · [ATPL](https://github.com/FlyGACA/ATPL) | Per-app App Store metadata repos — store listing copy, screenshots, per-app roadmap |
| [FlyGACA/Office](https://github.com/FlyGACA/Office) | The business operating system — strategy, governance, legal, finance, GTM docs |

## The API

`POST /v1/chat`

```json
{ "message": "What are the VFR weather minima?", "history": [], "session": "…",
  "product": "captadel", "provider": "auto" }
```

→ `{ "answer": "…markdown…", "sources": [ { "citation": "GACAR Part 91, §91.155", "url": "…" } ] }`

- `product` — `captadel` (default) or `flygaca`; selects the persona framing.
- `provider` — `gemini` | `allam` | `jais` | `fanar` | `qwen` | `commandr` | `auto` (optional; defaults to `MODEL_PROVIDER`).
- `session` — stable per-browser id for rate limiting (or send `X-Adel-Session`).
- Trusted callers send `X-Adel-Api-Key: $ADEL_API_KEY` to skip the browser limiter.
- Add `?stream=1` or send `Accept: text/event-stream` for SSE streaming.

Response: `{ answer, sources, kind, refusalClass, grounding, suggestions, meta }` — `sources` carries
exact `GACAR Part X, §X.YYY` citations, `suggestions` are "keep exploring" follow-ups, and `meta`
reports `{ provider, model, rewrittenQuery, toolCalls }`. Every response echoes
`X-Adel-Api-Version`; metered turns also carry `X-Adel-Quota-Remaining`.

`POST /v1/feedback` — thumbs rating on a turn; logs only `{rating, turnId, provider, ts}`, never
the question or answer.

`GET /health` → `{ status:"ok", service:"captain-adel", … }`

## Models

| Provider | Strategy | Used for |
|---|---|---|
| **Gemini** (`gemini-2.5-flash`) | agentic function-calling | default English path |
| **ALLaM-7B-Instruct** (HUMAIN, Apache-2.0) | retrieve-then-read | Arabic / in-Kingdom path *(default)* |
| **Jais** (Inception/G42) | retrieve-then-read | Arabic / in-Kingdom candidate |
| **Fanar** (QCRI) | retrieve-then-read | Arabic / in-Kingdom candidate |
| **Qwen2.5-Instruct** (Alibaba, Apache-2.0) | retrieve-then-read | instruction-following workhorse |
| **Command R** (Cohere, **CC-BY-NC** ⚠️) | retrieve-then-read | grounded-citation candidate (eval/research only) |

A small model isn't reliable at function-calling, so the Arabic models always use
**retrieve-then-read**: retrieval runs in code (`retrieve.js`), the cited passages
are handed to the model, and it answers only from them. RAG is the source of truth
for facts; a later LoRA tune (out of scope here) would only shape tone/format.

Every non-Gemini provider is served over an OpenAI-compatible `/chat/completions`
API (vLLM/TGI) and built from one factory (`providers/openai-compatible.js`) —
adding another is a few lines (a new `*_BASE_URL` config + registry entry). All
are off until their `*_BASE_URL` is set. `auto` routes Arabic-dominant questions
to the first configured Arabic provider (ALLaM first; set `ARABIC_PROVIDER=<name>`
to prefer another), falling back to Gemini. For Arabic turns the read-mode
scaffolding is localized to Arabic while citations stay in the Latin
`GACAR Part X, §X.YYY` form. See **[docs/models.md](docs/models.md)** for the full
catalog, the Arabic slot-B ranking, and license caveats. Note: vision/imagery
systems (e.g. Baseer, Sawaher) are **not** chat models and do not fit this
text-only RAG path.

## Run it locally

```bash
npm install
cp .env.example .env          # set GEMINI_API_KEY
npm start                     # http://localhost:8787
curl localhost:8787/health
curl -XPOST localhost:8787/v1/chat -H 'Content-Type: application/json' \
  -d '{"message":"What are the VFR weather minima?"}'
```

To exercise ALLaM, point `ALLAM_BASE_URL` at a vLLM/TGI endpoint and set
`MODEL_PROVIDER=auto` (see `deploy/allam-vllm.md`). The other Arabic-capable
providers are the same shape — set the matching `*_BASE_URL` (optionally
`*_MODEL` / `*_API_KEY`) and call with `provider:"<name>"` (`jais`, `fanar`,
`qwen`, `commandr`) or `MODEL_PROVIDER=<name>`. Smoke-test any endpoint with
`node evals/provider-smoke.js <name>` before running a full eval.

**Hybrid retrieval (optional, off by default).** Set `EMBEDDINGS_BASE_URL`
(BGE-M3) and build the dense index once with `npm run build:embeddings`; then
retrieval fuses BM25 with dense recall (the cross-lingual unlock for Arabic over
the English corpus), and reranks if `RERANK_BASE_URL` is set. With neither set,
retrieval is pure BM25 and unchanged.

## Unit tests

```bash
npm run test:unit                                # node --test test/*.test.js, no key
```

Fast, deterministic, dependency-free brain tests that gate every PR (ci.yml's
`build` job runs them on every push/PR via `npm run test:coverage` — the same
suite plus a report-only coverage table — and deploy.yml's `test` job runs
`npm run test:unit`, both after `npm ci`): `guards` (input cleaning + injection
hardening), `bm25` (retriever over the bundled corpus), `ratelimit`, `route`
(language/provider routing), and `grounding` — the cite-or-refuse layer
(`makeSource`, `extractCitations`, `splitClaims`, `classifyRefusal`,
`stripMetaTrailer`, `deriveStructural`, and `decorate`'s structural +
anti-overclaim merge). These cover the structural grounding path without an API
key; the live eval below additionally exercises the faithfulness judge.

## Evals

```bash
node evals/run.js --dry                          # structure only, no key
GEMINI_API_KEY=…  node evals/run.js              # Gemini
ALLAM_BASE_URL=…  node evals/run.js --provider allam   # ALLaM
QWEN_BASE_URL=…   node evals/run.js --provider qwen    # any Arabic provider
GEMINI_API_KEY=…  QWEN_BASE_URL=…  node evals/parity.js --provider qwen   # parity gate
```

Only route Arabic to a provider once it matches-or-beats Gemini on the parity
gate (citations / refusals / injection, Arabic subset). See
[docs/models.md](docs/models.md).

## Deploy

Build the container and deploy to a **KSA region** (Cloud Run me-central2, with
me-central1 as fallback, or a Kingdom box) — real user questions are personal
data and must be processed in-Kingdom (PDPL). Set `GEMINI_API_KEY`, optionally `ADEL_API_KEY`, and (for
Arabic) `ALLAM_BASE_URL` pointing at a GPU vLLM endpoint. Map `captadel.com`
(and `api.captadel.com` if the API is split out).

## Roadmap

Where Captain Adel is headed — retrieval quality, ALLaM to production, deeper evals, and
Captain Adel as a platform — is tracked in [`ROADMAP.md`](ROADMAP.md). Every change is
eval-gated.
