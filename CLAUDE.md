# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is

**Captain Adel** is an independent, educational AI flight instructor for Saudi
civil aviation (captadel.com). It answers **GACAR** (General Authority of Civil
Aviation Regulations) questions with exact Part/section citations, and refuses to
guess when it can't ground an answer in the regulations.

Two surfaces live here. The **captadel.com landing** is a separate static
Vite + React app in `landing/` (EN at `/`, AR at `/ar/`), served by the
Cloudflare Worker `captadel` and deployed **manually** (`landing/README.md`
has the wrangler runbook — no CI deploy, on purpose). Everything below is the
second surface: one **Node.js 20 + Express** service that serves both:

- the static **app pages** (`public/` — chat, exam, account, console,
  checkout, legal), and
- the API: `GET /health`, `POST /v1/chat`, `POST /v1/feedback` (thumbs rating —
  logs only `{rating, turnId, provider, ts}`, never the question or answer), the
  `/v1/me` + `/v1/config` + `/v1/billing/*` SaaS routes plus
  `POST /v1/account/delete` (the webhook mounts
  `express.raw` **before** the global `express.json` — ordering is load-bearing),
  and a `/.well-known` static mount (`dotfiles: 'allow'`) for Apple Pay domain
  verification.

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
| `npm run smoke:frontend` | Static audit of `public/*.html` (`scripts/frontend-smoke.js`): local asset + internal-link resolution, the hand-duplicated `.disclaimer-strip`/`.site-nav` chrome and the `#site-footer` mount on all 8 pages, script load order (`chat-core.js` before its consumers, `footer.js` before `i18n.js`, `type="module"` on the ES-module scripts), and JS→DOM hooks. Deterministic, no deps/network. CI-safe. |
| `npm run test:unit` | Unit tests: `node --test test/*.test.js`. Deterministic, **no API keys / no network**. |
| `npm run test:coverage` | Same suite with `--experimental-test-coverage` (report-only, never fails the build). What `ci.yml`'s `build` job actually runs. |
| `npm run eval:dry` | Validate `evals/cases.json` structure only, no model calls. CI-safe. |
| `npm run eval` | Full regression suite against the live brain. Needs `GEMINI_API_KEY`. |
| `npm run eval:allam` / `:jais` / `:fanar` / `:qwen` / `:commandr` | Eval a specific provider (needs that endpoint configured). |
| `npm run eval:parity` (vs. ALLaM) / `:jais` / `:fanar` / `:qwen` / `:commandr` | Compare Gemini vs. a candidate; **gates `MODEL_PROVIDER=auto`**. There is no `:allam` variant — bare `eval:parity` already defaults to ALLaM. |
| `npm run provider:smoke`, `allam:smoke`, `jais:smoke` | One-turn connectivity checks for an endpoint. |
| `npm run build:embeddings` | One-off: build the dense index. Needs `EMBEDDINGS_BASE_URL`. Writes `src/brain/_embeddings.json.gz`. Never run at request time or in CI. |
| `npm run fixtures:sse` | One-off: regenerate the iOS SSE wire fixtures (in-process server + stubbed providers; deterministic, no keys/network). Committed output is guarded by `test/sse-fixtures.test.js`; never runs in CI. |

There is **no eslint/prettier/editorconfig** — style is maintained by convention
and review only. Match the surrounding code.

Before pushing: run
`npm run smoke && npm run smoke:frontend && npm run test:unit && npm run eval:dry`
(what `deploy.yml`'s gate runs without secrets; `ci.yml`'s `build` job runs the
same tests via `test:coverage` instead, for the report-only coverage table).

## Architecture

Request flow: `src/server.js` (Express, security headers, CORS, rate limit,
quota) → `src/brain/index.js` (`answer()` / `answerStream()` / `warmUp()`).

The brain has **two answer strategies**, chosen by provider:

1. **Agentic (Gemini, default English path):** the model drives its own tool
   calls — `search_library`, `lookup_citation`, `list_changes`, plus
   flight-computer tools in `src/brain/tools/` — and is responsible for its own
   citations.
2. **Retrieve-Then-Read (all Arabic providers; optional for Gemini):** BM25
   retrieval runs **in code** (`retrieve.js` + `bm25.js`); passages are handed to
   the model in a read-only prompt and it may cite **only** the retrieved text.

