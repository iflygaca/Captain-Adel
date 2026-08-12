# Multi-agent eval-case drafting

Grounds itself in the **real** GACAR corpus (`src/brain/retrieve.js` — the same
retrieval the running service uses) and fans a `claude-sonnet-5`-lead /
`claude-haiku-4-5`-worker swarm out over one GACAR Part to draft candidate
[`evals/cases.json`](../cases.json) entries. Design:
[`docs/multi-agent-orchestrator.md`](../../docs/multi-agent-orchestrator.md).

**Why it exists:** `citesPart` in `evals/cases.json` today only ever names
Parts **91**, **61**, and **67** — every other GACAR Part, including 12 of the
15 "daily-use" T1 Parts (121 air-carrier ops, 135 commuter/on-demand, 141
pilot schools, 145 maintenance orgs, and more), has zero eval coverage. This
tool targets that gap.

**Unlike** [`examples/multi-agent-orchestrator/`](../../examples/multi-agent-orchestrator/)
(deliberately decoupled from `src/`), this tool imports the real brain's
retrieval and grounding modules on purpose — that's the point: drafts are
grounded in genuine corpus passages, not an inline synthetic pack. Still
dev/eval-only per PDPL: the Anthropic API isn't served in-Kingdom, so this
never touches `/v1/chat` or a `MODEL_PROVIDER`.

## Run it

```sh
cd evals/gen-cases
npm install
export ANTHROPIC_API_KEY=sk-ant-...

node generate.js 121                                  # 6 EN drafts for Part 121
node generate.js 145 --count 8 --language mixed        # 8 drafts, half AR half EN
node generate.js 121 > drafts/part-121.json             # redirect the draft to a file
```

Progress, per-worker rejections, and the token/cost ledger print to **stderr**;
the validated draft array (matching `cases.json`'s exact per-case shape)
prints to **stdout** — so `> file.json` captures just the drafts. A run costs
roughly **$0.02–0.08** for a 6-case draft (cheaper than the generic
orchestrator demo — no synthesis pass, just decompose + fan-out + validate).

If the Part has no retrievable passages (some T2/T3 Parts are thin or
uncatalogued), the tool says so and exits — that's a legitimate result, not a
bug.

## The human-review workflow — this tool never writes to `cases.json`

Every draft is validated in code before being printed: its citation must
parse to the target Part via the same regex `src/brain/grounding.js` uses on
real answers, and its `sourceQuote` must be a verbatim substring of the
passage it claims to cite — a worker that fabricates a figure or a citation
gets **rejected**, not silently included. Passing validation only means the
draft isn't fabricated; it does **not** mean the question, category, or
assertions are actually good eval design. A human must:

1. Read each drafted case.
2. Trim/rewrite `mustInclude`/`mustIncludeAny` to what actually matters.
3. Copy the vetted entries into `evals/cases.json` by hand.
4. Run `npm run eval:dry` (structure) and ideally a live `npm run eval` pass
   before committing.

`drafts/` is `.gitignore`d — raw output never lands in version control by
accident.
