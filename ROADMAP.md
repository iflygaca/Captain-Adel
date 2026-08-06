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
> current bar on `evals/` (citations, refusals, injection resistance) in **both** English and
> Arabic. New capabilities arrive with new eval cases.

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
- **Own brand, shared brain** — captadel.com has its own identity; the *persona* (the Captain
  Adel character) stays in lockstep with the Fly GACA embed, the *brain* is the single source
  of truth, and only `tenants.js` framing differs per product.

## ✅ Status today (the baseline we build on)

**Brain & API**
- [x] Standalone service (`src/server.js`): captadel.com site + `POST /v1/chat` + `GET /health`
- [x] Model-pluggable brain: **Gemini** (agentic tool-calling) + **ALLaM** (retrieve-then-read)
- [x] Lexical **BM25** retriever over the GACAR corpus (`src/brain/bm25.js`)
- [x] Optional hybrid retrieval scaffolding — dense embeddings + reranker clients
  (`embeddings.js`), **gated off** until `*_BASE_URL` is set
- [x] Product-aware system prompt (`system-prompt.js` + `tenants.js`)
- [x] Input guards + per-process rate limiter + optional server-to-server API key
- [x] Language routing (`route.js`) with cross-provider fallback + query rewriting (`rewrite.js`)
- [x] **SSE streaming** for both strategies (`answerStream()` + `chat.js` token-by-token)
- [x] **Grounding contract** end-to-end: three-state badge, inline `§` cite ↔ source lockstep,
  verbatim passages, verify actions, per-answer stamp (`grounding.js` + the chat UI)
- [x] Compute tools wired (`src/brain/tools/`: wind, fuel, weight-and-balance, recency, density)
- [x] Eval harness with `--provider`, EN + AR cases, and a parity gate (`evals/`)
- [x] Docker + vLLM runbook; Fly GACA plugs in via the gateway proxy

**Product surface (captadel.com)**
- [x] **Bilingual, Arabic-first RTL site** with a no-flash i18n engine (`i18n.js`) across
  landing, chat, exam, account, console
