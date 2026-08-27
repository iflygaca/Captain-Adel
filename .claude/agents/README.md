# Project subagents

Claude Code loads every `*.md` here as a project-scoped subagent (see
[the subagent docs](https://code.claude.com/docs/en/sub-agents)). They are
checked in so every session works from the same rules — the ones that keep an
assistant which *refuses rather than guesses* actually behaving that way.

| Agent | Use it for |
| --- | --- |
| `brain-retrieval` | `src/brain/` — day-to-day retrieval, routing, grounding, providers, tools work |
| `eval-warden` | `evals/` — running the harness, cases, scoring, Part coverage, the `auto` parity gate |
| `prompt-steward` | System prompt ↔ `authoring/` sync, exam mode, tenant voice, PDPL |
| `site-chrome` | The eight `public/*.html` pages, shared JS, the hand-maintained CSP |
| `instructor-persona-steward` | Instructor voice consistency, Saudi cultural context, persona tuning, grounding in GACAR |
| `conversion-engine-steward` | Query-to-subscription funnel, engagement metrics, retention signals, Schools channel integration |
| `brain-answer` | Answer orchestration — answer.js, route.js, rewrite.js, followups.js (pure chips) |
| `brain-grounding` | grounding.js — cite-or-refuse tiers, refusal classes, sources shaping |
| `brain-providers` | providers/ registry + thin Arabic provider modules; parity gate before `auto` |
| `brain-tools` | Compute-only flight tools, Gemini declarations lockstep, calculator deep links |
| `retrieval-quality` | BM25 tuning, Arabic normalization, hybrid dense/rerank, parent-child expansion |
| `quota-billing` | Quota metering (fail-open), Moyasar billing, entitlements, tier order, webhook ordering |
| `server-security` | CSP, CORS allowlist, rate limits, soft-injection flagging, secrets hygiene |
| `frontend-core` | chat-core.js + exam-core.js — DOM-free engines, script load order |
| `exam-surface` | exam.html + quiz.json bank — exam/practice modes, ask-Captain handoff |
| `landing-app` | landing/ Vite+React app, manual wrangler deploys, pricing-button wiring |
| `ios-adelcore` | ios/AdelCore Swift package + byte-exact SSE fixtures (compile-unverified here) |
| `eval-curator` | Growing cases.json — expect-key semantics, bilingual coverage, Part-gap analysis |
| `corpus-warden` | _chunks.json.gz integrity, GACAR-only provenance, refresh procedure |
| `pdpl-data` | Questions-are-personal-data posture, in-Kingdom inference, feedback minimality, erasure |
| `docs-runbooks` | Doc truth — CLAUDE.md accuracy, docs/ phase plans, RUNBOOKs |
| `contract-mirror` | flygaca-family.json mirrors (this repo owns NO block), superset obligation, entity-facts parity |
| `deploy-ops` | Cloud Run (≥2 GiB resident index), KSA region, CI gates, manual landing deploys |
| `observability` | Privacy-safe ops signals — refusal rates, fallback activation, fail-open events |
| `prompt-redteam` | Adversarial probes — injection EN+AR, citation fabrication, prompt leakage, tool abuse |
| `arabic-quality` | Arabic fluency/terminology, routing threshold, RTL bidi citations, Arabic eval coverage |
| `saas-growth` | Tier ladder strategy, pricing coherence with family bands, funnel specs |

**Roster note:** expanded from four to twenty-five on 2026-08-26 by founder direction. Every
agent still passes the family's earn-its-place test (`ay2m/Office`,
`06-operations-it/agent-workforce-plan.md` §2): each encodes repo-specific, non-inferable
knowledge — the corpus's noisy-PDF reality, the fail-open quota, the mirror-not-edit contract
stance, the eight-page chrome duplication, the SSE fixture byte grammar. All inherit this
README's conventions below.

What these encode that a generic agent cannot know: that the corpus is
PDF-extracted and noisy so citation shaping must degrade in tiers; that only
GACAR material may be labelled GACAR; that BM25 must keep working with no
network; that the disclaimer strip and nav are hand-duplicated across all eight
pages on purpose; that a pure-Arabic query scores no BM25 hits, so an
Arabic eval case demanding `citesPart` is asserting a property the pipeline
doesn't have; that instructor persona (warm + challenging + Saudi-culturally-aware)
is non-commoditisable and drives subscription conversion in-flow; that GACAR
grounding is the credibility mechanism and ungrounded answers break trust; that
confusion detection is an engagement signal (confusion-triggered sessions convert 2× faster);
that the query-to-subscription funnel has four gates (casual → engaged → outcome → paid);
that mock exam performance delta measures Captain Adel effectiveness; that Schools
integration (cadets under school seat grants log to cohort readiness) compounds ARR;
and that refusal handling is an opportunity to build trust, not dismiss.

## Conventions

- `name` matches the filename; lowercase and hyphens only.
- `description` says **when to delegate**, in task language. Reviewers say
  "use proactively".
- `model` is omitted so each agent inherits the session's model.
- Every agent's closing instruction is to state which gate it ran and which it
  skipped. The live eval needs `GEMINI_API_KEY`; an agent that could not run it
  must say so rather than implying the bar was met.