**Routing** (`src/brain/route.js`): when the Arabic character ratio of a message
is high enough (~≥0.4, after stripping acronyms like VFR/IFR/METAR), `auto` routes
to the first configured Arabic provider (ALLaM by default, or `ARABIC_PROVIDER`),
otherwise Gemini. Fallback chain: Gemini ↔ first configured Arabic provider.

**Retrieval** is BM25 by default (lexical, with Arabic normalization + aviation
synonyms, corpus bundled at `src/brain/_chunks.json.gz`). Direct citations
(e.g. "Part 91, §91.155") take an exact-lookup fast path. **Parent-child
expansion** (ON by default, `ADEL_PARENT_CHILD=off` reverts): the top hits are
widened from their ~1200-char chunk to the full GACAR section (capped at 4000
chars) so the model reads whole rules (`retrieve.js`). Optionally hybrid:
dense embeddings (BGE-M3) fused with BM25, plus a cross-encoder reranker — both
OFF until their `*_BASE_URL` is set.

**Grounding** (`src/brain/grounding.js`) is the cite-or-refuse layer: extracts
citations, detects unsupported claims, classifies refusals, and shapes `sources`.
`structural` mode (regex, no network) is default; `ADEL_GROUNDING=faithfulness`
runs a per-claim LLM judge (opt-in).

**Exam mode:** `POST /v1/chat` accepts `mode: 'exam'`, which swaps in
`EXAM_MODE_NOTE` (`system-prompt.js`) so Captain Adel runs a GACA-style **oral
checkride examination** (examiner/candidate framing) in the chat UI.