- [x] **2026 design system** — token scale, instrument-deck brand, and a captadel-distinct
  identity (HUD hero, "command deck" console) separate from the flygaca embed *(PR #6)*
- [x] **Mock exam** (timed, cited) and the **GACAR console** two-pane lockstep surface
- [x] 👍/👎 **feedback loop** (`/v1/feedback`, PDPL-safe) + context-aware follow-ups (`followups.js`)
- [x] Browser-native **voice** (STT dictation + TTS read-aloud) as progressive enhancement
- [x] **Accounts, billing & quota** (Firebase + Moyasar; ships dark until env is set)

---

## 🚦 Now — reliability, quality & trust (highest leverage)

### 🛠️ Reliability & infrastructure  *(new — currently the #1 blocker)*
- [ ] **Unblock CI.** GitHub Actions is failing at the **runner-allocation stage** — jobs die in
  ~2s with no logs and `runner_id: 0`, and `main` has been red since 2026-06-20 regardless of
  content. This is an **account/org-level Actions block** (spending/billing limit reached, or
  Actions disabled), **not a code failure** — every CI step passes locally
  (`smoke` · `test:coverage` 295/295 · `eval:dry`). Fix in **Settings → Billing → Actions** and
  **Settings → Actions**, then re-run. *Nothing in the codebase needs to change to go green.*
- [x] **Pin the CI install** — `npm ci` (lockfile-exact), not `npm install`, so the structure
  check is deterministic.
- [ ] **Live-eval as a gated check** — run the Gemini eval (and ALLaM when an endpoint exists)
  as a required PR check, not just `--dry` (already stubbed in `ci.yml` behind `GEMINI_API_KEY`).
- [ ] **Front-end smoke in CI** — HTML/CSS lint + dead-link/asset check + the JS↔CSS class-hook
  audit, so a markup/style regression can't ship silently.

### 🔒 Dependency & supply-chain security  *(new)*
- [ ] **Clear the 9 moderate advisories** — all transitive through `firebase-admin`
  (`uuid` / `gaxios` / `google-gax` / `@google-cloud/firestore` / `storage`). Bump
  `firebase-admin` (currently `^12.7.0`) and re-audit.
- [ ] **Add an `npm audit` / Dependabot gate** (the repo already shows 2 Dependabot alerts on
  default) so new advisories surface on PRs.
- [ ] **Secret-scanning + CSP report-uri** — catch leaked keys and CSP violations in the wild.

### 🔍 Retrieval
- [ ] **Turn on hybrid retrieval** — wire the existing dense + RRF path (`embeddings.js`),
  build the index (`npm run build:embeddings`), and ship the **cross-lingual unlock** so Arabic
  questions reach the right English GACAR passage (today pure BM25 returns nothing for Arabic).
- [ ] **Cross-encoder rerank** of the top-k before the answer step, for sharper passage choice.
- [ ] **Parent-child chunks** — expand a hit to its full section so limits/tables aren't
  truncated mid-rule (`retrieve.js` caps passages today).
- [ ] **Citation precision** — harden `citationOf`/`sectionRefOf` against mangled PDF titles
  (the "AIRCRAFTONTHEWATER" class already noted in `bm25.js`).

### 🧪 Evaluation
- [ ] **Grow the case set** — per-Part coverage, numeric-limit precision, more AR cases, an
  expanded adversarial/injection suite.
- [ ] **LLM-as-judge grader** for groundedness + citation correctness (beyond keyword heuristics).
- [ ] **Citation-faithfulness check** — verify the cited section actually contains the claimed
  text; flag/strip uncited claims post-hoc.

### 🛡️ Safety & ops
- [ ] **App Check / abuse hardening** for the public API (monitoring → enforce).
- [ ] **Distributed rate limiting** — move the per-process limiter (`ratelimit.js`) to a shared
  store (Redis/Firestore) so it holds across replicas.
- [ ] **Structured observability** — per-turn metrics (latency, tool rounds, #sources, refusal
  rate, provider used, fallbacks) + an error beacon.

---

## 🎨 Now/Next — design system & front-end  *(new track)*

The 2026 refresh (PR #6) landed the token system and captadel's own identity. Next is making
that durable and measurable.

- [ ] **Visual-regression tests** — Playwright screenshot diffs per page × {EN, AR} × {light
  states} so a CSS change can't silently break a surface. *(No headless browser in the current
  CI/runner — pairs with the "Unblock CI" item above.)*
- [ ] **Accessibility audit to WCAG 2.2 AA** — contrast on the night palette, focus order,
  screen-reader semantics for the grounding badge + `§` cite lockstep, RTL traversal, and the
  `prefers-reduced-motion` paths.
- [ ] **Performance budget** — self-host one brand font (CSP is `font-src 'self'`), preload it,
  serve the avatar as AVIF/WebP, and set a Lighthouse budget (LCP/CLS/TBT) checked in CI.
- [ ] **Design-tokens doc** — document the `--token` scale and the captadel↔flygaca identity
  rules so the look stays coherent as pages are added.
- [ ] **Finish the identity pass** — extend the HUD/instrument signature and "command deck"
  language consistently; revisit the `library.html` deep-link the refusal path references.
- [ ] **Installable PWA** — offline-friendly transcript + add-to-home-screen, within CSP.
  *(complements — does not replace — the native app: see 📱 Mobile under Next)*

---

## 🔜 Next — models, conversation & capability

### 🤖 Models
- [ ] **Promote ALLaM to production** — pinned, quantized (AWQ/GPTQ) endpoint in a KSA region;
  benchmark per-language on the eval set; flip `MODEL_PROVIDER=auto` once Arabic clears the
  parity gate.
- [ ] **LoRA/QLoRA fine-tune ALLaM** for Arabic aviation tone, the exact citation format, and
  refusal discipline (seeded from the corpus + eval set). RAG stays the source of truth.
- [ ] **Deepen multi-turn rewriting** — extend `rewrite.js` to resolve "what about at night?"
  style follow-ups and map Arabic terms to corpus vocabulary before retrieval.

### 💬 Conversation & UX
- [ ] **Richer source rendering** — inline diffs/highlights of the matched span inside the
  verbatim passage; keyboard "walk the citations" (↑↓) on chat as it already exists on console.
- [ ] **Exam ↔ chat handoff** — let a missed exam question open the cited section in chat/console.
- [ ] **Feedback → eval flywheel** — route 👎'd turns (PDPL-safe) into candidate eval cases.

### 🎓 Domain capability (a better instructor, not just a lookup)
- [ ] **Show the working** — surface the compute tools' steps (E6B, W&B, fuel, VFR minima) in
  the answer, not just the result.
- [ ] **Scenario / oral-exam coach** — structured checkride prep and lesson plans (the chat
  exam-mode seed already exists).
- [ ] **"What changed" digests** — surface regulation changes proactively per Part / GACAR version.
- [ ] **AIP-KSA + charts** in the corpus, with the same citation discipline.

### 📱 Mobile — native iOS app  *(new track)*

The plan is [`docs/ios-app-plan.md`](docs/ios-app-plan.md) (mockups:
[`ios-chat.html`](docs/mockups/ios-chat.html) · [`ios-exam.html`](docs/mockups/ios-exam.html)).
v1 is a pure client of the existing `/v1/*` API — **zero server changes**; the SwiftUI build
happens in Xcode, in its own repo.

- [x] **iOS app plan + mockups** — scope, SwiftUI architecture, API-binding tables and the
  App Store gates in `docs/ios-app-plan.md`, with phone-frame mockups in `docs/mockups/`.
- [ ] **Phase 0 spike** — a `URLSession` SSE parser for the POST `token/reset/final` frames
  (`src/brain/answer.js`) + one streamed `/v1/chat` turn, on TestFlight.
- [ ] **v1 — chat + mock exam** — port `chat-core.js`/`exam-core.js` semantics to Swift
  (allow-list markdown, `§` cite chips, grounding badge, shuffles, resume snapshots), bundle
  `quiz.json` for offline exams; optional email sign-in honours web Pro read-only via `/v1/me`.
- [ ] **v1.x — accounts** — Google + Sign in with Apple and in-app account creation, plus the
  account-deletion endpoint Apple then requires (the one new backend route before billing).
- [ ] **v2 — StoreKit 2 billing** — in-app subscription per guideline 3.1.1, settled by a new
  server route writing the same entitlement shape as Moyasar (`store: 'APPSTORE'`,
  `src/billing/entitlements-core.js`).

---

## 🌅 Later — Captain Adel as a platform

- [ ] **Public multi-tenant API** — API keys, per-tenant rate tiers, usage metering, OpenAPI docs.
  The `X-Adel-Api-Key` trusted tier is the seed.
- [ ] **Embeddable widget / SDK** so any site (beyond Fly GACA) can drop Captain Adel in.
- [ ] **Voice, leveled up** — Saudi-accented English + Khaleeji Arabic TTS/STT beyond the
  browser-native baseline.
- [ ] **Personalization** (opt-in) — tailor to a pilot's licence level and currency; tie into
  the Fly GACA logbook.
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
| p50 / p95 latency | Especially with streaming + ALLaM |
| Provider mix & fallback rate | Health of Gemini vs ALLaM routing |
| Cost per 1k answers | Sustainability of the free educational tier |
| CI green rate / time-to-green | Are changes shippable? (the runner block is the current floor) |
| Lighthouse + a11y score (EN/AR) | The product surface stays fast and accessible |

## 🤝 How we ship a change

1. Make the change behind the brain interface (`src/brain/`) — or, for the surface, behind the
   preserved JS class/`data-*` hooks the renderers depend on.
2. Add or update eval cases (brain) / visual-regression + a11y checks (front-end) that capture
   the intended behaviour.
3. Run `node evals/run.js` (and `--provider allam` when relevant); compare against baseline.
4. Open a PR; CI runs the structure check (and live eval where a key is set).
5. Merge on green. Roll model/routing changes out behind `MODEL_PROVIDER` first.

> See [`README.md`](README.md) for the architecture and [`deploy/allam-vllm.md`](deploy/allam-vllm.md)
> for serving ALLaM.
