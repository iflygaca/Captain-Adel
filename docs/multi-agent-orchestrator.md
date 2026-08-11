# Captain Adel — multi-agent orchestrator (v1)

**Status:** reference design · runnable boilerplate in [`examples/multi-agent-orchestrator/`](../examples/multi-agent-orchestrator/)
**Owner surface:** none — deliberately decoupled from `src/` (the brain stays portable)

---

## Why this exists

Some questions are too wide for one context window: "compare X across ten dimensions",
"audit this corpus for Y", "research Z from five angles and reconcile". The answer is not a
bigger prompt — it is a **swarm**: one lead model that *decomposes* the task, 5–15 worker
models that each own one narrow subtask in an **isolated context**, and one synthesis pass
that reconciles their structured results.

This doc is the production shape of that pattern on Anthropic's Claude API, and
[`examples/multi-agent-orchestrator/`](../examples/multi-agent-orchestrator/) is the same
shape as ~300 lines of runnable Python and TypeScript. It is **not** a new entry for
`src/brain/providers/` and it is not on the `/v1/chat` request path — `docs/models.md`
already lists Claude Sonnet/Haiku as *candidate* agentic models, and that decision stays
separate (see the PDPL boundary at the bottom).

---

## Topology

```
                        user / eval harness
                                │  question
                                ▼
                 ┌───────────────────────────────────┐
                 │  LEAD ORCHESTRATOR                │
                 │  claude-sonnet-5                  │
                 │  decompose() → strict JSON plan   │
                 │  { subtasks: [5..15] }            │
                 └────────────────┬──────────────────┘
                                  │   task ledger lives in CODE,
                                  │   never inside a prompt
        ┌─────────────────────────┼─────────────────────────┐
        │  warm-first: worker #1 runs alone and writes the  │
        │  prompt cache; the other N−1 then fan out under   │
        │  a concurrency semaphore (default 8)              │
        ▼                         ▼                         ▼
┌────────────────┐      ┌────────────────┐        ┌────────────────────┐
│ WORKER w1      │      │ WORKER w2      │  ...   │ WORKER wN          │
│ claude-haiku-  │      │ claude-haiku-  │        │ claude-sonnet-5    │
│ 4-5            │      │ 4-5            │        │ (difficulty:hard)  │
│ sees ONLY:     │      │ isolated ctx   │        │ isolated ctx       │
│ · system rules │      └───────┬────────┘        └─────────┬──────────┘
│ · context pack │              │                           │
│ · its own brief│              │  strict JSON WorkerResult │
└───────┬────────┘              │  (schema-validated; one   │
        │                       │  retry; else failed:true) │
        └───────────────────────┼───────────────────────────┘
                                ▼
                 ┌───────────────────────────────────┐
                 │  SYNTHESIZER                      │
                 │  claude-sonnet-5, streamed        │
                 │  input: worker RESULTS only —     │
                 │  never worker transcripts         │
                 └────────────────┬──────────────────┘
                                  ▼
                  final markdown report + usage/cost ledger
```

| Role | Model | `max_tokens` | Output |
|---|---|---|---|
| Decomposer | `claude-sonnet-5` | 8192 | strict JSON `DecompositionPlan` |
| Worker (standard) | `claude-haiku-4-5` | 4096 | strict JSON `WorkerResult` |
| Worker (hard, escalated) | `claude-sonnet-5` | 8192 | strict JSON `WorkerResult` |
| Synthesizer | `claude-sonnet-5` | 16000, streamed | markdown report |

Sonnet 5 runs **adaptive thinking by default** and `max_tokens` caps thinking *and* text
together — that is why every Sonnet row gets more headroom than the Haiku rows. Haiku 4.5
does not take the `output_config.effort` parameter (it errors); never send it to a worker
that might be Haiku.

---

## Which surface — and why raw Messages API

Four ways to build a multi-agent system on Claude, split by who owns the loop:

