# Captain Adel

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

A single Node service that serves both the captadel.com site and the chat API:

```
public/            the captadel.com site (landing + chat) — own brand
src/server.js      Express: GET /health, POST /v1/chat, serves public/
src/middleware/    CORS allowlist, Firebase auth, X-Adel-Api-Key check
src/quota/         Firestore-backed free-tier usage meter (fails open)
src/billing/       Moyasar + Firebase SaaS layer — entitlements, tiers, routes (dark until env set)
src/brain/         THE BRAIN — single source of truth
  answer.js          orchestrator: pick provider + strategy
  retrieve.js        retrieve-then-read (BM25 in code)
  route.js           language/provider routing
  providers/         gemini (agentic tool-calls) · allam · jais · fanar · qwen · commandr
                     openai-compatible.js builds every non-Gemini provider from one client
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
```

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

Build the container and deploy to a **KSA region** (Cloud Run me-central1 or a
Kingdom box) — real user questions are personal data and must be processed
in-Kingdom (PDPL). Set `GEMINI_API_KEY`, optionally `ADEL_API_KEY`, and (for
Arabic) `ALLAM_BASE_URL` pointing at a GPU vLLM endpoint. Map `captadel.com`
(and `api.captadel.com` if the API is split out).

## Roadmap

Where Captain Adel is headed — retrieval quality, ALLaM to production, deeper evals, and
Captain Adel as a platform — is tracked in [`ROADMAP.md`](ROADMAP.md). Every change is
eval-gated.

## Promotion to its own repo

This service is developed as the `captadel/` subtree of `flygaca/flygaca`. To
split it into the standalone `FlyGACA/captadel` repo with history preserved:

```bash
git subtree split --prefix=captadel -b captadel-export
# push captadel-export to the new repo's main
```
