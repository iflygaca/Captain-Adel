---
description: Run the parity gate that gates MODEL_PROVIDER=auto, and read it correctly
argument-hint: [jais|fanar|qwen|commandr]
allowed-tools:
  - Bash
  - Read
  - Grep
  - Edit
---

Compare a candidate provider against Gemini. Bare `eval:parity` already defaults
to **ALLaM** — there is no `:allam` variant.

```bash
npm run eval:parity            # vs ALLaM
npm run eval:parity:$1         # jais | fanar | qwen | commandr
```

Needs `GEMINI_API_KEY` and the candidate's `<NAME>_BASE_URL` (plus `_MODEL` /
`_API_KEY` where the endpoint wants them). If either is missing, stop and say
so — do not report `eval:dry` as a parity result.

## Reading the result

- The rule is **match-or-beat**, and the **Arabic subset decides**. An overall
  win that regresses Arabic does not promote.
- Assertions come from `evals/cases.json`: `citesPart`, `mustInclude`,
  `mustIncludeAny`, `mustNotInclude`, `shouldHaveSources`, `answerLang`,
  `kind` (`grounded` / `partial` / `refusal` / `na`), optional `history`.
- Scoring lives in `evals/lib.js` and is shared with `run.js` so verdicts never
  drift between the two runners. If scoring looks wrong, fix it **there**.
- A refusal that should have been grounded and a grounded answer that should
  have refused are both failures. Do not trade refusal discipline for coverage.

## After a promotion

Only once parity passes: change the default provider, and record what you
measured — provider, model, date, Arabic and English scores — in
`docs/models.md`. Remember PDPL: a provider that cannot run in-Kingdom cannot be
the production default regardless of score.