| Surface | Who owns the loop | Who hosts | Context isolation | Fit for this pattern |
|---|---|---|---|---|
| **Messages API orchestration** (this design) | your code | you | absolute — you assemble every request | ✅ deterministic decompose → fan-out → synthesize |
| SDK Tool Runner (`client.beta.messages.toolRunner`) | the model (SDK drives the tool loop) | you | one shared conversation | model *chooses* tools mid-loop — good for agents, wrong for a fixed pipeline |
| Managed Agents `multiagent` (coordinator roster) | Anthropic's orchestration layer | Anthropic (per-session sandbox) | per-thread | hosted long-running sessions with filesystem/skills/MCP; heavier than needed here |
| Claude Agent SDK subagents | Claude Code harness | you | per-subagent | batteries-included coding/filesystem agents — a different product, not a Messages pattern |

The verdict: when the pipeline shape is *known* — decompose, fan out, synthesize, always in
that order — the loop belongs in code, not in a model's tool-choice policy. Workers are not
tools the model may or may not call; they are scheduled jobs. Graduate to Managed Agents
`multiagent` when you need hosted sessions, a sandbox filesystem, or open-ended delegation;
reach for the Agent SDK when the job is "operate on a repo like Claude Code does".

---

## Context isolation & the shared pack

The whole point of a swarm is that contexts **don't** bleed:

- A worker sees exactly three things: the worker **system rules**, the shared **context
  pack**, and **its own brief**. Nothing else. Not the other briefs, not the plan, not the
  user's full conversation.
- Workers never talk to each other. Results flow through the orchestrator only.
- The synthesizer sees worker **results** (validated JSON), never worker transcripts.
- The task ledger — which subtask is pending/done/failed, retries, token spend — lives in
  ordinary program state. Putting orchestration state inside prompts is how context
  pollution starts.
- Large artifacts (files, corpora, long outputs) are passed **by reference** (a path, an
  id), never inlined into a sibling's context.

The shared pack is also the **prompt-cache** unit. Caching is a byte-exact prefix match, so
every worker request is assembled as:

```
system[0]  worker rules            (identical bytes for every worker)
system[1]  context pack            (identical bytes)  ← cache_control: {type: "ephemeral"}
user       this worker's brief     (the only part that varies)
```

Three rules make it pay:

1. **Warm-first fan-out.** A cache entry is only readable after the first response begins.
   Fire worker #1 alone, then release the other N−1 — they read the cache #1 just wrote
   (~0.1× input price) instead of all paying the cold write.
2. **Caches are per-model.** Haiku workers share one cache; Sonnet-escalated workers form
   their own; the orchestrator's calls a third. The production refinement is warm-first
   *per model tier*.
3. **Minimums are real.** The minimum cacheable prefix is **1024 tokens on Sonnet 5** and
   **4096 on Haiku 4.5**. The demo pack in the example (~1.2K tokens) clears Sonnet's bar
   but not Haiku's — the marker is correct-by-construction and silently inert on Haiku
   until the pack grows (a real retrieval pack will clear 4096 easily). Verify with
   `usage.cache_read_input_tokens`; zero across identical-prefix calls means a byte drifted
   or the prefix is under the minimum.

---

## Contracts

Everything crossing a context boundary is **strict JSON** (structured outputs:
`output_config.format` / `messages.parse()`, `additionalProperties: false` everywhere).
Markdown is only for the human-facing synthesis.

```jsonc
// Orchestrator → workers (DecompositionPlan)
{
  "subtasks": [
    {
      "id": "w1",
      "role": "researcher",          // researcher | analyst | critic
      "difficulty": "standard",      // standard → haiku · hard → sonnet
      "brief": "…one self-contained task; the worker sees nothing else…",
      "deliverable": "…what a good answer looks like…"
    }
  ]
}

// Worker → orchestrator (WorkerResult)
{
  "subtask_id": "w1",
  "summary": "…3–5 sentences…",
  "findings": [
    { "claim": "…", "confidence": 0.8, "notes": "…evidence from the pack, or 'assumption'…" }
  ],
  "open_questions": ["…"]
}
```

The structured-outputs schema language does **not** enforce numeric bounds — the 5–15
subtask cap, unique ids, and `confidence ∈ [0,1]` are clamped **in code** after parsing.
Schemas guarantee shape; code guarantees invariants.

---

## Guardrails — cost & rate limits

