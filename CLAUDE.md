# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is

**Captain Adel** is an independent, educational AI flight instructor for Saudi
civil aviation (captadel.com). It answers **GACAR** (General Authority of Civil
Aviation Regulations) questions with exact Part/section citations, and refuses to
guess when it can't ground an answer in the regulations.

It is one **Node.js 20 + Express** service that serves both:

- the static **captadel.com** site (`public/`), and
- the chat API: `GET /health` and `POST /v1/chat` (plus billing/account routes).

The retrieval+answer engine in `src/brain/` is the **single source of truth** —
the same brain also powers Fly GACA's API (called server-to-server with
`X-Adel-Api-Key`). Keep `src/brain/` portable and dependency-light.

> Not affiliated with GACA. It cites and defers to GACA as the authority.

## Commands

Node 20, npm (lockfile `package-lock.json`). All scripts live in `package.json`.

| Command | What it does |
| --- | --- |
| `npm start` | Run the server: `node src/server.js` (port `8787`). |
| `npm run smoke` | Loads the server module (no keys) — fast sanity check. CI-safe. |
| `npm run test:unit` | Unit tests: `node --test test/*.test.js`. Deterministic, **no API keys / no network**. |
| `npm run eval:dry` | Validate `evals/cases.json` structure only, no model calls. CI-safe. |
| `npm run eval` | Full regression suite against the live brain. Needs `GEMINI_API_KEY`. |
| `npm run eval:allam` / `:jais` / `:fanar` / `:qwen` / `:commandr` | Eval a specific provider (needs that endpoint configured). |
| `npm run eval:parity[:provider]` | Compare Gemini vs. a candidate; **gates `MODEL_PROVIDER=auto`**. |
| `npm run provider:smoke`, `allam:smoke`, `jais:smoke` | One-turn connectivity checks for an endpoint. |
| `npm run build:embeddings` | One-off: build the dense index. Needs `EMBEDDINGS_BASE_URL`. Writes `src/brain/_embeddings.json.gz`. Never run at request time or in CI. |

There is **no eslint/prettier/editorconfig** — style is maintained by convention
and review only. Match the surrounding code.

Before pushing: run `npm run smoke && npm run test:unit && npm run eval:dry`
(the exact set CI runs without secrets).

## Architecture

Request flow: `src/server.js` (Express, security headers, CORS, rate limit,
quota) → `src/brain/index.js` (`answer()` / `answerStream()` / `warmUp()`).

The brain has **two answer strategies**, chosen by provider:

1. **Agentic (Gemini, default English path):** the model drives its own tool
   calls — `search_library`, `lookup_citation`, plus flight-computer tools in
   `src/brain/tools/` — and is responsible for its own citations.
2. **Retrieve-Then-Read (all Arabic providers; optional for Gemini):** BM25
   retrieval runs **in code** (`retrieve.js` + `bm25.js`); passages are handed to
   the model in a read-only prompt and it may cite **only** the retrieved text.

**Routing** (`src/brain/route.js`): when the Arabic character ratio of a message
is high enough (~≥0.4, after stripping acronyms like VFR/IFR/METAR), `auto` routes
to the first configured Arabic provider (ALLaM by default, or `ARABIC_PROVIDER`),
otherwise Gemini. Fallback chain: Gemini ↔ first configured Arabic provider.

**Retrieval** is BM25 by default (lexical, with Arabic normalization + aviation
synonyms, corpus bundled at `src/brain/_chunks.json.gz`). Direct citations
(e.g. "Part 91, §91.155") take an exact-lookup fast path. Optionally hybrid:
dense embeddings (BGE-M3) fused with BM25, plus a cross-encoder reranker — both
OFF until their `*_BASE_URL` is set.

**Grounding** (`src/brain/grounding.js`) is the cite-or-refuse layer: extracts
citations, detects unsupported claims, classifies refusals, and shapes `sources`.
`structural` mode (regex, no network) is default; `faithfulness` mode runs a
per-claim LLM judge (opt-in).

`POST /v1/chat` response shape:
`{ answer, sources, kind, refusalClass, grounding, meta }`. Supports SSE streaming
via `?stream=1` or `Accept: text/event-stream`. The contract version is echoed as
`X-Adel-Api-Version` (currently `1`); bump only on a breaking shape change.

