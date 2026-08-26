---
name: flight-instructor-personas
description: The procedure for changing how Captain Adel sounds — the tenant/body split, exam-mode framing, the GACA-relationship wording, and which files own which words. Use for any edit to system-prompt.js, tenants.js, or user-facing assistant copy.
---

# Changing the instructor's voice

Role context belongs to the `prompt-steward` agent. This is the procedure, and
the first rule is knowing which file owns the words you are about to change.

## The split

**One brain serves two products.** The body — voice, citation rule, retrieval
discipline, safety posture, output template — is product-neutral and lives in
`src/brain/system-prompt.js`. Only **two short strings** differ per product, in
`src/brain/tenants.js`, interpolated by `composeSystemInstruction()`:

| Tenant | What it is |
| --- | --- |
| `captadel` | The standalone service at captadel.com; points users at the official GACA publication at gaca.gov.sa |
| `flygaca` | Captain Adel embedded in the Fly GACA library; may link `[the library](library.html)` |

Both frame him as *modeled on a senior Saudi captain holding GACA ATPL, CFII and
MEL ratings*.

**So:** a change that should apply to both products goes in the body. A change
to identity or where the user is pointed goes in the tenant. Putting
product-specific wording in the body is the mistake this section exists to
prevent — it silently changes the other product's voice too.

## Exam mode is a different voice

`POST /v1/chat` with `mode: 'exam'` appends `EXAM_MODE_NOTE`, which reframes him
as the **examiner** in a GACA-style oral checkride:

- One focused question at a time — never a list.
- On the candidate's answer: grade it against the **retrieved** GACAR text — what
  was right, what was missing or wrong, the correct rule with its citation.
- A one-word verdict — **Pass, Partial, or Review** — then the next question.
- Rigorous but encouraging. Every regulatory claim grounded and cited; if it
  cannot be grounded, say so.

Editing exam-mode wording changes how a checkride rehearsal grades. Coordinate
with `curriculum-author` rather than changing scoring language in isolation.

## The wording that is not yours to soften

- **Cite or refuse.** The persona never talks its way around a missing citation.
  "Warm" and "encouraging" describe tone, never a licence to fill a gap with a
  plausible paraphrase.
- **The GACA relationship.** Fly GACA and Captain Adel are **not affiliated with
  GACA**. No copy may imply endorsement, official status, or that the service
  speaks for the authority. This is load-bearing across the family, not just
  here.
- **Culturally aware, not patronising.** The Saudi framing is in the identity
  line; it does not license stereotype or over-familiarity.
- **Safety-critical content is never simplified or speculated.**

## Bilingual

The site is Arabic-first authored with `data-en` alternates, and the brain has
its own Arabic directive and read-strategy note. Any wording change is tested in
**both** languages — a prompt edit that reads well in English can change Arabic
behaviour, and the Arabic subset is what the parity gate weighs most.

## Before you hand back

```bash
npm run test:unit
npm run eval:dry          # structure without keys
npm run eval              # live — needs GEMINI_API_KEY
```

A prompt change without a live eval behind it is a guess. If you could not run
the live eval, **say so** — `eval:dry` does not stand in for it. Then paste one
real answer in each language showing the voice you changed.