| Guardrail | Mechanism |
|---|---|
| Concurrency | semaphore, default **8** in-flight workers (tune 5–15). Backpressure, not fire-and-forget. |
| Rate-limit headroom | Sonnet and Haiku draw from **separate rate-limit buckets** — a Haiku fleet cannot starve the orchestrator's Sonnet budget, and vice versa. |
| 429 / 5xx | the SDK auto-retries (default `max_retries=2`, honors `retry-after`). On top: **exactly one** app-level worker re-dispatch with jitter, then the worker is recorded `failed` and the run degrades to partial synthesis. |
| Typed failures | catch the typed chain, most-specific first — Python `RateLimitError → APIStatusError → APIConnectionError`; TypeScript `RateLimitError → APIConnectionError → APIError` (order load-bearing: TS `APIConnectionError` subclasses `APIError`). Never string-match error messages. |
| Worker lifetime | workers are **single-shot and stateless**: bounded `max_tokens`, a per-call timeout (Python `client.with_options(timeout=120.0)` — *seconds*; TS request option `{timeout: 120_000}` — *milliseconds*), no long-lived worker state to leak or babysit. |
| Long outputs | the synthesis call streams (`messages.stream()` → `get_final_message()` / `finalMessage()`). Anything above ~16K output tokens must stream or it risks SDK HTTP timeouts. |
| Spend visibility | every response's `usage` is folded into a run **ledger** (input / output / cache-read / cache-write per model → dollars). No accounting, no tuning. |

Pricing that the ledger uses (per MTok, standard tier):

| Model | Input | Output | Cache read (0.1×) | Cache write (1.25×, 5m TTL) |
|---|---|---|---|---|
| `claude-sonnet-5` | $3.00 ¹ | $15.00 ¹ | $0.30 | $3.75 |
| `claude-haiku-4-5` | $1.00 | $5.00 | $0.10 | $1.25 |

¹ introductory $2.00 / $10.00 through 2026-08-31.

Back-of-envelope for one run: `N_workers × (pack+brief input + result output) + 2 Sonnet
calls`. At demo sizes (6–8 workers, ~1.2K-token pack, ~700-token results) that is roughly
**$0.05–0.15 per run** — dominated by the Sonnet synthesis. Two scaling levers when the
fan-out grows: move wide, non-urgent sweeps to the **Batches API** (50% price, results
within 24h), and grow the shared pack rather than the per-worker briefs (cached tokens are
~10× cheaper than fresh ones).

---

## Failure modes

| Failure | Policy |
|---|---|
| Decomposition parse/API failure | one retry, then **abort** — it is the root of the run; nothing downstream is meaningful. |
| Worker schema-invalid output | one re-dispatch (model nondeterminism is real), then recorded `failed`. |
| Worker timeout / rate-limit after retries | recorded `failed`; the run continues. |
| Any workers failed | synthesis proceeds on the survivors and **must name the gaps** — the failed subtask list is passed to the synthesizer explicitly. Silent partial coverage is the failure mode to fear. |
| All workers failed | abort, print the ledger anyway (the spend already happened; account for it). |

---

## Swapping in Captain Adel's retrieval

The demo's inline `CONTEXT_PACK` is a stand-in for exactly what
[`src/brain/retrieve.js`](../src/brain/retrieve.js) already produces: BM25 hits widened by
parent–child expansion into full GACAR sections. The mapping is one-to-one —

- **context pack** ⇐ `retrieve()` output for the run's question (the shared, cacheable prefix);
- **brief** ⇐ one facet of the user's question per worker;
- **worker rules** ⇐ the cite-or-refuse contract from [`src/brain/grounding.js`](../src/brain/grounding.js):
  answer only from the pack, cite `Part X §X.YYY`, refuse to guess — so worker `findings[]`
  arrive pre-shaped for grounding checks.

And the hard boundary, stated plainly: **PDPL.** Real user questions are personal data and
must be processed in-Kingdom; the Anthropic API is not served from a KSA region. So this
pattern is **dev / evals / authoring tooling** — corpus audits, eval generation, doc
research — until that changes. It is *not* a `MODEL_PROVIDER` candidate and must not be
wired into `/v1/chat`. (Same rule the HF/US dev endpoints already live under — see
`CLAUDE.md` → Compliance.)

---

## Running it

See [`examples/multi-agent-orchestrator/README.md`](../examples/multi-agent-orchestrator/README.md).
Both entry points need only `ANTHROPIC_API_KEY`; a demo run costs ~$0.05–0.15 and prints
the streamed report followed by the per-model token/cost ledger.