## Directory map

```
src/
  server.js            Express entry: routes, security headers, rate-limit + quota gating
  config.js            Env loader (NO secrets in code)
  firebase.js          Firebase Admin singleton (lazy init; ADC creds)
  middleware/
    cors.js            Origin allowlist (captadel/flygaca families + localhost)
    auth.js            Firebase ID-token verify + cached entitlement (never blocks /v1/chat)
    apikey.js          Timing-safe X-Adel-Api-Key check -> "trusted" tier
  brain/               THE BRAIN — single source of truth, shared with evals
    index.js           Public API: answer(), answerStream(), warmUp(), ratelimit, guards
    answer.js          Orchestrator: pick provider -> strategy
    route.js           Language detection + provider routing
    retrieve.js        Retrieve-then-read pipeline (BM25 + optional dense/rerank)
    bm25.js            Lexical retriever + Arabic normalization (see .gitattributes)
    embeddings.js      Dense embeddings + reranker clients (optional)
    grounding.js       Cite-or-refuse: claims, refusal classes, source shaping
    guards.js          Input validation, size caps, soft injection detection
    ratelimit.js       In-memory sliding window (IP / burst / session)
    rewrite.js         Query rewriting (follow-up resolution)
    system-prompt.js   Composed system instruction (product-neutral core)
    tenants.js         Per-product framing (captadel vs flygaca)
    providers/         gemini.js (agentic) + openai-compatible.js factory for
                       allam/jais/fanar/qwen/commandr
    tools/             Compute-only flight tools: wind, fuel, weightbalance, recency, density
    _chunks.json.gz    Bundled GACAR corpus (BM25 index source)
  quota/               Firestore-backed free-tier usage meter (fails open)
  billing/             Stripe + Firebase SaaS layer (dark until env set)
public/                Vanilla bilingual HTML/CSS/JS site (index/chat/account/console/exam)
test/                  Unit tests ({component}.test.js, node --test)
evals/                 Regression harness (cases.json, run.js, parity.js, lib.js, checks/)
scripts/               One-off scripts (build-embeddings.js)
deploy/                Dockerfile context, docker-compose.yml, deploy.sh (Cloud Run)
docs/                  models, refusal-taxonomy, data-contract, RUNBOOKs
authoring/             Source-of-truth system prompt + KB scope + Python reference (rag.py, captain_adel.py)
```

## Testing & evals

- **Unit tests** (`test/*.test.js`) use Node's built-in `node:test` + `assert`,
  run against the bundled corpus with no keys/network. Name is `{component}.test.js`
  mapping to `src/...` (e.g. `route.test.js` ↔ `src/brain/route.js`).
- **Evals** (`evals/`) are the regression gate. `cases.json` holds EN+AR cases with
  heuristic assertions; `lib.js` is shared scoring (kept identical between `run.js`
  and `parity.js` so verdicts never drift). `parity.js` gates `MODEL_PROVIDER=auto`.
  Case `expect` keys include: `citesPart`, `mustInclude`, `mustIncludeAny`,
  `mustNotInclude`, `shouldHaveSources`, `answerLang` (`ar`/`en`), `kind`
  (`grounded`/`partial`/`refusal`/`na`), optional `history`.
- **Quality bar:** every change must match-or-beat the current bar on citations,
  refusals, and injection resistance **in both English and Arabic** before shipping.
  Run `eval:dry` always; run a live `eval` / `eval:parity` when changing the brain.

## Configuration

All config comes from env (`.env`, copy from `.env.example`) via `src/config.js`.
**No secrets in code.** Key groups:

- **Provider:** `MODEL_PROVIDER` (`gemini|allam|jais|fanar|qwen|commandr|auto`),
  `ARABIC_PROVIDER`, `GEMINI_API_KEY`, `CAPTAIN_ADEL_MODEL`, and per-provider
  `<NAME>_BASE_URL` / `_MODEL` / `_API_KEY` (each OFF until its `_BASE_URL` is set).
- **Retrieval (optional):** `EMBEDDINGS_BASE_URL` / `_MODEL` / `_API_KEY`,
  `RERANK_BASE_URL` / `_MODEL` / `_API_KEY`.
