# `captain-adel-service` — flight-service plugin

A Claude Code plugin that packages the operating knowledge of
`ay2m/Captain-Adel` — the curriculum surface, provider operations, the data
layer under the brain, and the deployment path — as agents and commands.

It is distributed through the family marketplace in
[`ay2m/Office`](https://github.com/ay2m/Office), which points at this directory
with a `git-subdir` source.

## Install

```
/plugin marketplace add ay2m/Office
/plugin install captain-adel-service@flygaca-family
```

## What's in it

**Agents:**

| Agent | Owns |
| --- | --- |
| `curriculum-author` | `public/assets/data/quiz.json`, `exam-core.js`, the practice/exam surface |
| `model-ops` | The providers registry, Arabic routing and fallback, the parity gate that guards `MODEL_PROVIDER=auto` |
| `corpus-data` | `_chunks.json.gz`, the optional dense index, chunk shape, eval cases and training pairs |
| `deploy-runner` | Dockerfile, `deploy/deploy.sh`, Secret Manager, the two workflows, Firestore rules, the separately-deployed landing app |

**Commands** (namespaced `/captain-adel-service:<name>` once installed):

| Command | Does |
| --- | --- |
| `/gate` | The pre-push gate exactly as CI runs it, with what each check actually catches |
| `/eval-parity` | The parity gate, and how to read it — the Arabic subset decides |
| `/provider-smoke` | One-turn connectivity check, and the config to check first when it fails |
| `/deploy-check` | Pre-deploy checklist: gate, secrets, region, resources, contract, health |
| `/instructor-launch` | Sequences a curriculum change — corpus → curriculum → persona → learner data → gate |

**Skills** (procedures the agents defer to; loaded on demand):

| Skill | Covers |
| --- | --- |
| `aviation-pedagogy` | The `quiz.json` shape, what makes a question shippable, what `exam-core` actually does, and which pedagogy claims are implemented |
| `flight-instructor-personas` | The tenant/body split, exam-mode framing, the GACA-relationship wording, bilingual testing |
| `pdpl-learner-data` | The collections, the ordered erasure path and why markers are tombstoned, fail-open quota, residency stated honestly |
| `captadel-deployment` | The gate as CI runs it, image sizing, secrets, region, the hand-maintained CSP, what sits outside the workflows |

## What it deliberately does not duplicate

The four project subagents in `.claude/agents/` — `brain-retrieval`,
`eval-warden`, `prompt-steward`, `site-chrome` — stay project-scoped. Claude
Code loads them automatically for sessions in this checkout, and they cover
`src/brain/`, `evals/`, the system prompt and the eight public pages. The
plugin's four agents cover the surfaces those do not: curriculum, provider
operations, the data layer, and deployment.

The plugin's skills carry **procedures**; its agents carry **role context**.
Where both touch a subject the skill states the steps and defers the "why it is
shaped this way" to the named agent, so the two cannot drift into two accounts
of one thing.

There is deliberately **no `personalization-tuning` command**. The Phase 2 plan
listed one for a learner-feedback → model-improvement loop, but confusion
detection, mastery gating and the spaced-repetition schedule do not exist in
this repo — see `aviation-pedagogy`. A command driving machinery that isn't
there would be fiction.

The vendored skills under `.claude/skills/` (the diagram-design skin and the
eight cybersecurity skills) likewise stay where they are — see
`.claude/skills/THIRD_PARTY_NOTICES.md` for their provenance and guardrails.

## Editing it

Front-matter `name` matches the filename; `description` is written in task
language so delegation is obvious; `model` is omitted so agents inherit the
session's. Every agent closes by stating which gate it ran and which it
skipped — the live eval needs `GEMINI_API_KEY`, and an agent that could not run
it must say so rather than let `eval:dry` stand in.

`CLAUDE.md` at the repo root is the authority. Note in particular that this
brain does **not** power Fly GACA today: the two are parallel implementations of
one contract, and no prose here may describe them as one brain.