**Mock-exam / practice page** (`public/exam.html`) is a separate surface over the
static bank at `public/assets/data/quiz.json` (13 banks; exam length/time/pass
mark come from the file's `exam` block). Its logic splits like the chat client:
`assets/js/exam-core.js` is the DOM-free engine (question selection with seeded
shuffles, option-order randomisation with answer remap, scoring, weakest-first
topic breakdown, resume-snapshot validation, and the bilingual Captain-Adel
prompt builders — unit-tested by `test/exam-core.test.js`, the second
frontend file mapped outside `src/`), and `assets/js/exam.js` is the pure-DOM UI
(timed **exam** mode + topic-filtered untimed **practice** mode, a question-
palette navigator, flags, review-before-submit, sessionStorage resume, and a
per-topic result breakdown). Every reviewed question can be handed to **Captain
Adel** for a grounded explanation — `buildAskPrompt` → `/v1/chat` streamed
inline through `chat-core.js` (so `exam.html` now loads `chat-core.js` before
`exam-core.js`/`exam.js`) — plus a one-tap post-exam debrief to `chat.html?q=`.

`POST /v1/chat` response shape:
`{ answer, sources, kind, refusalClass, grounding, suggestions, meta }` —
`suggestions` (`src/brain/followups.js`) are the chat UI's "keep exploring"
chips, derived from the Parts just cited (falling back to a curated generic
set); pure/deterministic, no extra model call. `meta` is
`{ provider, model, rewrittenQuery, toolCalls }` — `toolCalls` are worked
compute-tool calls the UI renders as steps with a deep link to the matching
Fly GACA calculator. Supports SSE streaming via `?stream=1` or
`Accept: text/event-stream`. The contract version is echoed as
`X-Adel-Api-Version` (currently `1`); bump only on a breaking shape change.
Metered turns also carry `X-Adel-Quota-Remaining`, and both 429 (rate limit)
and 402 (quota) responses set `Retry-After`.

## Directory map

```
landing/               captadel.com landing (Vite + React + Tailwind, EN + /ar/) —
                       built dist/ served by the Cloudflare Worker "captadel";
                       manual deploy via wrangler (landing/README.md runbook)
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
    rewrite.js         Retrieval-query rewriting for follow-ups (ADEL_REWRITE)
    followups.js       "Keep exploring" chip suggestions (Part-aware, pure)
    history.js         Conversation-history normalization (shared leaf module)
    system-prompt.js   Composed system instruction (product-neutral core)
    tenants.js         Per-product framing (captadel vs flygaca)
    providers/         index.js (registry: PROVIDERS + the ARABIC_PROVIDERS preference
                       order that drives auto-routing/fallback), gemini.js (agentic),
                       openai-compatible.js factory + thin allam/jais/fanar/qwen/commandr modules
    tools/             Compute-only flight tools: wind, fuel, weightbalance, recency,
                       density; index.js = registry + the Gemini function declarations
    _chunks.json.gz    Bundled GACAR corpus (BM25 index source)
  quota/               Firestore-backed free-tier usage meter (fails open)
    quota-core.js      Pure KSA-calendar period math (UTC+3, day or month window)
    quota.js           The Firestore counter that consumes those stamps
  billing/             Moyasar + Firebase SaaS layer (dark until env set) — same
                       core/wrapper split as the brain:
    moyasar-core.js    Pure pricing/renewal math (ported from Fly GACA's billing-core.ts)
    entitlements-core.js  Pure entitlement mutators ({plan, source, startedAt, expiresAt})
    entitlements.js    The ONLY writer of users/{uid}.entitlement (Admin SDK, transactional)
    tier-core.js       Caller tier resolution, order load-bearing:
                       trusted (X-Adel-Api-Key) -> launch (ADEL_LAUNCH_MODE=free)
                       -> pro (live entitlement) -> free (metered)
    routes.js          Thin Express router: /v1/billing/*, /v1/me, /v1/config,
                       /v1/account/delete (mounted under /v1 in server.js)
public/                Vanilla bilingual HTML/CSS/JS site (index/chat/account/console/
                       checkout/exam/privacy/terms — 8 pages), plus assets/js (16 files;
                       exam.js + exam-core.js are the mock-exam pair, chat-core.js is
                       shared by chat/console/exam, and landing.js + boot-inline.js are
                       index.html-only), assets/css,
                       assets/data/quiz.json (the exam bank), assets/img/captain/,
                       and .well-known/ (Apple Pay)
test/                  Unit tests ({component}.test.js, node --test)
evals/                 Regression harness (cases.json, run.js, parity.js, lib.js, checks/)
scripts/               One-off scripts (build-embeddings.js, record-sse-fixtures.js)
deploy/                docker-compose.yml, deploy.sh (Cloud Run), allam-vllm.md (vLLM GPU
                       endpoint runbook) — the Dockerfile itself lives at the repo root
docs/                  models, refusal-taxonomy, data-contract, ios-app-plan, multi-agent-orchestrator,
                       brand-audit-2026-08, the RUNBOOKs (arabic-provider, captadel-deploy,
                       captadel-saas), mockups/
examples/              Runnable reference code, decoupled from src/ — multi-agent-orchestrator/ is the
                       Claude API orchestrator–worker boilerplate (Python + TS, own package.json)
ios/                   AdelCore local Swift package (AdelAPI + AdelSSE) — the Phase-0 iOS spike;
                       compile-unverified here (no Swift toolchain), see ios/README.md; wire
                       fixtures live in AdelCore/Tests/AdelSSETests/Fixtures/
authoring/             Source-of-truth system prompt + KB scope + Python reference (rag.py, captain_adel.py)
.claude/               Claude Code tooling (not shipped): skills/diagram-design/ — vendored MIT
                       editorial-diagram skill, skinned to the Captain Adel palette — plus its
                       /export-diagram, /import-drawio, /import-mermaid commands. Provenance and
                       the local skin delta: .claude/skills/THIRD_PARTY_NOTICES.md.
                       agents/ defines four subagents scoped to this repo —
                       brain-retrieval (src/brain), eval-warden (evals/),
                       prompt-steward (system-prompt/tenants/authoring) and
                       site-chrome (public/*.html + the CSP); agents/README.md
                       explains when each is the right one. settings.json holds the
                       repo's Claude Code settings.
```

Diagrams from that skill are **documentation artifacts** for `docs/` — they are never served by
`src/server.js` or referenced from `public/`, so the hand-maintained CSP needs no entry for the
Google Fonts CDN their templates load. Moving a diagram under `public/` would require a CSP edit
first. In the diagram palette, gold is the accent and teal is links/focus only — never use teal to
signal a grounded or verified answer, mirroring `public/assets/css/adel.css`.

## Testing & evals

- **Unit tests** (`test/*.test.js`, 43 files) use Node's built-in `node:test` +
  `assert`, run against the bundled corpus with no keys/network.
  `{component}.test.js` maps to a `src/` module (e.g. `route.test.js` ↔
  `src/brain/route.js`); larger modules split by aspect (`answer-stream`,
  `embeddings-dense`, `providers-env-wiring`, `billing-handlers`), a few are
  behaviour-scoped (`server-chat`, `version-header`, `wellknown`), and a couple
  cover non-`src/` code (`chat-core` → `public/assets/js/chat-core.js`,
  `evals-lib` → `evals/lib.js`, `sse-fixtures` → the iOS wire fixtures under `ios/`).
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

All config comes from env (`.env`, copy from `.env.example`). **No secrets in
code.** `src/config.js` loads the service-level config (port, provider default,
keys, origins, SaaS); the brain's own tuning vars are read directly from
`process.env` at their call site so tests/evals can flip them without a module
reload. `.env.example` covers the service + provider + SaaS vars; the brain's
advanced switches (`ADEL_REWRITE*`, `ADEL_GROUNDING`, `ADEL_PARENT_CHILD`,
`MAX_BODY_BYTES`) are documented only in their module headers. Key groups:

> ⚠️ `.env.example` is committed and is meant to hold **placeholders only**. It currently ships a
> real-looking `GEMINI_API_KEY` value (added in `75e6003`); that key should be rotated and the line
> blanked. Never paste a live credential into it — put it in `.env` (gitignored) or Secret Manager.

- **Service:** `PORT` (default 8787), `MAX_BODY_BYTES` (default 64 KiB → 413).
- **Provider:** `MODEL_PROVIDER` (`gemini|allam|jais|fanar|qwen|commandr|auto`),
  `ARABIC_PROVIDER`, `GEMINI_API_KEY`, `CAPTAIN_ADEL_MODEL`, `ADEL_GEMINI_TIMEOUT_MS`
  (default 60000), and per-provider `<NAME>_BASE_URL` / `_MODEL` / `_API_KEY`
  (each OFF until its `_BASE_URL` is set).
- **Retrieval (optional):** `EMBEDDINGS_BASE_URL` / `_MODEL` / `_API_KEY`,
  `RERANK_BASE_URL` / `_MODEL` / `_API_KEY`, `ADEL_PARENT_CHILD` (`on|off`,
  default `on`), `ADEL_REWRITE`
  (`heuristic|llm|off`, default `heuristic`) + `ADEL_REWRITE_MODEL` — retrieval-query
  rewriting for follow-ups (`rewrite.js`).
- **Grounding:** `ADEL_GROUNDING` (`structural` default | `faithfulness`).
- **Security/abuse:** `ADEL_API_KEY` (trusted tier), `ALLOWED_ORIGINS`,
  `ADEL_RL_IP` / `ADEL_RL_BURST` / `ADEL_RL_SESSION`, `ADEL_MAX_SOURCES`.
- **SaaS (dark by default):** `FIREBASE_PROJECT_ID` (falls back to
  `GOOGLE_CLOUD_PROJECT` on Cloud Run), `MOYASAR_*`, `CRON_SECRET`, `ADEL_DAILY_FREE`,
  `ADEL_DAILY_ANON`, `ADEL_FREE_PERIOD`, `ADEL_LAUNCH_MODE`, `SITE_URL`.

## Deployment & CI

- **Docker:** `node:20-slim`, `npm ci --omit=dev`, port `8787`, **≥2 GiB RAM**
  (BM25 index is resident). `deploy/deploy.sh` builds and deploys to **Google
  Cloud Run in a KSA region** (me-central2, me-central1 fallback) and pulls
  secrets from Secret Manager.
- **Firebase/Firestore:** `firebase.json`, `.firebaserc` (project `captadel-app`).
  `firestore.rules` is **blanket-deny** — the browser never opens Firestore
  directly; the Admin SDK (server) bypasses rules. Collections: `users/{uid}`
  (entitlements), `subscriptions/{uid}` + `moyasarCustomers/{uid}` +
  `checkoutIntents/{uuid}` + `moyasarPayments/{paymentId}` (billing), and
  `adelQuota/...` (TTL-purged usage). `POST /v1/account/delete` erases the
  uid-keyed set (payment markers are tombstoned, not deleted — webhook-replay guard).
- **CI** (`.github/workflows/`, two files): `ci.yml`'s `build` job runs `smoke` +
  `smoke:frontend` + `test:coverage` + `eval:dry` on push/PR, then a report-only
  `npm audit --omit=dev` (live `eval` is a separate job, weekly/dispatch, gated on
  `GEMINI_API_KEY`). `deploy.yml` re-runs `smoke` + `smoke:frontend` + `test:unit` +
  `eval:dry` as its gate, then deploys on push to `main` (gated on `GCP_SA_KEY`),
  health-checks `/health`, and optionally posts the result to Slack
  (`SLACK_WEBHOOK_URL`, dark until set). The landing app in `landing/` is **not**
  in either workflow — it deploys by hand via wrangler.

## Conventions & gotchas

- **Compliance (PDPL):** real user questions are personal data — the chat model
  must run **in-Kingdom** for production (KSA region / Kingdom box). HF/US/EU
  endpoints are fine for dev + evals only. Embeddings see only the public corpus,
  so they have no region constraint.
- **Fail-open quota:** any Firestore error → allow the request, never block.
- **Soft injection handling:** suspicious turns are **flagged** (a hardening note
  is appended to the system instruction), not rejected. `/v1/chat` never 401s on
  bad auth — it downgrades to anonymous.
- **Lazy-loaded SDKs:** `firebase-admin` is required only when used. Moyasar has no SDK — billing calls `https://api.moyasar.com/v1` with `fetch` + Basic auth.
- **Keep prompts in sync:** `src/brain/system-prompt.js` (deployed) mirrors
  `authoring/captain_adel_system_prompt.md` (source of truth). `bm25.js` stopwords/
  synonyms should track `authoring/rag.py`.
- `.gitattributes` forces `src/brain/bm25.js` to diff as text (it embeds Arabic
  combining marks that trip Git's binary heuristic), and marks `*.sse` fixtures
  `-text` so EOL conversion can never corrupt their byte-exact frame grammar.
- **Shared frontend core:** helpers used by chat, console and the exam page (safe
  markdown, § cites, grounding badge, session id, bilingual error copy, SSE
  transport) live in `public/assets/js/chat-core.js` — a classic script loaded
  with `defer` **before** `chat.js`/`console.js`/`exam.js`, tested by
  `test/chat-core.test.js`. Chrome
  behaviour (mobile-nav disclosure, footer year) lives in
  `public/assets/js/site.js`, loaded on the five full-chrome pages
  (index/chat/console/account/exam) — checkout/privacy/terms omit it.
  `i18n.js` **is** truly sitewide (all 8 pages): Arabic-first authoring — visible
  markup is written in Arabic with `data-en`/`data-ph-en` alternates — persisting
  to `localStorage['captadel:lang']` and broadcasting `captadel:langchange`.
  The animated Captain (`adel-character.js`/`.css`, chat page only) is a layered
  SVG driven by `data-state`, decoupled from chat via an `adel:state`
  CustomEvent so chat still works if it's absent. Auth/billing frontend
  (`auth.js`, `firebase-config.js`, `billing.js`, `checkout.js`, `account.js`,
  `boot-inline.js`) are ES modules (`type="module"`), unlike the classic `defer`
  chrome scripts. The landing page owns two of its own: `landing.js` (classic,
  after `site.js` — scroll-reveal + pointer spotlight, both no-ops under
  `prefers-reduced-motion` or without IntersectionObserver) and `boot-inline.js`
  (module — wires the `#pricing [data-plan]` buttons to `startProCheckout`).
  `npm run smoke:frontend` is what keeps this load order honest.
- **Page chrome — disclaimer strip and header are copy-pasted, footer is not:**
  the `.disclaimer-strip` and the `.site-nav` header are hand-duplicated across
  all 8 `public/*.html` pages — there is no build step, and a JS include would
  flash and break no-JS rendering of the disclaimer. An edit to either block
  must be applied to **all eight pages**. The `.nav-burger` (and the `site.js`
  that drives it) exists only on the five full-nav pages —
  checkout/privacy/terms ship a reduced, burger-less header. The footer is the
  one exception: `public/assets/js/footer.js` (loaded `defer`, before `i18n.js`)
  renders the single canonical footer into `<div id="site-footer">` on every
  page — edit it there, not per-page. Pages that are app surfaces mark the mount
  `data-compact` for the short identity-only variant.
- **The CSP is tight and hand-maintained** (`src/server.js`): any new
  third-party asset needs an explicit CSP edit. Deliberate exceptions:
  gstatic/apis.google.com (Firebase Auth) and cdn/api.moyasar.com (SAQ-A card
  entry + 3-D Secure frames).
- **License:** proprietary — `LICENSE` is all-rights-reserved (BDA Company
  International), `package.json` says `"license": "UNLICENSED"`.
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

> 📖 **Family context:** [The Book of Fly GACA](https://github.com/ay2m/FlyGACA/blob/main/THE-BOOK-OF-FLY-GACA.md) is the whole-family reference — all ten repos, the shared tenets, and the glossary in one place.

`README.md` (overview), `ROADMAP.md` (direction), `evals/README.md`, and
`docs/` (`models.md`, `refusal-taxonomy.md`, `data-contract.md`, `ios-app-plan.md`,
`multi-agent-orchestrator.md`, the RUNBOOKs).
