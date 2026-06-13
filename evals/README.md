# Captain Adel — eval harness

A small regression suite for the Captain Adel brain. It runs authored questions
through the **real** brain (`src/brain` → BM25 retrieval → the model) and scores
each answer against heuristic assertions.

The score is a **regression signal, not a proof of correctness** — it checks
keywords, citation shape, source presence and answer language. A human still
has to judge whether an answer is genuinely good. What this catches: a prompt or
model change that breaks citations, drops sources, leaks the system prompt,
stops refusing out-of-scope questions, or stops answering in Arabic.

## Files

- `cases.json` — the test cases. Each has a `question` and an `expect` block.
- `lib.js` — shared `score()` / `loadCases()` so the gate can never drift from
  what `run.js` reports.
- `run.js` — single-provider runner: executes cases, scores them, prints a report.
- `allam-smoke.js` — one-turn ALLaM endpoint ping. Run this *first* — it fails
  in a couple of seconds on a bad URL / wrong auth, instead of after 20 calls.
- `parity.js` — runs the suite through Gemini AND ALLaM, computes the gate
  that decides whether `MODEL_PROVIDER=auto` is safe to enable.

## Running it

```bash
# whole suite on Gemini (the default English path)
GEMINI_API_KEY=your_key  node evals/run.js

# one category — citation | refusal | injection | behaviour
GEMINI_API_KEY=your_key  node evals/run.js refusal

# against a self-hosted ALLaM endpoint
ALLAM_BASE_URL=http://host:8000/v1  node evals/run.js --provider allam

# structure-only check, no API key, no model calls (safe for CI lint)
node evals/run.js --dry
```

Environment:

| Var | Default | Purpose |
|-----|---------|---------|
| `GEMINI_API_KEY` | — | required for a live Gemini / `auto` run |
| `ALLAM_BASE_URL` | — | required for a live `--provider allam` run |
| `CAPTAIN_ADEL_MODEL` | `gemini-2.5-flash` | Gemini model override |
| `EVAL_DELAY_MS` | `4000` | pause between turns, to stay under the free-tier RPM |

The runner **exits 0 only if every case passes**, so it can gate CI.

## The `expect` schema

| Field | Meaning |
|-------|---------|
| `citesPart` | answer must reference `Part N` for one of these |
| `mustInclude` | every keyword must appear (case-insensitive) |
| `mustIncludeAny` | at least one keyword must appear |
| `mustNotInclude` | none of these may appear |
| `shouldHaveSources` | whether `result.sources` should be non-empty |
| `answerLang` | `ar` or `en` — script the answer should be written in |

## Gating ALLaM

`parity.js` automates the gate. Before running it, ping the endpoint:

```bash
ALLAM_BASE_URL=http://host:8000/v1  npm run allam:smoke
```

Then run the gate:

```bash
GEMINI_API_KEY=...  ALLAM_BASE_URL=...  npm run eval:parity
```

The gate is two conditions, both of which must hold:

1. **Arabic subset** — ALLaM passes ≥ Gemini passes on cases the auto router
   would actually send to ALLaM (`answerLang === 'ar'` or Arabic-dominant
   question).
2. **Overall** — ALLaM doesn't regress by more than `--tol N` cases overall
   (default 0). ALLaM is the cross-provider fallback for English too, so an
   overall regression matters.

Exit 0 means "flip `MODEL_PROVIDER=auto`"; exit 1 means "keep
`MODEL_PROVIDER=gemini`; ALLaM remains available as a manual override and as
the fallback."

Note: `citesPart` looks for the English "Part N"; the Arabic cases assert on
`answerLang` + sources rather than the English citation token.
