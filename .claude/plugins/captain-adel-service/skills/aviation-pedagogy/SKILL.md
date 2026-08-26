---
name: aviation-pedagogy
description: The procedure for adding or revising mock-exam material — the quiz.json shape, what makes a question shippable, how exam-core selects and scores, and which pedagogy claims this repo actually implements. Use when writing questions, changing exam length or pass mark, or touching the practice/exam surface.
---

# Writing curriculum that can ship

Role context — what the curriculum surface is — belongs to the
`curriculum-author` agent. This is the procedure.

A candidate sits a real GACA checkride after this material. Every question is a
claim about the regulations, and a wrong one teaches a pilot something false, so
the bar is the brain's own: **cite the Part and section, or don't ship it.**

## The shape you are editing

`public/assets/data/quiz.json` holds the whole static bank:

| Field | What it is |
| --- | --- |
| `exam` | `{ title, questions, minutes, passMark }` — **25 questions, 30 minutes, 75%** today, governing the entire surface |
| `banks[]` | **13 topic banks**, each `{ id, title, desc, source, questions, titleAr, descAr }` |
| `banks[].source` | The GACAR Part the bank draws on |
| `questions[]` | `{ q, options, answer, explain }` — `answer` is a **0-based index** |

174 questions across the 13 banks as of this writing. `exam-core.js` validates
`passMark` as an integer in 1–100 and falls back to 75.

## Rules for a question

- **Cite the Part and section in `explain`**, in the brain's own form
  (`GACAR §91.155`). No citation, no ship.
- **Stay inside the bank's `source` Part.** A Part 91 bank does not get a
  Part 61 currency question.
- **Only GACAR material may be labelled GACAR.** ICAO or FAA material that
  happens to be similar is not a GACAR citation.
- **`answer` is an index, never a letter.** Option order is randomised at
  runtime and remapped by `exam-core.js`, so an `explain` that says "option B"
  is broken the moment it shuffles.
- **Distractors are plausible and wrong** — each should trace to a rule
  candidates genuinely confuse, not be absurd filler.
- **Bilingual ships together.** The site is Arabic-first authored with `data-en`
  alternates, and banks carry `titleAr`/`descAr`. Learner-visible chrome lands
  in both languages in the same change.

## What exam-core actually does

Seeded question selection, option-order randomisation **with answer remap**,
scoring (`pass: pct >= passMark`), a weakest-first topic breakdown,
resume-snapshot validation, and the bilingual debrief prompt builders. It is
DOM-free and unit-tested by `test/exam-core.test.js`; `exam.js` is the pure-DOM
half.

## Pedagogy: what is implemented, and what is only stated

`CLAUDE.md` describes a three-tier progression (knowledge-check → skill-check →
performance-check), mastery gates at ≥80%, a spaced-repetition schedule
(1d/3d/7d/30d) and confusion detection feeding curriculum review.

**None of that exists in the code.** Those terms have no occurrence anywhere in
`src/` or `public/assets/js/`. What exists is: one 25-question exam at a 75%
pass mark, topic-filtered untimed practice, and a weakest-first breakdown after
scoring. Treat the rest as a design intent for the roadmap — do not write code
comments, docs or learner-facing copy implying a mastery gate or a repetition
schedule is running, and do not quote "≥80%" as this product's threshold when
the shipped figure is 75%.

Likewise **AIRAC freshness is not a mechanism here.** AIRAC appears only as exam
*content* (a question about the 28-day cycle) and one line of the system prompt.
There is no staleness check in this repo; the implementation lives in
`ay2m/FlyGACA` (`src/calc/airac.ts`).

## Before you hand back

```bash
npm run test:unit        # covers exam-core
npm run smoke:frontend   # static audit of the public pages
```

Then state how many questions you added or changed and list the sections you
cited, so a human can spot-check them.