- **Security/abuse:** `ADEL_API_KEY` (trusted tier), `ALLOWED_ORIGINS`,
  `ADEL_RL_IP` / `ADEL_RL_BURST` / `ADEL_RL_SESSION`, `ADEL_MAX_SOURCES`.
- **SaaS (dark by default):** `FIREBASE_PROJECT_ID`, `STRIPE_*`, `ADEL_DAILY_FREE`,
  `ADEL_DAILY_ANON`, `ADEL_FREE_PERIOD`, `ADEL_LAUNCH_MODE`, `SITE_URL`.

## Deployment & CI

- **Docker:** `node:20-slim`, `npm ci --omit=dev`, port `8787`, **≥2 GiB RAM**
  (BM25 index is resident). `deploy/deploy.sh` builds and deploys to **Google
  Cloud Run in a KSA region** (me-central2, me-central1 fallback) and pulls
  secrets from Secret Manager.
- **Firebase/Firestore:** `firebase.json`, `.firebaserc` (project `captadel-app`).
  `firestore.rules` is **blanket-deny** — the browser never opens Firestore
  directly; the Admin SDK (server) bypasses rules. Collections: `users/{uid}`
  (entitlements), `adelQuota/...` (TTL-purged usage).
- **CI** (`.github/workflows/`): `ci.yml` runs `smoke` + `test:unit` + `eval:dry`
  on push/PR (live `eval` only weekly/dispatch, gated on `GEMINI_API_KEY`).
  `deploy.yml` deploys on push to `main`, gated on `GCP_SA_KEY`; health check hits
  `/health`.

## Conventions & gotchas

- **Compliance (PDPL):** real user questions are personal data — the chat model
  must run **in-Kingdom** for production (KSA region / Kingdom box). HF/US/EU
  endpoints are fine for dev + evals only. Embeddings see only the public corpus,
  so they have no region constraint.
- **Fail-open quota:** any Firestore error → allow the request, never block.
- **Soft injection handling:** suspicious turns are **flagged** (a hardening note
  is appended to the system instruction), not rejected. `/v1/chat` never 401s on
  bad auth — it downgrades to anonymous.
- **Lazy-loaded SDKs:** `firebase-admin` and `stripe` are required only when used.
- **Keep prompts in sync:** `src/brain/system-prompt.js` (deployed) mirrors
  `authoring/captain_adel_system_prompt.md` (source of truth). `bm25.js` stopwords/
  synonyms should track `authoring/rag.py`.
- `.gitattributes` forces `src/brain/bm25.js` to diff as text (it embeds Arabic
  combining marks that trip Git's binary heuristic).
- **Shared frontend core:** helpers used by both chat and console (safe markdown,
  § cites, grounding badge, session id, bilingual error copy, SSE transport) live
  in `public/assets/js/chat-core.js` — a classic script loaded with `defer`
  **before** `chat.js`/`console.js`, tested by `test/chat-core.test.js`. Sitewide
  chrome behaviour (mobile-nav disclosure, footer year) lives in
  `public/assets/js/site.js`, loaded on every page.
- **Page chrome is intentionally copy-pasted:** the disclaimer strip, header
  (`.site-nav` incl. the `.nav-burger`), and footer are duplicated across the 5
  `public/*.html` pages — there is no build step, and a JS include would flash
  and break no-JS rendering of the disclaimer. An edit to any of these blocks
  must be applied to **all five pages**.
- **Naming:** lowercase-hyphen filenames, `camelCase` functions, `UPPER_SNAKE` env
  vars, `UPPER_CASE` module constants.

## Glossary

- **GACAR** — General Authority of Civil Aviation Regulations (the corpus).
- **GACA** — the regulator; always the authority Captain Adel defers to.
- **Retrieve-Then-Read** — retrieval runs in code; the model answers only from the
  passages it's given.
- **Parity gate** — `evals/parity.js`: a candidate provider must match-or-beat
  Gemini (esp. the Arabic subset) before `auto` will use it.
- **Tenants** — `captadel` (independent, points to gaca.gov.sa) vs `flygaca`
  (embedded in the Fly GACA library).
- **PDPL** — Saudi Personal Data Protection Law (drives in-Kingdom hosting).

## Where to read more

`README.md` (overview), `ROADMAP.md` (direction), `evals/README.md`, and
`docs/` (`models.md`, `refusal-taxonomy.md`, `data-contract.md`, the RUNBOOKs).
