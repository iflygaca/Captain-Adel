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
- [x] **Dependabot + `npm audit` (report-only) gate** — `.github/dependabot.yml` + `ci.yml`'s
  report-only `npm audit` step are live; 7 Dependabot PRs are open (#32–#38), including the
  `express` 4→5 and `firebase-admin` 12→14 majors.
- [ ] **Burn down the alert backlog** — `main` currently carries **43 open alerts (27 high, 15
  moderate, 1 low)**, up from the 9 moderate this roadmap previously tracked. Triage monthly —
  decide the two majors rather than letting them queue. This is also the prerequisite for the
  "make the repo public" decision in the 🪧 Brand & public presence track.
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
- [ ] **Multi-agent eval-case drafting** — a `claude-sonnet-5`-lead/`claude-haiku-4-5`-worker swarm
  grounds itself in real `retrieve()` hits and drafts candidate cases for human review, targeting
  GACAR Parts with zero coverage today (only 91/61/67 have any `citesPart` cases). Built and
  structurally verified in `evals/gen-cases/`; a live run to confirm real drafting quality is
  still pending. See `docs/multi-agent-orchestrator.md`.

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

## 🪧 Now/Next — brand & public presence  *(new track)*

A presentation audit across GitHub, captadel.com, and Hugging Face
([`docs/brand-audit-2026-08.md`](docs/brand-audit-2026-08.md), Aug 2026) found the repo's
internals (README, evals, CI) ahead of every public-facing surface — developers and pilots hit
dead links and empty scaffolds everywhere the actual quality lives. Full findings, a scorecard,
and copy-paste templates are in the audit doc; this track sequences its action items.

**Quick (≤1h each, do first — unblocks everything below):**
- [ ] **Fix the Hugging Face Space** (`flygaca/captain-adel`) — declares `app_file: app.py`
  with no `app.py` in the repo, so visitors hit an error state. Switch to `sdk: static` with a
  branded placeholder linking to captadel.com, or make it private.
- [ ] **Publish `evals/cases.json` to the empty `flygaca/gacar-assistant-evals` dataset** — 83
  bilingual eval cases as JSONL, with a real card (schema, license, "every change is eval-gated
  in both languages"). Self-authored and the strongest public proof of rigor available today.
- [ ] **Broken-link sweep** — the HF model card links to `github.com/FlyGACA/flygaca` (404); the
  landing footer + JSON-LD `sameAs` link to this private repo and to `ay2m/FlyGACA` (not
  public). Point every public surface at things that actually resolve for a logged-out visitor.
- [ ] **`og:image` + `twitter:card`** on all 8 `public/*.html` pages (none has one today —
  shared chat/exam links render as bare text).
- [ ] **GitHub presentation pass** — org profile README, pin `FlyGACA-app` + `FlyGACA-ios`,
  add `SECURITY.md` (this service takes payments — give researchers a disclosure channel) and
  `CONTRIBUTING.md` stating the source-visible/proprietary posture, delete the README's stale
  "Promotion to its own repo" section (see the `Later` item below — that split is done).
- [ ] **Verify production routing** — confirm `captadel.com/chat.html` actually reaches the app
  and not the landing Worker's SPA fallback (`landing/worker/index.js` falls back to the
  language shell for any path it doesn't recognize).

**Strategic (bigger decisions, sequence after the above):**
- [ ] **Decide the public face of the code** — make this repo public as source-visible
  proprietary (the license already forbids reuse); or keep it private behind a public showcase
  repo; or extract the eval harness / `exam-core.js` / the provider factory into a small public
  MIT repo. Gated on clearing the Dependabot alert backlog (🔒 Dependency & supply-chain
  security track) — a reviewer's first impression of a newly-public repo is its alert count.
- [ ] **Make Hugging Face real** — publish the Gemini-vs-Arabic-provider parity results as a
  dataset + writeup (bilingual aviation-RAG evals are content nobody else has), then a CaptAdel
  v0.1 embeddings release (scaffolding already exists: `embeddings.js`, `build:embeddings`,
  BGE-M3), then rebuild the Space as a thin Gradio client on `/v1/chat`.
- [ ] **One brand system, one human** — a naming matrix (Captain Adel / CaptAdel / Fly GACA /
  BDA Company International), one public email per brand, full pairwise cross-linking across
  surfaces, and a persona-vs-person decision — `linkedin.com/in/captadel` is currently linked
  from nowhere.
- [ ] **SERP hygiene** — a legacy-URL map in the landing Worker (301/410 the pre-relaunch
  `/News/…` and `/gacar-part-*` paths Google still indexes instead of serving them a 200),
  register both domains in Search Console.

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
  *(in-repo half landed: the `ios/AdelCore` parser package + CI-verified wire fixtures;
  the remaining leg is Xcode + TestFlight per `ios/README.md`)*
- [ ] **v1 — chat + mock exam** — port `chat-core.js`/`exam-core.js` semantics to Swift
  (allow-list markdown, `§` cite chips, grounding badge, shuffles, resume snapshots), bundle
  `quiz.json` for offline exams; optional email sign-in honours web Pro read-only via `/v1/me`.
- [ ] **v1.x — accounts** — Google + Sign in with Apple and in-app account creation, plus the
  account-deletion endpoint Apple then requires (landed: `POST /v1/account/delete` —
  the client wiring is what remains).
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
- [x] **Promoted to the standalone repo** — done; this repo (`FlyGACA/Captain-Adel`, created
  June 2026) is the result of that split. The README's now-stale "Promotion to its own repo"
  runbook section is cleaned up as part of the 🪧 Brand & public presence pass above.

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
