# Multi-agent orchestrator — runnable boilerplate

The runnable half of [`docs/multi-agent-orchestrator.md`](../../docs/multi-agent-orchestrator.md):
one lead orchestrator (`claude-sonnet-5`) decomposes a research question into 5–15
self-contained subtasks, a swarm of isolated workers (`claude-haiku-4-5`, escalating to
`claude-sonnet-5` for hard subtasks) executes them in parallel, and a streamed synthesis
pass reconciles the structured results. Python and TypeScript implementations mirror each
other section-for-section — read whichever language you'll build in.

Deliberately decoupled from the Captain Adel service: nothing here imports from `src/`,
and per PDPL this pattern is dev/eval/authoring tooling only (see the design doc's
"Swapping in Captain Adel's retrieval" section for both points).

## Run it

Both entry points need exactly one thing:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
```

**Python (3.10+):**

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python orchestrator.py                          # built-in demo question
python orchestrator.py "your question" --concurrency 6
```

**TypeScript (Node 20+):**

```sh
npm install
npm start                                       # built-in demo question
npm start -- "your question" --concurrency 6
```

`npm run typecheck` runs `tsc --noEmit`.

## What a run looks like

Progress lines (decomposition plan, per-worker completions, failures) go to **stderr**;
the streamed synthesis report goes to **stdout**; the per-model token/cost ledger prints
last on stderr. So `python orchestrator.py > report.md` captures just the report.

A demo run costs roughly **$0.05–0.15** (6–10 workers, dominated by the Sonnet synthesis;
priced at standard-tier stickers, so the estimate errs high while Sonnet 5 introductory
pricing lasts).

## Two honest caveats

- **Caching:** the demo context pack (~1.2K tokens) clears `claude-sonnet-5`'s 1024-token
  minimum cacheable prefix but not `claude-haiku-4-5`'s 4096 — so Haiku workers will show
  `cache_read=0` in the ledger until you grow the pack (a real retrieval pack clears 4096
  easily). The cache layout and warm-first fan-out are still correct-by-construction.
- **Demo data:** the built-in context pack is synthetic. The pattern's point is that
  workers ground themselves in *whatever pack you inject* — swap in your retrieval
  layer's output and the same code holds.
