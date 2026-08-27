---
description: Ship a curriculum change end to end — content, retrieval, persona, then the deploy gate — in the order that catches problems earliest
argument-hint: <change-name> [content-only|brain|full]
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

Ship `$1` at scope `$2` (default `full`). This is the repo-local sequencing
command. A change that also lands in `ay2m/Office` or `ay2m/FlyGACA` is a
family-level workflow — install `family-orchestrators` and use `/feature-ship`,
then use this for the Captain Adel half.

Work outward from the corpus. Retrieval bounds what the instructor can honestly
say, so settling content last means re-testing everything above it.

## 1. Corpus and retrieval (skip unless `brain` or `full`)

If the change touches what can be retrieved — chunk shape, the index, the
synonym list — follow `corpus-data`. Regenerate, then **prove it**: report the
chunk count and index size, and re-run the evals rather than reasoning about the
effect.

Remember BM25 stays the default and stays offline. A change that makes the
lexical path need a network call is a regression however good the numbers look.

## 2. Curriculum (skip if `brain`)

Follow the `aviation-pedagogy` skill. Every `explain` cites its Part and
section, `answer` stays a 0-based index, questions stay inside their bank's
`source` Part, and Arabic ships with English.

Do not introduce copy implying a mastery gate, spaced-repetition schedule or
confusion detection — none of those exist in this repo, whatever `CLAUDE.md`'s
pedagogy section describes.

## 3. Persona and exam framing (skip if `content-only`)

Follow `flight-instructor-personas`. Product-neutral wording goes in
`system-prompt.js`; identity and library-pointer wording goes in `tenants.js`.
Exam-mode changes alter how a checkride rehearsal grades — coordinate rather
than editing scoring language alone.

## 4. Learner data (only if the change stores something)

Follow `pdpl-learner-data`. A new uid-keyed collection or field needs its step
in the ordered `POST /v1/account/delete` path **in the same change**, and
payment markers stay tombstoned rather than deleted.

## 5. Prove it in both languages

```bash
npm run test:unit
npm run eval:dry
npm run eval          # live — needs GEMINI_API_KEY
```

Then exercise the change on a real question in **English and Arabic** and paste
the citations you got back. The Arabic subset is what the parity gate weighs
most, and a pure-Arabic query behaves differently in BM25.

## 6. The deploy gate

Follow `captadel-deployment`:

```bash
npm run smoke && npm run smoke:frontend && npm run test:unit && npm run eval:dry
```

## Reporting

Finish with a table: step · touched? · gate · result. State the numbers your run
produced (questions changed, chunk count, evals passed), name every gate you
skipped and why, and say plainly whether you deployed — a green gate is not a
deployed revision.
